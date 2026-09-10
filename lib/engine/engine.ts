import type { SimulationSettings } from "../config/settings";
import { DEFAULT_SETTINGS, MAX_SIMULATED_VIEWERS } from "../config/settings";
import type {
  CandidateRequest,
  GenerationPhase,
  IdleStage,
} from "../ai/provider";
import type { QueuedReaction, Reaction } from "../ai/reaction";
import { MAX_EMOTES_IN_PROMPT } from "../ai/prompt";
import { shouldReact } from "./attention";
import { classify } from "./classifier";
import { directOne } from "./director";
import {
  FAILURE_BACKOFF_MS,
  batchSizeFor,
  idleStageFor,
  lowWaterFor,
} from "./generation";
import { Population } from "./population";
import { createFilter, type Filter } from "./profanity";
import { createRng, type Rng } from "./rng";
import { Scheduler } from "./scheduler";
import { TopicTracker, type Topic } from "./topics";
import type { ChatMessage, Classification, Emote, Intent } from "./types";

/**
 * The simulation engine.
 *
 * Owns the population, the scheduler, the conversation state, and the
 * decision of when the AI is asked for more. Deliberately free of React,
 * timers, network and DOM: the caller drives it with `tick(now)`, asks it
 * `nextGeneration(now)`, and hands back what the provider returned. That
 * makes the whole product loop testable at arbitrary speed with a scripted
 * provider, and reusable from a headless script.
 *
 * THE DIVISION OF LABOUR. The AI writes every line chat says. This engine
 * decides who says it, when, at what rate, whether they have already said
 * it, and which emote goes with it. Neither side does the other's job: there
 * is no pool of canned text anywhere in here, and the model never picks a
 * username or a timestamp.
 */

export interface EngineOptions {
  settings?: Partial<SimulationSettings>;
  emotes?: readonly Emote[];
  /** Fixed seed for reproducible runs. Defaults to Date.now(). */
  seed?: number;
  /** Wall-clock origin. Defaults to Date.now(). */
  now?: number;
}

/**
 * Rate multiplier when nothing is happening.
 *
 * One, not a fraction. The setting is a baseline the room holds while quiet,
 * and momentum adds on top — an earlier version floored this at 0.45 on the
 * theory that busy stretches would average it back up, which measured out at
 * 0.44x the configured rate across every setting.
 */
const RATE_FLOOR = 1;

/** How hard live topics push the rate above that baseline. */
const RATE_GAIN = 1.2;

/**
 * How long before a viewer may repeat a conversational action.
 *
 * Not about wording — about *doing the same thing twice*. "hey BlacBushido"
 * and "hey man !" share no words and are still one person greeting twice,
 * which is the half of the reported bug that text matching cannot see.
 *
 * Greeting and farewell are once per session: you arrive once and you leave
 * once. Nothing else is listed, and that is the point — reacting twice to a
 * fight, or firing off two lines while typing fast, is what people do.
 */
const ACTION_COOLDOWN_MS: Partial<Record<Intent, number>> = {
  greeting: Number.POSITIVE_INFINITY,
  farewell: Number.POSITIVE_INFINITY,
};

/**
 * How many speakers to try before giving the tick up.
 *
 * A rejected candidate means "not this person", not "not this message" — the
 * generated line is still good and someone else should say it. Bounded so a
 * room that has genuinely run out of eligible speakers waits instead of
 * spinning.
 */
const SPEAKER_ATTEMPTS = 4;

/** Chat lines kept for the prompt, so a refill does not echo them. */
const RECENT_LINES = 20;

/** Streamer inputs kept for the prompt. */
const HISTORY_LINES = 8;

export interface TranscriptOutcome {
  classification: Classification;
  /** False when the attention gate deliberately let it pass without reply. */
  reacted: boolean;
  /** Messages the director queued for it. */
  queued: number;
}

export interface EngineStats {
  /** Live viewer count. Drifts around the tier's band, never fixed. */
  audience: number;
  /** Viewers actually being simulated. */
  simulated: number;
  pending: number;
  released: number;
  bySource: Record<string, number>;
  /** Utterances the attention gate deliberately skipped. */
  ignored: number;
  phase: GenerationPhase;
  /** Generated lines waiting to be spoken. */
  queued: number;
}

