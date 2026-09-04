import type { SimulationSettings } from "../config/settings";
import { DEFAULT_SETTINGS, MAX_SIMULATED_VIEWERS } from "../config/settings";
import { shouldReact } from "./attention";
import { classify } from "./classifier";
import { directOne } from "./director";
import { TopicTracker, type Topic } from "./topics";
import type { QueuedReaction, Reaction } from "../ai/reaction";
import { Population } from "./population";
import { createFilter, type Filter } from "./profanity";
import { createRng, type Rng } from "./rng";
import { Scheduler } from "./scheduler";
import type { ChatMessage, Classification, Emote, Intent } from "./types";

/**
 * The simulation engine.
 *
 * Owns the population, the scheduler, and the flow from transcript to
 * scheduled message. Deliberately free of React, timers, and DOM: the caller
 * drives it with `tick(now)`, which makes the whole thing testable at
 * arbitrary speed and reusable from a headless script.
 */

export interface EngineOptions {
  settings?: Partial<SimulationSettings>;
  /** Overrides for the AI spending guard. Defaults are deliberately tight. */
  emotes?: readonly Emote[];
  /** Fixed seed for reproducible runs. Defaults to Date.now(). */
  seed?: number;
  /** Wall-clock origin. Defaults to Date.now(). */
  now?: number;
}

/**
 * How many times ONE viewer may post the identical message inside
 * REPEAT_WINDOW.
 *
 * Per-viewer, not global. A crowd all posting "W" at the same moment is real
 * chat and is the thing that makes a hype moment land — capping that made
 * bursts feel damped. What does not happen is one person posting the same
 * line over and over; that reads as a bot.
 */
const MAX_REPEATS_PER_VIEWER = 3;

/**
 * How many recent messages the repeat cap looks back over.
 *
 * Sized in messages rather than seconds so it tracks roughly how long a line
 * stays visible: the render buffer also scales with chat speed, so both
 * shrink in wall-clock terms together.
 */
const REPEAT_WINDOW = 250;

/** What the engine made of one utterance. Surfaced for the transcript panel. */
/**
 * How long background chatter holds off after chat reacts to something.
 *
 * Long enough for the burst to be the thing on screen, short enough that the
 * room does not go quiet before idle chatter takes over.
 */
/**
 * Queued messages above which the burst is considered to be carrying the room
 * on its own, and background chatter holds off.
 *
 * Two rather than zero: a single straggler queued three seconds out is not
 * motion, and waiting for it leaves a visible gap.
 */
/**
 * Rate multiplier when nothing is happening.
 *
 * One, not a fraction. The setting is a baseline the room holds while quiet,
 * and momentum adds on top — an earlier version floored this at 0.45 on the
 * theory that busy stretches would average it back up, which measured out at
 * 0.44x the configured rate across every setting. Sparse speech means most of
 * a session is idle, so the idle multiplier *is* the long-run average.
 */
const RATE_FLOOR = 1;

/** How hard live topics push the rate above that baseline. */
const RATE_GAIN = 1.2;

/** Constant pull toward off-topic chatter when picking a conversation. */
const AMBIENT_WEIGHT = 0.35;

/**
 * Share of messages that are deliberately not about what the streamer said.
 *
 * Seasoning: a viewer arriving late, two people talking to each other, a joke
 * that has nothing to do with anything. Real chat is never perfectly
 * synchronised, and a room where every single line answers the streamer reads
 * as a machine. Ten percent is enough to break that.
 */
/**
 * How long after `idleAfterSeconds` before chat is entirely idle-driven.
 *
 * The blend exists because a hard switch is audible: chat answering you one
 * second and discussing the weather the next reads as a mode change rather
 * than a room losing interest. Over this window the idle share ramps from
 * nothing to everything.
 */
const IDLE_FULL_AFTER_MS = 90_000;

/**
 * How readily idle chatter interrupts a batch that is still draining.
 *
 * Below one, so answers to what the streamer said keep priority even once the
 * room has started drifting.
 */
const IDLE_INTRUSION = 0.5;

/**
 * How long a generated batch stays usable.
 *
 * Long enough for a big moment to play out, short enough that chat is not
 * still answering something two topics ago.
 */
const REACTION_LIFETIME_MS = 45_000;