/** What a batch was for, so a late reply can be recognised as stale. */
interface Pending {
  phase: GenerationPhase;
  /** Which streamer input it answers. Startup and idle carry none. */
  utteranceId: number;
  idleStage: IdleStage | null;
  intent: Intent;
}

/**
 * Collapses a line to what it actually says.
 *
 * Repeated letters, repeated words and punctuation go, because "hey",
 * "heyyyy", "hey!!" and "KEKW KEKW KEKW" against "KEKW" are one person saying
 * one thing several times, not several contributions.
 */
export function normaliseSaid(text: string): string {
  return text
    .toLowerCase()
    .replace(/(.)\1{1,}/g, "$1")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(\w+)( \1\b)+/g, "$1");
}

export class SimulationEngine {
  private settings: SimulationSettings;
  private readonly rng: Rng;
  private readonly population: Population;
  private readonly scheduler: Scheduler;
  private filter: Filter;

  private emotes: readonly Emote[];
  private readonly topics = new TopicTracker();
  /** When the rate governor says the next message should land. */
  private nextEmitAt: number;
  /** Monotonic, so two messages in the same millisecond get distinct ids. */
  private emitSequence = 0;
  /** Recent speakers as [viewerId, username]. */
  private recentSpeakers: Array<readonly [string, string]> = [];

  // ---------------------------------------------------------- conversation

  private phase: GenerationPhase = "startup";
  private lastSpeechAt: number;
  /** Streamer inputs this session, oldest first. Bounded for the prompt. */
  private history: string[] = [];
  private lastUtterance = "";
  private lastClassification: Classification | null = null;
  /** Counts accepted inputs, so a batch can say which one it answers. */
  private utteranceId = 0;
  /** Lines chat released recently, for the prompt's do-not-repeat list. */
  private recentLines: string[] = [];

  // ------------------------------------------------------------ generation

  /**
   * Generated lines waiting to be spoken, most eager first within a batch.
   *
   * This is the product: the AI decided what the room says, and the engine
   * decides who says it and when.
   */
  private reactions: QueuedReaction[] = [];
  private nextBatchId = 0;
  /** The request handed out by nextGeneration() and not yet resolved. */
  private inFlight: Pending | null = null;
  /** What the queue currently holds, for staleness checks. */
  private current: Pending | null = null;
  private lastFailureAt = Number.NEGATIVE_INFINITY;
  /** Batches served this phase. Startup uses it to greet only once. */
  private phaseBatches = 0;
  /** Paused: nothing is planned and nothing is released. */
  private paused = false;

  // ------------------------------------------------------ viewer memory

  /**
   * Every line each viewer has said this session, normalised.
   *
   * Session-scoped rather than a rolling window: a viewer who says "hey" in
   * minute one and "heyyy" in minute forty has still said it twice.
   */
  private viewerTexts = new Map<string, Set<string>>();
  /** Per viewer, when they last performed each conversational action. */
  private viewerActions = new Map<string, Map<Intent, number>>();

  // ---------------------------------------------------------------- misc

  private previousIntent: Classification["intent"] | undefined;
  private previousText = "";
  private previousWasIgnored = false;
  private viewerCount = 0;
  private lastViewerDriftAt = 0;
  private releaseTimes: number[] = [];
  private ignoredCount = 0;
  private releasedCount = 0;
  private readonly sourceCounts: Record<string, number> = {};

  constructor(options: EngineOptions = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...options.settings };
    this.rng = createRng(options.seed);
    this.emotes = options.emotes ?? [];
    this.filter = createFilter(this.settings);

    this.population = new Population(this.rng, this.simulatedViewers());
    this.scheduler = new Scheduler(this.effectiveRateLimit());