export interface TranscriptOutcome {
  classification: Classification;
  /** False when the attention gate deliberately let it pass without reply. */
  reacted: boolean;
  /** Messages the director queued for it. */
  queued: number;
}

export interface EngineStats {
  /** Live viewer count. Drifts around the configured audience, never fixed. */
  audience: number;
  /** Viewers actually being simulated. Capped — see MAX_SIMULATED_VIEWERS. */
  simulated: number;
  pending: number;
  released: number;
  bySource: Record<string, number>;
  /** Utterances the attention gate deliberately skipped. */
  ignored: number;
}

/**
 * How long before a viewer may repeat a conversational action.
 *
 * Not about wording — about *doing the same thing twice*. "hey BlacBushido"
 * and "hey man !" share no words and are still one person greeting twice,
 * which is the half of the reported bug that text matching cannot see.
 *
 * Greeting and farewell are once per session: you arrive once and you leave
 * once.
 *
 * Nothing else is listed, and that is the point. Reacting twice to a fight,
 * or firing off two lines while typing fast, is what people actually do —
 * a blanket cooldown here reads as a room of strangers taking turns. Wording
 * is governed separately, by exact-text memory, and pacing by the population's
 * own speaker cooldown.
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
 * room that has genuinely run out of eligible speakers goes quiet instead of
 * spinning.
 */
const SPEAKER_ATTEMPTS = 4;

/**
 * Collapses a line to what it actually says.
 *
 * Repeated letters and punctuation go, because "hey", "heyyyy" and "hey!!"
 * are one person saying hello three times, not three contributions.
 */