    const now = options.now ?? Date.now();
    this.lastSpeechAt = now;
    this.nextEmitAt = now;
    this.lastViewerDriftAt = now;
    // Land somewhere inside the band rather than climbing to it from zero
    // while the streamer watches.
    const [low, high] = viewerBandFor(this.settings.messagesPerSecond);
    this.viewerCount = Math.round(this.rng.float(low, high));
  }

  /**
   * Safety valve, not a target.
   *
   * The Poisson emitter already tracks messagesPerSecond; this exists only to
   * stop a defect from flooding the renderer. Headroom above the target so
   * legitimate high-momentum stretches are never clipped.
   */
  private effectiveRateLimit(): number {
    return Math.ceil(this.settings.messagesPerSecond * 60 * 1.6);
  }

  private simulatedViewers(): number {
    return Math.min(this.settings.audienceSize, MAX_SIMULATED_VIEWERS);
  }

  updateSettings(patch: Partial<SimulationSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.filter = createFilter(this.settings);
    this.scheduler.setRateLimit(this.effectiveRateLimit());
  }

  setEmotes(emotes: readonly Emote[]): void {
    this.emotes = emotes;
  }

  // ------------------------------------------------------------ lifecycle

  /**
   * Play. A fresh room: nobody has spoken, nobody has greeted, nothing is
   * queued. The first `nextGeneration` after this asks for the arrival batch.
   */
  beginSession(now: number): void {
    this.paused = false;
    this.phase = "startup";
    this.phaseBatches = 0;
    this.lastSpeechAt = now;
    this.nextEmitAt = now;
    this.history = [];
    this.lastUtterance = "";
    this.lastClassification = null;
    this.recentLines = [];
    this.recentSpeakers = [];
    this.viewerTexts.clear();
    this.viewerActions.clear();
    this.topics.reset();
    this.dropBatch();
    this.scheduler.reset();
  }

  /**
   * Pause. Nothing generated survives: resuming later and dumping reactions
   * to something said minutes ago is worse than losing them.
   */
  pause(): void {
    this.paused = true;
    this.dropBatch();
    this.scheduler.flush();
  }

  /** Resume. The silence clock restarts; the phase and the room carry on. */
  resume(now: number): void {
    this.paused = false;
    this.lastSpeechAt = now;
    this.nextEmitAt = now;
    if (this.phase === "idle") this.phase = this.history.length > 0 ? "active" : "startup";
  }

  /** Clears queued messages. Used on stop and clear. */
  flush(): void {
    this.dropBatch();
    this.scheduler.flush();
  }

  get currentPhase(): GenerationPhase {
    return this.phase;
  }

  /** How many generated lines are still waiting. Surfaced for the dev trace. */
  get pendingReactions(): number {
    return this.reactions.length;
  }

  // ------------------------------------------------------------ transcript

  /**
   * Feeds a finished utterance into the simulation.
   *
   * `audioEnergy` (0..1) sharpens the classifier's excitement estimate — the
   * words "oh no" mean different things shouted and muttered.
   */
  handleTranscript(
    transcript: string,
    now: number,
    audioEnergy?: number,
    /**
     * Bypasses the attention gate.
     *
     * Used for typed input: the streamer deliberately sent it, so chat
     * deciding not to notice is a bug rather than realism. Microphone input
     * still goes through the gate, because not every muttered sentence is
     * addressed to anyone.
     */
    force = false,
  ): TranscriptOutcome | null {
    const text = transcript.trim();
    if (text.length < 2) return null;

    const previousSpeechAt = this.lastSpeechAt;
    this.lastSpeechAt = now;

    const classification = classify(text, {
      audioEnergy,
      previousIntent: this.previousIntent,
      msSincePrevious: now - previousSpeechAt,
    });
    const repeatsPrevious = this.previousIntent === classification.intent;
    this.previousIntent = classification.intent;

    /**
     * Did the streamer repeat something chat just ignored?
     *
     * Only that combination forces a reaction. Repeating a sentence over and
     * over is not a signal — but saying it again straight after silence is
     * almost always because it did not land.
     */
    const normalised = normaliseUtterance(text);
    const repeatedAfterIgnore =
      normalised.length > 0 &&
      normalised === this.previousText &&
      this.previousWasIgnored;
    this.previousText = normalised;

    // Chat is allowed to simply not care. Reacting to every single utterance
    // is what makes generated chat feel relentless — real chat ignores most
    // background talk and answers what's aimed at it.
    if (
      !force &&
      !shouldReact(
        classification,
        {
          recentVolume: this.recentVolume(now),
          repeatsPrevious,
          repeatedAfterIgnore,
        },
        this.rng,
      )
    ) {
      this.ignoredCount++;
      this.previousWasIgnored = true;
      return { classification, reacted: false, queued: 0 };
    }

    this.previousWasIgnored = false;

    /**
     * Accepted. The conversation moves on, and everything generated for the
     * previous moment is stale: reactions to "I'll play Minecraft" are wrong
     * once they have said "actually Valorant". Queued lines are dropped;
     * lines already released are history and stay.
     */
    this.phase = "active";
    this.phaseBatches = 0;
    this.utteranceId += 1;
    this.lastUtterance = text;
    this.lastClassification = classification;
    this.history.push(text);
    if (this.history.length > HISTORY_LINES) this.history.shift();
    this.dropBatch();
    this.scheduler.trimBeyond(now, 1_500);

    const topic = this.topics.observe(classification, text, now);
    return { classification, reacted: topic !== null, queued: this.scheduler.pending };
  }

  // ------------------------------------------------------------ generation

  /**
   * What the AI should be asked for right now, if anything.
   *
   * The caller MUST resolve a returned request with either `supplyReactions`
   * or `generationFailed`; until it does, this returns null so a slow
   * provider is never asked twice for the same moment.
   *
   * Returns a request when:
   *   - the session just started (the arrival batch)
   *   - the queue is nearly empty and there is a moment to continue
   *   - silence crossed into idle, or into a later idle stage
   */
  nextGeneration(now: number): CandidateRequest | null {
    if (this.paused || this.inFlight) return null;
    if (now - this.lastFailureAt < FAILURE_BACKOFF_MS) return null;

    const silenceMs = now - this.lastSpeechAt;
    const stage = idleStageFor(silenceMs);

    /**
     * Into idle, or deeper into it.
     *
     * Either way what is queued was written for a room that had not yet
     * noticed the silence, or had noticed less of it. It goes.
     */
    if (stage !== null && this.phase !== "idle") {
      this.phase = "idle";
      this.phaseBatches = 0;
      this.dropBatch();
    } else if (stage !== null && this.current && this.current.idleStage !== stage) {
      this.dropBatch();
    }

    if (this.reactions.length > lowWaterFor(this.settings.messagesPerSecond)) {
      return null;
    }

    const count = batchSizeFor(this.settings.messagesPerSecond);
    const shared = {
      emotes: this.emotes.slice(0, MAX_EMOTES_IN_PROMPT).map((emote) => emote.name),
      recent: [...this.recentLines],
      streamer: this.settings.streamerName || undefined,
      topic: this.settings.streamTopic || undefined,
      count,
    };
    const silenceSeconds = Math.round(silenceMs / 1000);

    if (this.phase === "startup") {
      const first = this.phaseBatches === 0;
      this.inFlight = {
        phase: "startup",
        utteranceId: this.utteranceId,
        idleStage: null,
        // The first wave greets, once each. The next waves are chatter.
        intent: first ? "greeting" : "mundane",
      };
      return {
        ...shared,
        phase: "startup",
        utterance: "",
        history: [],
        classification: STARTUP_CLASSIFICATION,
        continuation: !first,
        silenceSeconds,
      };
    }

    if (this.phase === "idle") {
      this.inFlight = {
        phase: "idle",
        utteranceId: this.utteranceId,
        idleStage: stage,
        intent: "mundane",
      };
      return {
        ...shared,
        phase: "idle",
        utterance: this.lastUtterance,
        history: this.history.slice(0, -1),
        classification: this.lastClassification ?? STARTUP_CLASSIFICATION,
        continuation: false,
        silenceSeconds,
        idleStage: stage ?? 1,
      };
    }

    // Active. Nothing to react to without something said.
    if (!this.lastClassification) return null;
    const continuation = this.current?.utteranceId === this.utteranceId;
    this.inFlight = {
      phase: "active",
      utteranceId: this.utteranceId,
      idleStage: null,
      intent: continuation ? "mundane" : this.lastClassification.intent,
    };
    return {
      ...shared,
      phase: "active",
      utterance: this.lastUtterance,
      history: this.history.slice(0, -1),
      classification: this.lastClassification,
      continuation,
      silenceSeconds,
    };
  }

  /**
   * Accepts a generated batch for the request last handed out.
   *
   * Appended, not replaced: refills happen while a few lines from the same
   * moment are still queued, and those are still good. A batch that no
   * longer matches the moment — the streamer spoke while it was in flight —
   * is discarded, and the next `nextGeneration` asks for the right thing.
   */
  supplyReactions(batch: readonly Reaction[], now: number): void {
    const pending = this.inFlight;
    this.inFlight = null;
    if (!pending) return;

    const stale =
      pending.phase !== this.phase ||
      pending.utteranceId !== this.utteranceId ||
      (pending.phase === "idle" && pending.idleStage !== idleStageFor(now - this.lastSpeechAt));
    if (stale) return;

    if (batch.length === 0) {
      this.lastFailureAt = now;
      return;
    }

    const batchId = this.nextBatchId++;
    const queued: QueuedReaction[] = batch.map((reaction) => ({
      ...reaction,
      batchId,
      createdAt: now,
      intent: pending.intent,
      phase: pending.phase,
    }));
    // Most eager first within the batch. Absent eagerness sorts to the
    // middle, so an unannotated batch still releases in a plausible order.
    queued.sort((a, b) => (b.eagerness ?? 0.5) - (a.eagerness ?? 0.5));

    this.reactions.push(...queued);
    this.current = pending;
    this.phaseBatches += 1;
  }

  /** The request last handed out could not be fulfilled. Chat waits it out. */
  generationFailed(now: number): void {
    this.inFlight = null;
    this.lastFailureAt = now;
  }

  private dropBatch(): void {
    this.reactions = [];
    this.current = null;
    this.inFlight = null;
  }

  // ------------------------------------------------------------------ tick

  /**
   * Advances the simulation. Returns messages that should be rendered now.
   * Safe to call at any cadence; all timing is derived from `now`.
   */
  tick(now: number): ChatMessage[] {
    this.updateViewerCount(now);
    this.topics.prune(now);
    this.emitDue(now);

    const released = this.scheduler.tick(now);
    const visible: ChatMessage[] = [];

    for (const message of released) {
      const text = this.filter.apply(message.text);
      if (text === null) continue; // Dropped by the filter.

      const final = { ...message, text };
      this.population.markSpoke(final.viewerId, now);

      this.recentLines.push(text);
      if (this.recentLines.length > RECENT_LINES) this.recentLines.shift();
      this.recentSpeakers.push([final.viewerId, final.username]);
      if (this.recentSpeakers.length > 8) this.recentSpeakers.shift();

      this.releasedCount++;
      if (final.kind !== "idle") this.releaseTimes.push(now);
      this.sourceCounts[final.source] = (this.sourceCounts[final.source] ?? 0) + 1;
      visible.push(final);
    }

    return visible;
  }

  /**
   * Rate governor.
   *
   * Emits every message whose scheduled moment has arrived, then draws the
   * next gap. Gaps come from an exponential distribution, which is the correct
   * model for independent arrivals: it produces natural jitter for free and
   * its mean is exactly 1/rate, so timing variance costs nothing in rate
   * accuracy.
   */
  private emitDue(now: number): void {
    // A long pause between ticks must not fire a hundred backlogged messages.
    if (now - this.nextEmitAt > 5_000) this.nextEmitAt = now;

    let guard = 0;
    while (now >= this.nextEmitAt && guard++ < 32) {
      const at = this.nextEmitAt;
      this.produceOne(at);
      this.nextEmitAt = at + this.drawGap(at);
    }
  }

  /**
   * Instantaneous rate, scaled by how much is going on.
   *
   * Quiet chat runs at the configured target and busy chat above it, so one
   * setting means both "about one a second" and "the room goes wild when
   * something happens".
   */
  private drawGap(now: number): number {
    const activity = Math.min(1.9, this.topics.activity(now));
    const rate = this.settings.messagesPerSecond * (RATE_FLOOR + RATE_GAIN * activity);
    // 1 - next() so the draw is (0,1] and the logarithm is always finite.
    return (-Math.log(1 - this.rng.next()) / Math.max(0.05, rate)) * 1000;
  }

  /**
   * One message, if there is anything generated to say.
   *
   * AI or nothing. If the queue is empty the room is quiet until the next
   * batch lands — never a canned line standing in. The planner keeps the
   * queue topped up, so in a healthy session this only goes quiet for the
   * length of one request.
   */
  private produceOne(at: number): void {
    // Peeked, not popped. Consumed only once a message actually exists —
    // pulling it off first meant a tick with no available speaker silently
    // discarded a generated line.
    const reaction = this.reactions[0];
    if (!reaction) return;

    const topic = reaction.phase === "active" ? this.currentTopic(at) : null;
    const stage = topic ? this.topics.stageOf(topic, at) : "developing";
    const intent = reaction.intent ?? "mundane";

    const barred = this.restedFor(intent, at);

    /**
     * Retried rather than dropped.
     *
     * A viewer who would be repeating themselves disqualifies the *speaker*,
     * not the line. Returning here instead of trying someone else is what
     * made a busy moment go quiet: the generated line was still sitting in
     * the queue with a room full of people available to say it.
     */
    for (let attempt = 0; attempt < SPEAKER_ATTEMPTS; attempt += 1) {
      const result = directOne({
        topic,
        stage,
        band: this.topics.band(topic ? this.topics.momentumOf(topic, at) : 0),
        reaction,
        phase: reaction.phase ?? this.phase,
        excludeSpeakers: barred,
        population: this.population,
        settings: this.settings,
        emotes: this.emotes,
        recentSpeakers: this.recentSpeakers,
        now: at,
        sequence: this.emitSequence++,
        rng: this.rng,
      });
      if (!result) return;

      /**
       * Checked against the model's line as well as the rendered one: a
       * viewer who said "insane" must not say "insane KEKW" a minute later.
       * That is the same person saying the same thing with a sticker on it.
       */
      const said = result.message.source === "ai"
        ? [reaction.text, result.message.text]
        : [result.message.text];
      if (said.some((text) => this.echoesSelf(result.viewerId, text))) {
        // This person has said this. Someone else may not have.
        barred.add(result.viewerId);
        continue;
      }

      this.reactions.shift();
      for (const text of said) this.rememberSaid(result.viewerId, text, intent, at);
      if (topic) this.topics.recordParticipation(topic, result.viewerId);
      this.scheduler.enqueueAt(result.message, at);
      return;
    }

    /**
     * Nobody eligible could say this line right now.
     *
     * Delayed first: it goes to the back of the queue so the lines behind it
     * are not stuck, and it gets another chance once others have spoken. A
     * line that fails twice is one nobody in the room can say — everyone who
     * could has — and it is dropped rather than left to block the batch.
     */
    this.reactions.shift();
    const attempts = (reaction.attempts ?? 0) + 1;
    if (attempts < 2) this.reactions.push({ ...reaction, attempts });
  }

  // --------------------------------------------------------- viewer memory

  private echoesSelf(viewerId: string, text: string): boolean {
    return this.viewerTexts.get(viewerId)?.has(normaliseSaid(text)) === true;
  }

  /**
   * Viewers who may not perform this action yet.
   *
   * Computed before the director runs, so the exclusion reaches speaker
   * selection rather than throwing away a message after the fact.
   */
  private restedFor(intent: Intent, now: number): Set<string> {
    const cooldown = ACTION_COOLDOWN_MS[intent];
    const barred = new Set<string>();
    if (cooldown === undefined) return barred;
    for (const [viewerId, actions] of this.viewerActions) {
      const last = actions.get(intent);
      if (last !== undefined && now - last < cooldown) barred.add(viewerId);
    }
    return barred;
  }

  private rememberSaid(viewerId: string, text: string, intent: Intent, now: number): void {
    const said = this.viewerTexts.get(viewerId) ?? new Set<string>();
    said.add(normaliseSaid(text));
    this.viewerTexts.set(viewerId, said);

    const actions = this.viewerActions.get(viewerId) ?? new Map<Intent, number>();
    actions.set(intent, now);
    this.viewerActions.set(viewerId, actions);
  }

  // ------------------------------------------------------------------ misc

  /** Messages released in the last 30s. Drives the fatigue damper. */
  private recentVolume(now: number): number {
    const cutoff = now - 30_000;
    while (this.releaseTimes.length > 0 && this.releaseTimes[0] < cutoff) {
      this.releaseTimes.shift();
    }
    return this.releaseTimes.length;
  }

  /**
   * Displayed viewer count, drifting inside the band for the selected tier.
   *
   * The tier is the primary driver rather than a separate audience setting,
   * because the two were free to contradict each other: a chat emitting four
   * messages a second in front of eleven viewers is not a scene that happens.
   *
   * This is the *displayed* number and is deliberately far above the number
   * of simulated identities — a real stream with a thousand viewers has a few
   * dozen people talking, drawn from a huge silent pool.
   */
  private updateViewerCount(now: number): void {
    if (now - this.lastViewerDriftAt < 1200) return;
    this.lastViewerDriftAt = now;

    const [low, high] = viewerBandFor(this.settings.messagesPerSecond);

    // Pull toward the middle of the band, so a tier change migrates rather
    // than snapping, and a random walk cannot wander out of it.
    const middle = (low + high) / 2;
    const pull = (middle - this.viewerCount) * 0.06;

    // Churn scaled to the square root of the band, so the *proportional*
    // movement is similar at every tier.
    const churn = Math.sqrt(Math.max(1, middle)) * this.rng.float(-0.55, 0.55);

    // Activity nudges it up: a room that is talking is a room people join.
    const activity = this.topics.activity(now) * Math.sqrt(Math.max(1, middle)) * 0.12;

    const next = Math.round(this.viewerCount + pull + churn + activity);
    this.viewerCount = Math.max(low, Math.min(high, next));
  }

  /** The live topic a generated line belongs to: the most recent one. */
  private currentTopic(now: number): Topic | null {
    const active = this.topics.active(now);
    return active.length > 0 ? active[active.length - 1] : null;
  }

  stats(): EngineStats {
    return {
      audience: this.viewerCount,
      simulated: this.population.size,
      pending: this.scheduler.pending,
      released: this.releasedCount,
      ignored: this.ignoredCount,
      bySource: { ...this.sourceCounts },
      phase: this.phase,
      queued: this.reactions.length,
    };
  }
}