function normaliseSaid(text: string): string {
  return text
    .toLowerCase()
    .replace(/(.)\1{1,}/g, "$1")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export class SimulationEngine {
  private settings: SimulationSettings;
  private readonly rng: Rng;
  private readonly population: Population;
  private readonly scheduler: Scheduler;
  private filter: Filter;

  private emotes: readonly Emote[];
  private lastSpeechAt: number;
  private readonly topics = new TopicTracker();
  /** When the rate governor says the next message should land. */
  private nextEmitAt: number;
  /** Monotonic, so two messages in the same millisecond get distinct ids. */
  private emitSequence = 0;
  /** Recent speakers as [viewerId, username], for side-reply targeting. */
  private recentSpeakers: Array<readonly [string, string]> = [];
  /**
   * Templates used recently. Held back by the generators so chat doesn't
   * repeat itself verbatim — the loudest tell that lines are being sampled
   * from a fixed list.
   */
  private recentTexts: string[] = [];

  /**
   * Every line each viewer has said this session, normalised.
   *
   * Deliberately unbounded within a session rather than a rolling window: a
   * viewer who says "hey" in minute one and "heyyy" in minute forty has still
   * said it twice, and a window that forgets is a window that lets it through.
   * Bounded in practice by how much any one viewer speaks, and cleared when a
   * new session starts.
   */
  private viewerTexts = new Map<string, Set<string>>();

  /** Per viewer, when they last performed each conversational action. */
  private viewerActions = new Map<string, Map<Intent, number>>();
  /**
   * Who said what recently, for the per-viewer repeat cap.
   *
   * Separate from recentTexts, which tracks pool *templates*. Emote-only
   * messages and AI lines never go through a template, so they are invisible
   * to that memory.
   */
  private releasedTexts: Array<{ viewerId: string; text: string }> = [];

  /**
   * Audience reactions the AI generated for what the streamer said, waiting to
   * be released. Ordered most-eager first, so reflexive replies land before
   * the person who took a moment to type a sentence.
   *
   * This is the product: the AI decided what the room says, and the engine
   * decides who says it and when.
   */
  private reactions: QueuedReaction[] = [];
  private nextBatchId = 0;
  /**
   * True from Start until the streamer first says something.
   *
   * The room is arriving, not reacting. Intro content is released through the
   * same scheduler as everything else, but it must not survive the first real
   * utterance — greetings to an empty stream landing after the streamer has
   * started talking read as chat being a message behind.
   */
  private introducing = false;
  /** Viewers who already posted an intro line, so nobody arrives twice. */
  private introSpeakers = new Set<string>();

  private previousIntent: Classification["intent"] | undefined;
  /** Normalised previous utterance, for detecting a literal repeat. */
  private previousText = "";
  /** Whether chat ignored that previous utterance. */
  private previousWasIgnored = false;
  /** Live viewer count. Drifts around audienceSize — see updateViewerCount(). */
  private viewerCount = 0;
  private lastViewerDriftAt = 0;
  /** Release timestamps, used to compute reaction fatigue. */
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
    // Start near the target rather than at it, so the first render already
    // looks like a live number rather than the setting echoed back.
    this.viewerCount = Math.max(
      1,
      Math.round(this.settings.audienceSize * this.rng.float(0.92, 1.05)),
    );
  }

  /**
   * The rate cap scales with chat speed.
   *
   * maxMessagesPerMinute is a safety valve against a runaway director, not a
   * pacing control — leaving it fixed meant the top speed setting was clamped
   * straight back down to a readable trickle.
   */
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

  /** Actual viewers to simulate — the setting clamped to the real ceiling. */
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

  /**
   * Accepts a generated batch.
   *
   * Replaces rather than appends when the streamer has moved on: reactions to
   * "I'll play Minecraft" are wrong once they have said "actually Valorant",
   * and holding both is how chat ends up answering a question nobody asked.
   * Anything still unspoken from an older batch is dropped.
   */
  supplyReactions(batch: readonly Reaction[], now: number): void {
    const batchId = this.nextBatchId++;
    // Stamped now, while the topic that prompted this batch is still alive.
    const intent: Intent =
      this.currentTopic(now)?.intent ?? (this.introducing ? "greeting" : "mundane");
    const queued: QueuedReaction[] = batch.map((reaction) => ({
      ...reaction,
      batchId,
      createdAt: now,
      intent,
    }));

    // Most eager first. Absent eagerness sorts to the middle rather than the
    // front, so an unannotated batch still releases in a plausible order.
    queued.sort((a, b) => (b.eagerness ?? 0.5) - (a.eagerness ?? 0.5));
    this.reactions = queued;
  }

  /**
   * Opens the arrival phase. Called on Start.
   *
   * Idempotent, and deliberately separate from supplying the batch: the intro
   * generation is a network round trip, and the microphone must not wait on it.
   */
  beginIntro(now: number): void {
    this.introducing = true;
    this.introSpeakers.clear();
    // A fresh stream is a fresh room. Nothing anyone said last session should
    // stop them saying it now.
    this.forgetViewerHistory();
    this.lastSpeechAt = now;
  }

  get isIntroducing(): boolean {
    return this.introducing;
  }

  /** How many reactions are still waiting. Surfaced for the dev trace. */
  get pendingReactions(): number {
    return this.reactions.length;
  }

  /**
   * Whether a generation request is worth making right now.
   *
   * Deliberately permissive: almost anything the streamer says deserves a
   * reaction, and the old gate refused greetings outright, which is why
   * saying "hello" produced nothing. Spend is bounded by the server-side
   * limiter and by there being one request per utterance, not by second
   * guessing which sentences matter.
   */
  wantsReactions(now: number): boolean {
    void now;
    return this.settings.aiShare > 0;
  }

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

    /**
     * The arrival phase is over the moment the streamer speaks.
     *
     * Queued intro lines are dropped rather than drained: "im early" landing
     * after the first sentence makes chat look a message behind.
     */
    if (this.introducing) {
      this.introducing = false;
      this.introSpeakers.clear();
      this.reactions = [];
      this.scheduler.flush();
    }

    /**
     * A new utterance invalidates the *stale tail* of the previous burst:
     * reacting to something said eight seconds ago is worse than not
     * reacting.
     *
     * The window was 1.2s, which was far too tight — a burst spreads over
     * several seconds, so anyone talking at a normal pace had every burst
     * truncated almost immediately and chat appeared to stop whenever they
     * spoke. 3.5s drops genuinely stale reactions while letting a burst
     * actually play out.
     */
    this.scheduler.trimBeyond(now, 3500);

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
     * over is not a signal, and would otherwise let one phrase guarantee a
     * response every time — but saying it again straight after silence is
     * almost always because it did not land.
     *
     * Compared on normalised words: a speech recogniser will not punctuate the
     * same sentence identically twice, so "wait, what?" and "wait what" have
     * to count as the same utterance.
     */
    const normalised = normaliseUtterance(text);
    const repeatedAfterIgnore =
      normalised.length > 0 &&
      normalised === this.previousText &&
      this.previousWasIgnored;
    this.previousText = normalised;

    // Chat is allowed to simply not care. Reacting to every single utterance
    // is what makes generated chat feel relentless and attention-seeking —
    // real chat ignores most background talk and answers what's aimed at it.
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
      // Remembered so that saying the same thing again forces an answer.
      this.previousWasIgnored = true;
      return { classification, reacted: false, queued: 0 };
    }

    this.previousWasIgnored = false;

    /**
     * Folded into the conversation rather than turned straight into messages.
     *
     * The topic is what persists; the emitter draws from it over the following
     * seconds. That indirection is the whole point — a burst generated here
     * and forgotten is exactly the behaviour this replaced.
     */
    const topic = this.topics.observe(classification, text, now);

    return { classification, reacted: topic !== null, queued: this.scheduler.pending };
  }

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

      // Per-viewer repeat cap. Runs on the final text so it catches every
      // generation path — pool, template, emote spam and AI — at once.
      if (this.isOverRepeated(message.viewerId, text)) continue;

      const final = { ...message, text };
      this.population.markSpoke(final.viewerId, now);

      this.rememberReleased(final.viewerId, text);
      this.recentSpeakers.push([final.viewerId, final.username]);
      if (this.recentSpeakers.length > 8) this.recentSpeakers.shift();

      this.releasedCount++;
      // Only reactions count toward fatigue — see shouldReact().
      if (final.kind !== "idle") this.releaseTimes.push(now);
      this.sourceCounts[final.source] = (this.sourceCounts[final.source] ?? 0) + 1;
      visible.push(final);
    }

    return visible;
  }

  
  
  



  /**
   * True when this viewer has already posted this exact text its maximum
   * number of times in the recent window.
   *
   * Deliberately keyed on the viewer as well as the text: an earlier version
   * capped identical text globally, which blocked a crowd from piling onto the
   * same reaction. That is the opposite of what real chat does.
   */
  private isOverRepeated(viewerId: string, text: string): boolean {
    let count = 0;
    for (const seen of this.releasedTexts) {
      if (seen.viewerId !== viewerId || seen.text !== text) continue;
      if (++count >= MAX_REPEATS_PER_VIEWER) return true;
    }
    return false;
  }

  private rememberReleased(viewerId: string, text: string): void {
    this.releasedTexts.push({ viewerId, text });
    if (this.releasedTexts.length > REPEAT_WINDOW) this.releasedTexts.shift();
  }

  /**
   * Window size is a judgement call: too small and repeats slip through, too
   * large and small pools exhaust themselves and start falling back to repeats
   * anyway. 40 is roughly a minute of busy chat.
   */
  private rememberText(template: string): void {
    this.recentTexts.push(template);
    if (this.recentTexts.length > 40) this.recentTexts.shift();
  }

  /**
   * Whether this viewer has already said this, near enough.
   *
   * Chat as a whole repeats itself constantly and that is correct — a pile-on
   * is fifty people saying the same three words. One *person* repeating
   * themselves is not: "quinn: sup" followed by "quinn: heyyyy" is the moment
   * a streamer stops believing the room.
   *
   * The reaction is deliberately not consumed when this rejects, so the line
   * survives and someone else says it on the next tick.
   */
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

  private rememberSaid(
    viewerId: string,
    text: string,
    intent: Intent,
    now: number,
  ): void {
    const said = this.viewerTexts.get(viewerId) ?? new Set<string>();
    said.add(normaliseSaid(text));
    this.viewerTexts.set(viewerId, said);

    const actions = this.viewerActions.get(viewerId) ?? new Map<Intent, number>();
    actions.set(intent, now);
    this.viewerActions.set(viewerId, actions);
  }

  /** A new session is a new room: nobody is on cooldown for anything. */
  private forgetViewerHistory(): void {
    this.viewerTexts.clear();
    this.viewerActions.clear();
  }

  /** Messages released in the last 30s. Drives the fatigue damper. */
  private recentVolume(now: number): number {
    const cutoff = now - 30_000;
    // Trim in place; the array is otherwise unbounded over a long stream.
    while (this.releaseTimes.length > 0 && this.releaseTimes[0] < cutoff) {
      this.releaseTimes.shift();
    }
    return this.releaseTimes.length;
  }

  /**
   * Moves the viewer count a step toward the configured audience.
   *
   * A real viewer count is never a round number sitting still — people join
   * and leave constantly, so it wanders. Showing the setting verbatim made it
   * obvious the number was a config value rather than an audience.
   *
   * Mean-reverting random walk: pulled toward the target so it never drifts
   * away, but with enough noise that it rarely lands exactly on it. Noise
   * scales with the square root of the target, which is how counting noise
   * actually behaves — a 10-viewer stream wobbles by ones, a 10,000-viewer
   * stream by tens.
   */
  /**
   * Displayed viewer count, drifting inside the band for the selected tier.
   *
   * The tier is the primary driver rather than a separate audience setting,
   * because the two were free to contradict each other: a chat emitting four
   * messages a second in front of eleven viewers is not a scene that happens.
   *
   * This is the *displayed* number and is deliberately allowed far above
   * MAX_SIMULATED_VIEWERS — a real stream with a thousand viewers has a few
   * dozen people talking, drawn from a huge silent pool, and simulating a
   * thousand distinct identities would burn memory and username vocabulary to
   * produce output indistinguishable from three hundred.
   */
  private updateViewerCount(now: number): void {
    if (now - this.lastViewerDriftAt < 1200) return;
    this.lastViewerDriftAt = now;

    const [low, high] = viewerBandFor(this.settings.messagesPerSecond);

    if (this.viewerCount === 0) {
      // First tick: land somewhere inside the band rather than climbing to it
      // from zero while the streamer watches.
      this.viewerCount = Math.round(this.rng.float(low, high));
      return;
    }

    // Pull toward the middle of the band, so a tier change migrates rather
    // than snapping, and a random walk cannot wander out of it.
    const middle = (low + high) / 2;
    const pull = (middle - this.viewerCount) * 0.06;

    /**
     * Churn, scaled to the square root of the band.
     *
     * Absolute churn would make a 3-11 stream flicker wildly and a 1000+ one
     * look frozen; the square root keeps the *proportional* movement similar
     * at every tier, which is what reads as believable.
     */
    const churn = Math.sqrt(Math.max(1, middle)) * this.rng.float(-0.55, 0.55);

    // Activity nudges it up: a room that is talking is a room people join.
    const activity = this.topics.activity(now) * Math.sqrt(Math.max(1, middle)) * 0.12;

    const next = Math.round(this.viewerCount + pull + churn + activity);
    this.viewerCount = Math.max(low, Math.min(high, next));
  }

  /**
   * Rate governor.
   *
   * Emits every message whose scheduled moment has arrived, then draws the
   * next gap. Gaps come from an exponential distribution, which is the correct
   * model for independent arrivals: it produces natural jitter for free and
   * its mean is exactly 1/rate, so timing variance costs nothing in rate
   * accuracy. The old hand-tuned offset table could not make that promise.
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
   * Quiet chat runs below the configured target and busy chat above it. The
   * long-run average tracks the target because high-momentum stretches are
   * short relative to idle — which is what lets one setting mean both "about
   * one a second" and "the room goes wild when something happens".
   */
  private drawGap(now: number): number {
    const activity = Math.min(1.9, this.topics.activity(now));
    const rate = this.settings.messagesPerSecond * (RATE_FLOOR + RATE_GAIN * activity);
    // 1 - next() so the draw is (0,1] and the logarithm is always finite.
    return (-Math.log(1 - this.rng.next()) / Math.max(0.05, rate)) * 1000;
  }

  private produceOne(at: number): void {
    this.expireStaleReactions(at);

    /**
     * The 90/10 split, and the centre of the product.
     *
     * If the audience has something to say about what the streamer just said,
     * that is what gets said. Ambient chatter is seasoning — a late arrival, a
     * side conversation — not the main course. The previous design had this
     * backwards: contextual output was a 6% garnish on a deterministic
     * simulation, so the streamer was mostly reading a chat that had not
     * listened to them.
     */
    // Peeked, not popped. Consumed only once a message actually exists —
    // pulling it off first meant a tick with no available speaker silently
    // discarded a generated reaction.
    /**
     * Active chat is AI or nothing.
     *
     * Deterministic pools used to fill the gaps around generated reactions,
     * which meant the streamer was reading canned lines interleaved with
     * answers to what they actually said — and could not tell which was which.
     * If the audience has nothing generated to say, the honest outcome is
     * silence, not filler.
     */
    const reaction = this.reactions.length > 0 ? this.reactions[0] : undefined;

    // How much of the room has drifted into idle chatter, 0..1.
    const idleShare = this.idleShare(at);

    if (!reaction) {
      // Nothing generated. Only idle chatter may speak, and only as far as the
      // ramp allows — otherwise the room stays quiet.
      if (!this.settings.idleEnabled || idleShare <= 0) return;
      if (!this.rng.chance(idleShare)) return;
    } else if (idleShare > 0 && this.rng.chance(idleShare * IDLE_INTRUSION)) {
      // A generated batch is still draining, but the room has started drifting.
      // Let idle interleave rather than replacing it outright.
      this.produceIdle(at);
      return;
    }

    const topic = reaction ? this.currentTopic(at) : null;

    const stage = topic ? this.topics.stageOf(topic, at) : "developing";

    /**
     * What this message is *doing*, for the per-viewer action rules.
     *
     * Taken from the reaction's own batch before the topic, because a batch
     * outlives the topic it answers: topics die on momentum decay while a
     * batch drains on a 45s timer, so the tail of an opening greeting was
     * arriving with no topic attached, relabelled as idle, and dodging the
     * once-per-session greeting rule entirely. That is how the same four
     * people said "yo / hey / sup" twice.
     */
    const intent: Intent =
      reaction?.intent ??
      topic?.intent ??
      (this.introducing ? "greeting" : "mundane");

    /**
     * Who may not speak this message.
     *
     * During arrival, nobody says hello twice — a stream opening with the same
     * three names greeting repeatedly is the loudest possible tell that the
     * room is generated. Beyond that, anyone still on cooldown for this
     * particular action is out.
     */
    const barred = this.restedFor(intent, at);
    if (this.introducing) {
      for (const id of this.introSpeakers) barred.add(id);
    }

    /**
     * Retried rather than dropped.
     *
     * A viewer who would be repeating themselves disqualifies the *speaker*,
     * not the line. Returning here instead of trying someone else is what made
     * a busy moment go quiet: the generated reaction was still sitting in the
     * queue with forty other people available to say it.
     */
    for (let attempt = 0; attempt < SPEAKER_ATTEMPTS; attempt += 1) {
      const result = directOne({
        topic,
        stage,
        band: this.topics.band(topic ? this.topics.momentumOf(topic, at) : 0),
        reaction,
        excludeSpeakers: barred,
        population: this.population,
        settings: this.settings,
        emotes: this.emotes,
        recentTexts: new Set(this.recentTexts),
        lastTemplate: this.recentTexts.at(-1),
        recentSpeakers: this.recentSpeakers,
        now: at,
        silentMs: at - this.lastSpeechAt,
        sequence: this.emitSequence++,
        rng: this.rng,
      });
      if (!result) return;

      if (this.echoesSelf(result.viewerId, result.message.text)) {
        // This person has said this. Someone else may not have.
        barred.add(result.viewerId);
        continue;
      }

      if (reaction) this.reactions.shift();
      this.rememberSaid(result.viewerId, result.message.text, intent, at);
      if (this.introducing) this.introSpeakers.add(result.viewerId);
      if (result.template) this.rememberText(result.template);
      if (topic) this.topics.recordParticipation(topic, result.viewerId);
      this.scheduler.enqueueAt(result.message, at);
      return;
    }
  }

  /**
   * How far the room has drifted into idle chatter, 0..1.
   *
   * Zero until `idleAfterSeconds` of silence, then ramping to one over
   * IDLE_FULL_AFTER_MS. Any accepted input resets `lastSpeechAt`, which drops
   * this straight back to zero — so speaking again ends idle immediately
   * rather than waiting for a timer to unwind.
   */
  private idleShare(now: number): number {
    if (!this.settings.idleEnabled) return 0;
    // Arrival is its own phase; idle chatter about an absent streamer while
    // people are still saying hello is nonsense.
    if (this.introducing) return 0;

    const silentMs = now - this.lastSpeechAt;
    const startsAt = this.settings.idleAfterSeconds * 1000;
    if (silentMs < startsAt) return 0;

    return Math.min(1, (silentMs - startsAt) / IDLE_FULL_AFTER_MS);
  }

  /** One idle message: the only path still allowed to use response pools. */
  private produceIdle(at: number): void {
    // Off-topic by definition, so it carries no action cooldown. The retry
    // loop below is what matters here: it stops one viewer filling a silence
    // by repeating a line they already used.
    const barred = this.restedFor("mundane", at);

    for (let attempt = 0; attempt < SPEAKER_ATTEMPTS; attempt += 1) {
      const result = directOne({
        topic: null,
        stage: "developing",
        band: "low",
        excludeSpeakers: barred,
        population: this.population,
        settings: this.settings,
        emotes: this.emotes,
        recentTexts: new Set(this.recentTexts),
        lastTemplate: this.recentTexts.at(-1),
        recentSpeakers: this.recentSpeakers,
        now: at,
        silentMs: at - this.lastSpeechAt,
        sequence: this.emitSequence++,
        rng: this.rng,
      });
      if (!result) return;

      if (this.echoesSelf(result.viewerId, result.message.text)) {
        barred.add(result.viewerId);
        continue;
      }

      this.rememberSaid(result.viewerId, result.message.text, "mundane", at);
      if (result.template) this.rememberText(result.template);
      this.scheduler.enqueueAt(result.message, at);
      return;
    }
  }

  /**
   * Drops reactions the conversation has moved past.
   *
   * A batch is answering one thing the streamer said. Once it is old enough
   * that they have plainly moved on, releasing the rest is worse than staying
   * quiet — it reads as chat replying to a question from a minute ago.
   */
  private expireStaleReactions(now: number): void {
    this.reactions = this.reactions.filter(
      (reaction) => now - reaction.createdAt < REACTION_LIFETIME_MS,
    );
  }

  /** The live topic a generated reaction belongs to: the most recent one. */
  private currentTopic(now: number): Topic | null {
    const active = this.topics.active(now);
    return active.length > 0 ? active[active.length - 1] : null;
  }

  private pickTopic(now: number): Topic | null {
    const active = this.topics.active(now);
    if (active.length === 0) return null;

    const weights = active.map((topic) => this.topics.momentumOf(topic, now));
    const total = weights.reduce((a, b) => a + b, 0) + AMBIENT_WEIGHT;

    let roll = this.rng.float(0, total);
    for (let i = 0; i < active.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return active[i];
    }
    return null;
  }

  
  /** Clears queued messages — used when the user pauses. */
  flush(): void {
    this.scheduler.flush();
  }

  markActivity(now: number): void {
    this.lastSpeechAt = now;
  }

  stats(): EngineStats {
    return {
      // The live wandering count, not the configured figure — this is what is
      // shown as "viewers".
      audience: this.viewerCount,
      simulated: this.population.size,
      pending: this.scheduler.pending,
      released: this.releasedCount,
      ignored: this.ignoredCount,
      bySource: { ...this.sourceCounts },
    };
  }
}

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
 * setting contradict it.
 *
 * Bands are inclusive and deliberately wide, so the count has somewhere to
 * wander and crosses formatting thresholds (999 to 1.0k) on its own.
 */
const VIEWER_BANDS: ReadonlyArray<readonly [rate: number, low: number, high: number]> = [
  [0.2, 3, 11],
  [0.5, 12, 24],
  [1, 25, 180],
  [1.5, 181, 500],
  [2, 501, 1000],
  [4, 1001, 4200],
];

function viewerBandFor(messagesPerSecond: number): readonly [number, number] {
  // Nearest tier, so a hand-edited setting between two steps still resolves.
  let best = VIEWER_BANDS[0];
  for (const band of VIEWER_BANDS) {
    if (Math.abs(band[0] - messagesPerSecond) < Math.abs(best[0] - messagesPerSecond)) {
      best = band;
    }
  }
  return [best[1], best[2]];
}