/** What arrival looks like to everything downstream: a room saying hello. */
const STARTUP_CLASSIFICATION: Classification = {
  intent: "greeting",
  sentiment: "positive",
  energy: 0.3,
  keywords: [],
  confidence: 1,
};

/**
 * Reduces an utterance to comparable words.
 *
 * Punctuation and casing are stripped because a speech recogniser does not
 * emit them consistently — the same sentence said twice can arrive as "wait,
 * what?" and "wait what", which must count as a repeat.
 */
function normaliseUtterance(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Displayed viewer band for each chat-speed tier.
 *
 * Chat speed and audience size are two views of the same thing — how busy the
 * stream is — so the tier owns both rather than letting a separate audience
 * setting contradict it. Bands are inclusive and deliberately wide, so the
 * count has somewhere to wander.
 */
export const VIEWER_BANDS: ReadonlyArray<readonly [rate: number, low: number, high: number]> = [
  [0.2, 3, 11],
  [0.5, 12, 24],
  [1, 25, 180],
  [1.5, 181, 500],
  [2, 501, 1000],
  [4, 1001, 4200],
];

export function viewerBandFor(messagesPerSecond: number): readonly [number, number] {
  // Nearest tier, so a hand-edited setting between two steps still resolves.
  let best = VIEWER_BANDS[0];
  for (const band of VIEWER_BANDS) {
    if (Math.abs(band[0] - messagesPerSecond) < Math.abs(best[0] - messagesPerSecond)) {
      best = band;
    }
  }
  return [best[1], best[2]];
}
