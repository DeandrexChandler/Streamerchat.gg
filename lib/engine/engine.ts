import type { SimulationSettings } from "../config/settings";
import type { CustomTag } from "../config/custom-tags";
import { DEFAULT_SETTINGS } from "../config/settings";
import type {
  CandidateRequest,
  GenerationPhase,
  IdleStage,
  RosterEntry,
  ScreenReason,
} from "../ai/provider";
import type { QueuedReaction, Reaction } from "../ai/reaction";
import { MAX_EMOTES_IN_PROMPT } from "../ai/prompt";
import { shouldReact } from "./attention";
import { classify } from "./classifier";
import { ONE_SHOT_INTENTS, directOne } from "./director";
import { profileFor, type GameEvent } from "../ai/moment";
import {
  FAILURE_BACKOFF_MS,
  INITIAL_LATENCY_MS,
  batchSizeFor,
  idleStageFor,
  lowWaterFor,
} from "./generation";
import type { SavedViewer } from "../config/roster-store";
import { PERSONALITIES } from "../data/personalities";
import { describeVoice } from "../data/voices";
import { Population } from "./population";
import { createFilter, type Filter } from "./profanity";
import {
  BURST_COOLDOWN_MS,
  BURST_MS,
  burstFactorFor,
  isConversational,
  MAX_CONSECUTIVE,
  MAX_POSTS_IN_WINDOW,
  POST_WINDOW_MS,
  rosterSizeFor,
  speakingCooldownFor,
  turnoverIntervalFor,
} from "./roster";
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
  /** Regulars from previous sessions, so they come back knowing the stream. */
  roster?: readonly SavedViewer[];
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
 * Greeting and farewell get a long cooldown, not a session ban. A ban froze
 * the room: the arrival wave is one hello from each of the ten people in
 * it, so when the streamer then said "hi", every viewer was barred from
 * answering and the batch drained unsaid until idle. Someone who said hi
 * on the way in does say hey back when the streamer greets them; what they
 * do not do is say it twice in the same moment — the per-topic rule in the
 * director covers that. Nothing else is listed, and that is the point:
 * reacting twice to a fight is what people do, and the intent on a batch
 * is the *streamer's*, so a cooldown on "question" would throttle every
 * reply to one.
 */
const ACTION_COOLDOWN_MS: Partial<Record<Intent, number>> = {
  greeting: 45_000,
  farewell: 45_000,
};

/**
 * Moments where one person firing off several lines in a row is the point.
 *
 * The speaking cooldown is waived for these while the moment is fresh. The
 * consecutive cap still holds.
 */
const BURST_INTENTS: ReadonlySet<Intent> = new Set<Intent>([
  "excitement",
  "achievement",
  "directive",
]);

/**
 * How many speakers to try before giving the tick up.
 *
 * A rejected candidate means "not this person", not "not this message" — the
 * generated line is still good and someone else should say it. Bounded so a
 * room that has genuinely run out of eligible speakers waits instead of
 * spinning.
 */
const SPEAKER_ATTEMPTS = 4;

/** How many slots a line waits for the person it was written for. */
const NAMED_ATTEMPTS = 8;

/** How soon to try again when a slot found nobody eligible to speak. */
const RETRY_SLOT_MS = 400;



/**
 * How soon one viewer may post the same emote block again.
 *
 * Words are once per session per viewer. Emote blocks cannot be: people
 * post KEKW many times a stream, and a lifetime ban made viewers run out of
 * emotes mid-session — slots went unfilled and hype moments ran slower than
 * the calm before them. A minute is long enough that nobody is seen posting
 * the same block twice in the same moment.
 */
const EMOTE_BLOCK_WINDOW_MS = 60_000;

/**
 * How often a screen change may pull a batch forward.
 *
 * A death deserves a reaction; a flickering health bar does not deserve
 * four. The batch it pulls is small, so eight seconds costs about what
 * twelve did with a full one.
 */
const SCREEN_TRIGGER_COOLDOWN_MS = 8_000;

/**
 * The word that points chat at the screen, and how often it may be used.
 *
 * Bare "screen" only: "screenshot" and "screens" are ordinary words, and a
 * hot word that fires on half of them would spend the key. Each use is one
 * extra call carrying an image, so twenty seconds caps a spammed word at
 * three extra calls a minute.
 */
const SCREEN_WORD = /\bscreen\b/i;
const SCREEN_WORD_COOLDOWN_MS = 20_000;

/**
 * Lines in a screen-triggered batch: a few seconds of chat, no more.
 *
 * Latency grows with output. Measured with a frame attached: 8 lines came
 * back in 1.6-2.6s, 30 in 3.9-4.1s. The point of this batch is to be on
 * screen while the moment is still on screen; the normal refill behind it
 * carries the room after.
 */
const SCREEN_BATCH_SECONDS = 6;
const SCREEN_BATCH_MIN = 6;
const SCREEN_BATCH_MAX = 12;

/** How long a screen event keeps colouring the room after it was seen. */
const EVENT_LIFETIME_MS = 20_000;

/**
 * How much eagerness leans on release order, against a random draw of 0..1.
 *
 * Small. A strict sort grouped every bare emote at the front of the batch;
 * it also meant the longest lines always sorted last, and a batch that is
 * superseded before it drains quietly loses whatever sorted last. A gentle
 * lean keeps reflexive lines arriving a little earlier without either.
 */
const EAGERNESS_LEAN = 0.4;

/** Messages the emote/words mix is measured over. */
const SHAPE_WINDOW = 10;

/** How far down the queue to look for a line of the other shape. */
const LOOKAHEAD = 6;

/**
 * Emotes in a row before the queue is searched for words.
 *
 * Four, not two: a couple in a row is chat, and stepping in that early is
 * the cap the streamer did not want. This only fires once a run is long
 * enough to read as the room getting stuck.
 */
const LOOKAHEAD_AFTER = 4;

/** Chat lines kept for the prompt, so a refill does not echo them. */
const RECENT_LINES = 20;

/** Streamer inputs kept for the prompt. */
const HISTORY_LINES = 8;

/**
 * Chat's short memory of what the streamer said.
 *
 * Talking steadily, each sentence's reply is cut short by the next one, so a
 * thing said thirty seconds ago may have had two lines of chat and then
 * nothing. A thread is one thing said and how many lines answered it; one
 * that is recent and barely answered goes to the model as worth a callback.
 */
interface Thread {
  /** The utterance the reply was asked for. */
  id: number;
  text: string;
  at: number;
  answered: number;
}
/** Long enough for a callback to make sense, short enough to stay small. */
const THREAD_MS = 120_000;
/** Answered by this many lines, it has been heard. */
const THREAD_ANSWERED = 4;
const MAX_THREADS = 5;
const MAX_CALLBACKS = 3;
/**
 * Lines about the previous sentence kept when a reply to a newer one lands.
 *
 * Real chat answers the last thing and the thing before it at once; dropping
 * them all made every sentence one round trip of chat and then gone.
 */
const CARRY_OVER = 3;

/**
 * What the hot word did, for the transcript panel.
 *
 * "off" is capture not running, "cooldown" is too soon since the last one,
 * and `readyInMs` is how long until the word works again — the streamer
 * cannot see a cooldown they were never told about.
 */
export interface ScreenRequest {
  state: "fired" | "cooldown" | "off";
  readyInMs?: number;
}

export interface TranscriptOutcome {
  classification: Classification;
  /** Set when the utterance contained the screen hot word. */
  screen?: ScreenRequest;
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
  /** Emit slots that found a line but nobody eligible to say it. */
  slotsWaited: number;
  /** Lines dropped because nobody in the room could ever say them. */
  linesDropped: number;
  /** What the model last saw on screen, when capture is on. */
  event?: GameEvent;
  /** Smoothed provider latency the planner is sizing against. */
  latencyMs: number;
}

/** What a batch was for, so a late reply can be recognised as stale. */
interface Pending {
  /** Ticket. A reply carrying another ticket is for a moment that has passed. */
  id: number;
  /** When it went out, so the reply measures the provider's latency. */
  requestedAt: number;
  phase: GenerationPhase;
  /** Which streamer input it answers. Startup and idle carry none. */
  utteranceId: number;
  idleStage: IdleStage | null;
  intent: Intent;
  /**
   * The first batch after something was said, or the arrival wave.
   *
   * One line per person: everyone answers the streamer once, and the
   * continuation that follows is where anyone speaks again.
   */
  wave: boolean;
  /**
   * Replaces the queue when it lands instead of joining it.
   *
   * Used across a phase or stage change. What is queued was written for the
   * moment before, but it is still chat, and a room that goes silent for one
   * provider round-trip at every transition is worse than a room that
   * finishes its thought. So the old lines keep flowing until the new batch
   * arrives, and are dropped then.
   */
  supersedes: boolean;
  /** Pulled forward by something on screen. Never preempted by another. */
  screen?: boolean;
  /** Its first lines have landed; the rest may still be streaming in. */
  landed?: boolean;
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
  private customTags: readonly CustomTag[] = [];
  private emoteNames = new Set<string>();
  private readonly topics = new TopicTracker();
  /** When the rate governor says the next message should land. */
  private nextEmitAt: number;
  /** Monotonic, so two messages in the same millisecond get distinct ids. */
  private emitSequence = 0;
  /** Recent speakers as [viewerId, username]. */
  private recentSpeakers: Array<readonly [string, string]> = [];
  /**
   * Whether each of the last few messages was emotes alone.
   *
   * Chat is a mix, and a mix is not the same as the right average: five
   * emotes then five sentences has the same share as alternating them and
   * reads nothing like it. This is what the next message is balanced
   * against.
   */
  private recentShapes: boolean[] = [];

  // ---------------------------------------------------------- conversation

  private phase: GenerationPhase = "startup";
  private lastSpeechAt: number;
  /** Streamer inputs this session, oldest first. Bounded for the prompt. */
  private history: string[] = [];
  private lastUtterance = "";
  private lastClassification: Classification | null = null;
  /** Counts accepted inputs, so a batch can say which one it answers. */
  private utteranceId = 0;
  /** Said since the last fresh reply went out, oldest first. */
  private sinceAsked: string[] = [];
  /** What the reply in progress answers: everything said since the one before. */
  private answering: string[] = [];
  private threads: Thread[] = [];
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
  private tickets = 0;
  /**
   * How long the provider has been taking, smoothed.
   *
   * Drives batch size and the refill mark: a slow provider needs bigger
   * batches requested earlier, or the room goes quiet between them.
   */
  private latencyMs = INITIAL_LATENCY_MS;
  /** When each ticket went out, kept until its reply arrives or is abandoned. */
  private issuedAt = new Map<number, number>();
  /** What the queue currently holds, for staleness checks. */
  private current: Pending | null = null;
  private lastFailureAt = Number.NEGATIVE_INFINITY;

  /**
   * What the screen was last doing, and when something big last happened.
   *
   * The event drives composition: how emote-heavy the room is and how fast
   * it moves. Chat is only as loud as the moment deserves, which is the
   * whole reason emote spam reads as noise when nothing is on screen.
   */
  private event: GameEvent | undefined;
  private eventAt = 0;
  /** A screen change waiting to be turned into a request. */
  /** A look at the screen is due, and why it was asked for. */
  private pendingScreenEvent: ScreenReason | null = null;
  private lastScreenTriggerAt = Number.NEGATIVE_INFINITY;
  /** When the streamer last said the word, for its own slower cooldown. */
  private lastScreenWordAt = Number.NEGATIVE_INFINITY;
  /** Whether the streamer has screen capture turned on. Set by the caller. */
  private capturing = false;
  /** Batches served this phase. Startup uses it to greet only once. */
  private phaseBatches = 0;
  /** Paused: nothing is planned and nothing is released. */
  private paused = false;

  // ------------------------------------------------------------- room

  /** The regular the streamer named in their last utterance, if any. */
  private addressed: string | undefined;
  /** While the room is piling onto something. */
  private burstUntil = 0;
  private lastBurstAt = Number.NEGATIVE_INFINITY;

  /** Who spoke last, and how many times in a row. */
  private lastSpeakerId: string | null = null;
  private consecutive = 0;
  /** When each viewer's recent lines were scheduled, for the rolling cap. */
  private postTimes = new Map<string, number[]>();
  /**
   * Who has spoken in each greeting or farewell batch.
   *
   * A wave of hellos is one hello per person, whatever else is true: not
   * the cooldown, which is a preference and yields when the whole room is
   * on it, but a hard rule scoped to the batch. Keyed by batch so a later,
   * separate greeting is a fresh wave.
   */
  private waveSpeakers = new Map<number, Set<string>>();
  /** When a regular last left and a new name arrived. */
  private lastTurnoverAt: number;

  // ---------------------------------------------------------------- misc

  private previousIntent: Classification["intent"] | undefined;
  private previousText = "";
  private previousWasIgnored = false;
  private viewerCount = 0;
  private lastViewerDriftAt = 0;
  private releaseTimes: number[] = [];
  private ignoredCount = 0;
  private releasedCount = 0;
  private slotsWaited = 0;
  private linesDropped = 0;
  private readonly sourceCounts: Record<string, number> = {};

  constructor(options: EngineOptions = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...options.settings };
    this.rng = createRng(options.seed);
    this.emotes = options.emotes ?? [];
    this.emoteNames = new Set(this.emotes.map((emote) => emote.name));
    this.filter = createFilter(this.settings);

    this.population = new Population(this.rng, rosterSizeFor(this.settings.messagesPerSecond));
    if (options.roster?.length) {
      this.population.restore(options.roster, rosterSizeFor(this.settings.messagesPerSecond));
    }
    this.population.setCooldown(speakingCooldownFor(this.settings.messagesPerSecond));
    this.scheduler = new Scheduler(this.effectiveRateLimit());

    const now = options.now ?? Date.now();
    this.lastSpeechAt = now;
    this.nextEmitAt = now;
    this.lastViewerDriftAt = now;
    this.lastTurnoverAt = now;
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
    // Headroom for momentum, a screen event and a burst — this is a safety
    // valve against a defect flooding the renderer, not a second rate knob,
    // and clipping a legitimate burst would make the tier feel broken.
    const ceiling = 1.6 * burstFactorFor(this.settings.messagesPerSecond);
    return Math.ceil(this.settings.messagesPerSecond * 60 * ceiling);
  }

  updateSettings(patch: Partial<SimulationSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.filter = createFilter(this.settings);
    this.scheduler.setRateLimit(this.effectiveRateLimit());
    // The roster follows the tier: a faster stream is a bigger room.
    this.population.driftToward(rosterSizeFor(this.settings.messagesPerSecond));
    this.population.setCooldown(speakingCooldownFor(this.settings.messagesPerSecond));
  }

  setEmotes(emotes: readonly Emote[]): void {
    this.emotes = emotes;
    this.emoteNames = new Set(emotes.map((emote) => emote.name));
  }

  /** The streamer's own meanings, so the model can ask for them. */
  setCustomTags(tags: readonly CustomTag[]): void {
    this.customTags = tags;
  }

  /**
   * The custom meanings worth telling the model about: only those some
   * usable emote actually carries, or asking for one reaches nothing.
   */
  private usableCustomTags(): CustomTag[] {
    const used = new Set(this.emotes.filter((emote) => !emote.blocked).flatMap((emote) => emote.tags ?? []));
    return this.customTags.filter((tag) => used.has(tag.name));
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
    this.sinceAsked = [];
    this.answering = [];
    this.threads = [];
    this.lastClassification = null;
    this.recentLines = [];
    this.recentSpeakers = [];
    this.recentShapes = [];
    this.lastSpeakerId = null;
    this.consecutive = 0;
    this.addressed = undefined;
    this.burstUntil = 0;
    this.lastBurstAt = Number.NEGATIVE_INFINITY;
    this.lastScreenWordAt = Number.NEGATIVE_INFINITY;
    this.postTimes.clear();
    this.lastTurnoverAt = now;
    this.event = undefined;
    this.eventAt = 0;
    this.pendingScreenEvent = null;
    this.population.forget();
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

  /**
   * The screen moved enough to be worth reacting to.
   *
   * Only a request for a batch, never a message: the engine still has to
   * ask the model what actually happened, and the model still has to say
   * something worth posting. Rate-limited here rather than at the caller
   * so a flashing game cannot spend the key.
   */
  screenEvent(now: number): void {
    if (now - this.lastScreenTriggerAt < SCREEN_TRIGGER_COOLDOWN_MS) return;
    this.lastScreenTriggerAt = now;
    this.pendingScreenEvent = "changed";
  }

  /**
   * Whether the streamer's screen is being captured.
   *
   * The engine cannot see the browser, and the hot word needs to know: told
   * to look at a screen nobody is sharing, the honest answer is to say so
   * rather than to ask the model about an image that will not exist.
   */
  setCapturing(on: boolean): void {
    this.capturing = on;
  }

  /**
   * "screen", said or typed.
   *
   * Its own cooldown, slower than the motion trigger: a screen that moves
   * is the game, and the engine decides how often that is worth a call, but
   * the word is the streamer deciding, and each one costs a call with an
   * image attached. Twenty seconds keeps a spammed word to three extra
   * calls a minute.
   */
  private hotWord(text: string, now: number): ScreenRequest | undefined {
    if (!SCREEN_WORD.test(text)) return undefined;
    if (!this.capturing) return { state: "off" };

    const since = now - this.lastScreenWordAt;
    if (since < SCREEN_WORD_COOLDOWN_MS) {
      return { state: "cooldown", readyInMs: Math.ceil(SCREEN_WORD_COOLDOWN_MS - since) };
    }

    this.lastScreenWordAt = now;
    // Also counts as a trigger, so the motion watcher does not fire a second
    // batch at the same moment for the same picture.
    this.lastScreenTriggerAt = now;
    this.pendingScreenEvent = "asked";
    return { state: "fired", readyInMs: SCREEN_WORD_COOLDOWN_MS };
  }

  /**
   * How long nothing has happened: no word from the streamer, and nothing
   * on screen when capture is on. A streamer playing without narrating is
   * still there; idle is for when the game has gone quiet too.
   */
  private quietFor(now: number): number {
    return now - Math.max(this.lastSpeechAt, this.lastScreenTriggerAt);
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
    /**
     * The hot word is handled before the attention gate.
     *
     * "screen" is an instruction, not conversation: a bland-sounding line
     * that happens to contain it should still point chat at the picture,
     * and the streamer should still be told what happened either way.
     */
    const screen = this.hotWord(text, now);

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
      return { classification, reacted: false, queued: 0, ...(screen ? { screen } : {}) };
    }

    this.previousWasIgnored = false;

    /**
     * Accepted. The conversation moves on.
     *
     * Coming out of arrival or idle, what is queued is about a room that
     * had not heard the streamer yet — it goes. Mid-conversation it stays:
     * Chrome finalises a phrase at every pause, so one spoken thought lands
     * as two or three transcripts, and flushing on each one left chat a
     * round trip behind and silent in between. Real chat lags a sentence.
     * A reply already on the wire is left to land — it is about a sentence
     * said one round trip ago, which is what chat always is — and the reply
     * to this line goes out right after it and supersedes the queue on
     * arrival. Abandoning it instead starved the room whenever sentences
     * came faster than the provider: three in thirteen seconds against an
     * eight-second reply meant nothing landed for twelve.
     */
    if (this.phase !== "active") this.dropBatch();
    else this.waveSpeakers.clear();
    this.phase = "active";
    this.phaseBatches = 0;
    this.utteranceId += 1;
    this.lastUtterance = text;
    this.lastClassification = classification;
    this.sinceAsked.push(text);
    this.history.push(text);
    if (this.history.length > HISTORY_LINES) this.history.shift();
    this.scheduler.trimBeyond(now, 1_500);

    /**
     * Said to one of them, by name.
     *
     * Speech recognition breaks a username into words — "hazel irl" for
     * hazelirl — so the match ignores spacing and punctuation entirely, and
     * falls back to a distinctive word of the name on its own.
     */
    this.maybeBurst(classification, now);

    this.addressed = isConversational(this.settings.messagesPerSecond)
      ? this.matchName(text)
      : undefined;
    if (this.addressed) {
      const viewer = this.population.byName(this.addressed);
      if (viewer) this.population.rememberAddressed(viewer.id, text);
    }

    const topic = this.topics.observe(classification, text, now);
    return {
      classification,
      reacted: topic !== null,
      queued: this.scheduler.pending,
      ...(screen ? { screen } : {}),
    };
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
    if (this.paused) return null;

    // Arrival goes first: hellos and the chatter right after them. A screen
    // batch superseding the greeting wave would wipe the hellos off the queue.
    if (this.phase === "startup" && this.phaseBatches < 2) this.pendingScreenEvent = null;

    const silenceMs = now - this.lastSpeechAt;
    const stage = idleStageFor(this.quietFor(now));

    /**
     * Into idle, or deeper into it.
     *
     * What is queued was written for a room that had not yet noticed the
     * silence, or had noticed less of it. It is superseded: it keeps flowing
     * until the batch for the new stage lands, then goes. A refill already
     * on the wire is left to land first — its lines are still chat, and on
     * a slow provider they are the only thing between the room and twelve
     * seconds of nothing — and the new request goes out right after.
     */
    if (stage !== null && this.phase !== "idle") {
      this.phase = "idle";
      this.phaseBatches = 0;
    }
    const supersede =
      stage !== null && (this.current === null || this.current.idleStage !== stage);

    /**
     * A routine refill does not hold up a reaction to the screen.
     *
     * Waiting for it was up to a whole provider round trip before the
     * screen batch could even leave. A refill only tops up the queue, so
     * dropping it costs nothing the screen batch does not replace. A reply
     * to speech, an arrival wave or another screen batch is not routine and
     * is waited for.
     */
    if (this.inFlight && this.pendingScreenEvent !== null && !this.inFlight.wave && !this.inFlight.screen) {
      this.inFlight = null;
    }
    /**
     * A reply still streaming in about something said before.
     *
     * Its first lines are already out, so chat is not silent; the rest would
     * hold up the answer to what was just said by however long the batch
     * takes to finish writing. It is cut off and the new reply goes now.
     */
    if (
      this.inFlight?.landed &&
      this.phase === "active" &&
      this.lastClassification !== null &&
      this.inFlight.utteranceId !== this.utteranceId
    ) {
      this.inFlight = null;
    }
    if (this.inFlight) return null;
    if (now - this.lastFailureAt < FAILURE_BACKOFF_MS) return null;

    /**
     * Something happened on screen.
     *
     * This is the one thing that pulls the room out of idle without a word
     * being said: dying in silence gets a reaction rather than "is he still
     * there". Treated as active once the streamer has said anything, because
     * it is — they are playing, just not narrating.
     */
    const screenEvent = this.pendingScreenEvent;
    const screenReason = screenEvent ?? "changed";
    if (screenEvent) {
      this.pendingScreenEvent = null;
      if (this.lastClassification !== null) {
        this.phase = "active";
        this.phaseBatches = 0;
      }
    }

    // The streamer said something the queue does not answer yet. Out now,
    // however full the queue is with lines about the previous sentence.
    const freshReply =
      this.phase === "active" &&
      this.lastClassification !== null &&
      this.current?.utteranceId !== this.utteranceId;

    /**
     * Sized against the rate the room is actually running at, not the
     * setting: momentum lifts a busy stretch well above it, and a refill
     * planned for one a second runs dry at one and a third.
     */
    const rate = this.effectiveRate(now);
    if (
      !supersede &&
      !freshReply &&
      !screenEvent &&
      this.reactions.length > lowWaterFor(rate, this.latencyMs)
    ) {
      return null;
    }

    const count = batchSizeFor(rate, this.latencyMs);
    const shared = {
      ...(isConversational(this.settings.messagesPerSecond)
        ? { roster: this.room(), ...(this.addressed ? { addressed: this.addressed } : {}) }
        : {}),
      // A blocked emote is never offered: the model cannot ask for what the
      // streamer has said never to post, and it costs nothing to leave out.
      customTags: this.usableCustomTags(),
      emotes: this.emotes
        .filter((emote) => !emote.blocked)
        .slice(0, MAX_EMOTES_IN_PROMPT)
        .map((emote) => emote.name),
      recent: [...this.recentLines],
      streamer: this.settings.streamerName || undefined,
      topic: this.settings.streamTopic || undefined,
      count,
    };
    const silenceSeconds = Math.round(silenceMs / 1000);

    /**
     * Small, first in line, and about the screen.
     *
     * It supersedes the queue: appended, its lines waited behind up to a
     * full batch of chat about whatever came before, which was most of the
     * delay between a death and chat noticing. The old lines keep flowing
     * until it lands, as at any other transition.
     */
    if (screenEvent) {
      this.inFlight = {
        id: this.issue(now),
        requestedAt: now,
        supersedes: true,
        wave: false,
        screen: true,
        phase: "active",
        utteranceId: this.utteranceId,
        idleStage: null,
        intent: "mundane",
      };
      return {
        ...shared,
        count: Math.max(SCREEN_BATCH_MIN, Math.min(SCREEN_BATCH_MAX, Math.round(rate * SCREEN_BATCH_SECONDS))),
        phase: "active",
        utterance: this.lastUtterance,
        history: this.history.slice(0, -1),
        classification: this.lastClassification ?? STARTUP_CLASSIFICATION,
        continuation: false,
        screen: screenReason,
        silenceSeconds,
      };
    }

    if (this.phase === "startup") {
      const first = this.phaseBatches === 0;
      // The greeting wave is one hello per person. Asking for more lines than
      // there are people leaves the rest unsayable, and a queue full of
      // unsayable lines is a silent room.
      const wave = first ? Math.min(count, this.population.size) : count;
      this.inFlight = {
        id: this.issue(now),
        requestedAt: now,
        supersedes: false,
        wave: first,
        phase: "startup",
        utteranceId: this.utteranceId,
        idleStage: null,
        // The first wave greets, once each. The next waves are chatter.
        intent: first ? "greeting" : "mundane",
      };
      return {
        ...shared,
        count: wave,
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
        id: this.issue(now),
        requestedAt: now,
        supersedes: supersede,
        wave: false,
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
    /**
     * The first reply to something said is sized for speed, not depth.
     *
     * Latency grows with output, and this is the batch the streamer is
     * waiting on. A dozen lines reaches the screen sooner; the continuation
     * that follows is full size. A wave of hellos is one per person besides:
     * asking for more leaves the rest unsayable.
     */
    /**
     * A full batch, first reply included.
     *
     * It used to be sized to the roster so nobody answered twice, with the
     * continuation carrying the rest — which put the continuation's latency
     * on the critical path: ten lines drained in seven seconds and a slow
     * refill was a visible gap. One-per-person now applies to the first
     * roster's worth of lines and the rest flow normally, so one round trip
     * covers the whole moment. Greetings and farewells stay one per person
     * outright, so those batches are sized to the room.
     */
    const wave =
      !continuation && ONE_SHOT_INTENTS.has(this.lastClassification.intent)
        ? Math.min(count, this.population.size)
        : count;
    /**
     * Everything said since the last reply was asked for.
     *
     * A sentence that arrived while a reply was on the wire used to be
     * skipped — the next request carried only the newest — so a streamer
     * talking in five-second pieces had every other piece go unanswered.
     */
    if (!continuation) {
      this.answering = this.sinceAsked.length > 0 ? this.sinceAsked : [this.lastUtterance];
      this.sinceAsked = [];
      this.threads = [
        ...this.threads.filter((thread) => now - thread.at < THREAD_MS).slice(-(MAX_THREADS - 1)),
        { id: this.utteranceId, text: this.answering.join(" "), at: now, answered: 0 },
      ];
    }
    const callbacks = this.callbacks(now);
    this.inFlight = {
      id: this.issue(now),
      requestedAt: now,
      supersedes: !continuation,
      wave: !continuation,
      phase: "active",
      utteranceId: this.utteranceId,
      idleStage: null,
      intent: continuation ? "mundane" : this.lastClassification.intent,
    };
    return {
      ...shared,
      count: wave,
      phase: "active",
      utterance: this.answering.join(" ") || this.lastUtterance,
      history: this.history.slice(0, -Math.max(1, this.answering.length)),
      classification: this.lastClassification,
      continuation,
      silenceSeconds,
      ...(callbacks.length > 0 ? { callbacks } : {}),
    };
  }

  /** Recent things said that chat barely got to, newest last. */
  private callbacks(now: number): string[] {
    return this.threads
      .filter(
        (thread) =>
          thread.id !== this.utteranceId &&
          now - thread.at < THREAD_MS &&
          thread.answered < THREAD_ANSWERED,
      )
      .slice(-MAX_CALLBACKS)
      .map((thread) => thread.text);
  }

  /** The regulars and their memory, for the caller to persist. */
  exportRoster(): SavedViewer[] {
    return this.population.export();
  }

  /**
   * The regular the streamer just named, if any.
   *
   * Two passes: the whole name with everything but letters and digits
   * stripped, which survives "hazel irl" and "Hazel-irl"; then a single
   * distinctive word of a name, but only when it belongs to exactly one
   * person in the room, so "clover" does not address wobblyclover by
   * accident when someone else is clover_bee.
   */
  private matchName(text: string): string | undefined {
    const flat = text.toLowerCase().replace(/[^a-z0-9]/g, "");
    const words = new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    const regulars = this.population.all();

    for (const viewer of regulars) {
      if (flat.includes(viewer.name.toLowerCase().replace(/[^a-z0-9]/g, ""))) return viewer.name;
    }

    let found: string | undefined;
    for (const viewer of regulars) {
      const distinctive = viewer.nameWords.filter((word) => word.length >= 5 && words.has(word));
      if (distinctive.length === 0) continue;
      // A word two people share names nobody.
      if (found) return undefined;
      found = viewer.name;
    }
    return found;
  }

  /**
   * Who is in the room, for the prompt.
   *
   * Only built at the slow tiers. A regular with nothing behind them yet is
   * still listed — the name is the point — and the notes fill in as the
   * session goes.
   */
  private room(): RosterEntry[] {
    return this.population.all().map((viewer) => {
      const { topics, lines, addressed } = viewer.memory;
      const notes = [
        topics.length > 0 ? `been on about: ${topics.join(", ")}` : "",
        lines.length > 0 ? `has said: ${lines.map((line) => `"${line}"`).join(", ")}` : "",
        addressed.length > 0
          ? `streamer said to them: ${addressed.map((line) => `"${line}"`).join(", ")}`
          : "",
      ].filter(Boolean);
      return {
        name: viewer.name,
        // The archetype says what kind of viewer they are; the voice says
        // how they type, which is what tells two chatty regulars apart.
        persona: `${PERSONALITIES[viewer.personality].label.toLowerCase()}; ${describeVoice(viewer.voice)}`,
        ...(viewer.note ? { character: viewer.note } : {}),
        ...(notes.length > 0 ? { notes: notes.join("; ") } : {}),
      };
    });
  }

  /**
   * The ticket of the request currently out, for the caller to hand back.
   *
   * The caller's network layer may still be waiting on a request the engine
   * has already abandoned — the streamer spoke during a slow arrival call —
   * and the reply, when it comes, must not be mistaken for the answer to
   * the newer request.
   */
  get generationTicket(): number | null {
    return this.inFlight?.id ?? null;
  }

  /** Mints the ticket for a request going out now. */
  private issue(now: number): number {
    const id = ++this.tickets;
    this.issuedAt.set(id, now);
    // Bounded: a ticket whose reply never comes would otherwise leak.
    if (this.issuedAt.size > 32) this.issuedAt.delete(this.issuedAt.keys().next().value!);
    return id;
  }

  /**
   * Accepts a generated batch for the request last handed out.
   *
   * Appended, not replaced: refills happen while a few lines from the same
   * moment are still queued, and those are still good. A batch that no
   * longer matches the moment — the streamer spoke while it was in flight —
   * is discarded, and the next `nextGeneration` asks for the right thing.
   *
   * A streamed batch arrives in pieces: each with `more` set, then a final
   * call without it (an empty batch is fine) that closes the request. The
   * first piece does everything a whole batch would — measures latency,
   * replaces the queue, goes out at once — and the rest join behind it.
   */
  supplyReactions(
    batch: readonly Reaction[],
    now: number,
    ticket?: number,
    event?: GameEvent,
    more = false,
  ): void {
    const pending = this.inFlight;
    if (ticket !== undefined && ticket !== pending?.id) {
      // Not the reply we are waiting for, but it still says how long the
      // provider takes — and on a slow day the arrival batch is usually the
      // first thing abandoned, so this is often the first measurement.
      const issued = this.issuedAt.get(ticket);
      if (issued !== undefined) this.observeLatency(now - issued);
      this.issuedAt.delete(ticket);
      return;
    }
    if (!pending) return;
    if (!more) this.inFlight = null;

    // Time to the first lines is what the refill planner has to cover.
    if (!pending.landed) {
      this.observeLatency(now - pending.requestedAt);
      this.issuedAt.delete(pending.id);
    }
    if (event) {
      this.event = event;
      this.eventAt = now;
    }

    /**
     * Stale means the room changed, not that the streamer kept talking.
     *
     * An active reply landing after a newer active sentence is about
     * something said one round trip ago — chat always is — and finishing it
     * beats a gap; the reply to the newer line follows at once and takes
     * over. What is stale: an arrival or idle batch landing after the
     * streamer has spoken, which is about a room that had not heard them.
     */
    if (pending.phase !== "active" && pending.utteranceId !== this.utteranceId) {
      // Still streaming, it would hold up the request that replaces it.
      if (this.inFlight === pending) this.inFlight = null;
      return;
    }

    if (batch.length === 0) {
      // Closing a stream that delivered is not a failure; one that never did is.
      if (!more && !pending.landed) this.lastFailureAt = now;
      return;
    }
    const first = !pending.landed;
    pending.landed = true;

    const batchId = this.nextBatchId++;
    const queued: QueuedReaction[] = batch.map((reaction) => ({
      ...reaction,
      batchId,
      createdAt: now,
      intent: pending.intent,
      phase: pending.phase,
      wave: pending.wave,
      ...(pending.phase === "active" ? { utteranceId: pending.utteranceId } : {}),
    }));
    /**
     * Eager first, but only as a lean.
     *
     * A strict sort put every bare-emote line at the front of the batch,
     * because the model gives those eagerness 1 and a written sentence 0.2.
     * The room then posted five or six emotes in a row and switched back to
     * words — the clumping the streamer noticed.
     *
     * The jitter is wide enough to span most of that range, for a second
     * reason: a batch is often superseded before it drains, so whatever
     * sorts last is quietly dropped. Under a strict sort that was always
     * the longest lines, and chat lost the sentences it had been asked to
     * write. A reflexive line still leans earlier; it is no longer a queue.
     */
    for (const reaction of queued) {
      reaction.order = (reaction.eagerness ?? 0.5) * EAGERNESS_LEAN + this.rng.float(0, 1);
    }
    queued.sort((a, b) => (b.order ?? 0) - (a.order ?? 0));

    /**
     * The first line of a reply goes out now, not on the next slot.
     *
     * At 0.2/sec a slot is five seconds, so a reply that had already cost a
     * provider round trip sat in the queue for another five before anyone
     * said it. Only for a batch that answers something new: a routine
     * refill joining the queue must not jump the pacing.
     */
    if (first && pending.supersedes) {
      this.nextEmitAt = Math.min(this.nextEmitAt, now);
      // A few lines about what was said before ride along behind the first.
      const carried =
        pending.phase === "active" && !pending.screen
          ? this.reactions
              .filter((line) => line.utteranceId !== undefined && line.utteranceId !== pending.utteranceId)
              .slice(0, CARRY_OVER)
          : [];
      this.reactions = [...queued, ...carried];
      this.waveSpeakers.clear();
    } else {
      this.reactions.push(...queued);
    }
    if (first) {
      this.current = pending;
      this.phaseBatches += 1;
    }
  }

  /** The request last handed out could not be fulfilled. Chat waits it out. */
  generationFailed(now: number, ticket?: number): void {
    if (ticket !== undefined) this.issuedAt.delete(ticket);
    // A failure for a request the engine already abandoned is not news, and
    // must not back off the one that replaced it.
    if (ticket !== undefined && ticket !== this.inFlight?.id) return;
    // A stream that broke after delivering lines did its job.
    if (!this.inFlight?.landed) this.lastFailureAt = now;
    this.inFlight = null;
  }

  /** Half-weight smoothing: quick to notice a slow day, quick to recover. */
  private observeLatency(ms: number): void {
    this.latencyMs = Math.round((this.latencyMs + Math.max(0, ms)) / 2);
  }

  private dropBatch(): void {
    this.reactions = [];
    this.current = null;
    this.inFlight = null;
    this.waveSpeakers.clear();
  }

  // ------------------------------------------------------------------ tick

  /**
   * Advances the simulation. Returns messages that should be rendered now.
   * Safe to call at any cadence; all timing is derived from `now`.
   */
  tick(now: number): ChatMessage[] {
    this.updateViewerCount(now);
    this.turnOver(now);
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
      const spoke = this.produceOne(at);
      /**
       * A slot nobody eligible could fill is delayed, not lost.
       *
       * The line is still queued; someone will be off cooldown shortly. Waiting
       * a whole gap on top of that is how a ten-person room ran at 80% of the
       * configured rate. A short retry keeps the long-run rate honest without
       * letting anyone speak before they may.
       */
      this.nextEmitAt = at + (spoke ? this.drawGap(at) : Math.min(this.drawGap(at), RETRY_SLOT_MS));
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
    // 1 - next() so the draw is (0,1] and the logarithm is always finite.
    return (-Math.log(1 - this.rng.next()) / Math.max(0.05, this.effectiveRate(now))) * 1000;
  }

  /** The configured rate lifted by whatever momentum the room has. */
  private effectiveRate(now: number): number {
    const activity = Math.min(1.9, this.topics.activity(now));
    /**
     * What is on screen pushes against the slider rather than replacing it.
     * A death is louder than downtime at every tier, and the tier still
     * decides what "loud" means.
     */
    const fresh = now - this.eventAt < EVENT_LIFETIME_MS;
    const event = fresh ? profileFor(this.event).rate : 1;
    return (
      this.settings.messagesPerSecond *
      (RATE_FLOOR + RATE_GAIN * activity) *
      event *
      this.burstFactor(now)
    );
  }

  /**
   * The burst, decaying linearly back to normal.
   *
   * Linear rather than a step: chat that stops dead the instant the window
   * closes is as mechanical as chat that never sped up.
   */
  private burstFactor(now: number): number {
    const left = this.burstUntil - now;
    if (left <= 0) return 1;
    const peak = burstFactorFor(this.settings.messagesPerSecond);
    return 1 + (peak - 1) * (left / BURST_MS);
  }

  /**
   * Something worth piling onto was just said.
   *
   * Intent covers "spam W", "LETS GO" and a question to chat; sentiment
   * covers the rest, because "im sad" classifies as mundane and is exactly
   * the moment a room should react. Rate-limited, or a talkative minute is
   * one continuous burst and the tier stops meaning anything.
   */
  private maybeBurst(classification: Classification, now: number): void {
    const worth =
      BURST_INTENTS.has(classification.intent) ||
      classification.intent === "question_to_chat" ||
      classification.intent === "greeting" ||
      classification.sentiment !== "neutral";
    if (!worth || now - this.lastBurstAt < BURST_COOLDOWN_MS) return;
    this.lastBurstAt = now;
    this.burstUntil = now + BURST_MS;
  }

  /**
   * One message, if there is anything generated to say.
   *
   * AI or nothing. If the queue is empty the room is quiet until the next
   * batch lands — never a canned line standing in. The planner keeps the
   * queue topped up, so in a healthy session this only goes quiet for the
   * length of one request.
   */
  /** How many of the last messages in a row were emotes alone. */
  private emoteRun(): number {
    let run = 0;
    for (let i = this.recentShapes.length - 1; i >= 0 && this.recentShapes[i]; i -= 1) run += 1;
    return run;
  }

  /** Share of the recent window that was emotes alone. */
  private recentEmoteShare(): number {
    if (this.recentShapes.length === 0) return 0;
    const emotes = this.recentShapes.filter(Boolean).length;
    return emotes / this.recentShapes.length;
  }

  private isEmoteOnly(text: string): boolean {
    const words = text.trim().split(/\s+/);
    return words.length > 0 && words.every((word) => this.emoteNames.has(word));
  }

  /**
   * Whether the viewer a line was written for is currently held back by the
   * back-to-back or rolling caps. Lines with no name are never busy.
   */
  private speakerBusy(reaction: QueuedReaction | undefined, at: number): boolean {
    const viewer = reaction?.from ? this.population.byName(reaction.from) : undefined;
    if (!viewer) return false;
    if (this.lastSpeakerId === viewer.id && this.consecutive >= MAX_CONSECUTIVE) return true;
    const times = this.postTimes.get(viewer.id) ?? [];
    return times.filter((t) => at - t < POST_WINDOW_MS).length >= MAX_POSTS_IN_WINDOW;
  }

  private produceOne(at: number): boolean {
    // Peeked, not popped. Consumed only once a message actually exists —
    // pulling it off first meant a tick with no available speaker silently
    // discarded a generated line.
    /**
     * Take the head, unless it would extend a run of emotes.
     *
     * The model writes bare-emote lines of its own, and no amount of
     * shuffling stops two landing together. Looking a little way down the
     * queue for something with words costs nothing and is what keeps the
     * two kinds interleaved.
     */
    let index = 0;
    if (
      this.emoteRun() >= LOOKAHEAD_AFTER &&
      this.reactions[0] &&
      this.isEmoteOnly(this.reactions[0].text)
    ) {
      const found = this.reactions
        .slice(0, LOOKAHEAD)
        .findIndex((candidate) => !this.isEmoteOnly(candidate.text));
      if (found > 0) index = found;
    }
    /**
     * A line belongs to the person the model wrote it for, so when that
     * person may not speak yet the *line* waits, not the room. Someone
     * else's line a little further down goes out instead.
     */
    if (this.speakerBusy(this.reactions[index], at)) {
      const free = this.reactions
        .slice(0, LOOKAHEAD)
        .findIndex((candidate) => !this.speakerBusy(candidate, at));
      if (free >= 0) index = free;
    }

    const reaction = this.reactions[index];
    if (!reaction) return false;

    const topic = reaction.phase === "active" ? this.currentTopic(at) : null;
    const stage = topic ? this.topics.stageOf(topic, at) : "developing";
    const intent = reaction.intent ?? "mundane";

    const barred = this.restedFor(intent, at);

    /**
     * One line per person in a wave. Hard, unlike the cooldown above.
     *
     * The first batch after the streamer speaks is everyone answering once;
     * the director's taste for a returning voice in a developing topic is
     * right for the chatter that follows and wrong here — it is how one
     * name answered "can yall hear me" twice while two others said nothing.
     */
    const spoken = this.waveSpeakers.get(reaction.batchId);
    /**
     * The wave rule is the engine choosing; a named line already chose.
     *
     * Leaving it on meant a batch that gave one regular three lines wedged
     * the queue: they had spoken, the wave barred them, and nobody else
     * could say their words. One-shot intents still hold for everyone —
     * saying hello twice is wrong whoever decided it.
     */
    const named = reaction.from ? this.population.byName(reaction.from) : undefined;
    if (
      ONE_SHOT_INTENTS.has(intent) ||
      (!named && reaction.wave && (spoken?.size ?? 0) < this.population.size)
    ) {
      for (const id of spoken ?? []) barred.add(id);
    }

    /**
     * Nobody monopolises the room.
     *
     * A few lines in a row from one person is a hype moment; more than that
     * is one account talking to itself, whatever the words are.
     */
    if (this.lastSpeakerId && this.consecutive >= MAX_CONSECUTIVE) {
      barred.add(this.lastSpeakerId);
    }
    // Nor, taking turns with one other person, a rolling window of it. After
    // the window they are free again; this is a pause, not a mute.
    for (const [id, times] of this.postTimes) {
      while (times.length > 0 && at - times[0] >= POST_WINDOW_MS) times.shift();
      if (times.length === 0) this.postTimes.delete(id);
      else if (times.length >= MAX_POSTS_IN_WINDOW) barred.add(id);
    }

    // The cooldown is waived while a hype moment is fresh.
    const burst =
      topic !== null && BURST_INTENTS.has(topic.intent) && stage !== "referencing";

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
        speaker: named,
        band: this.topics.band(topic ? this.topics.momentumOf(topic, at) : 0),
        reaction,
        phase: reaction.phase ?? this.phase,
        event: at - this.eventAt < EVENT_LIFETIME_MS ? this.event : undefined,
        excludeSpeakers: barred,
        burst,
        emoteRun: this.emoteRun(),
        recentEmoteShare: this.recentEmoteShare(),
        population: this.population,
        settings: this.settings,
        emotes: this.emotes,
        recentSpeakers: this.recentSpeakers,
        now: at,
        sequence: this.emitSequence++,
        rng: this.rng,
      });
      if (!result) {
        this.slotsWaited += 1;
        return false;
      }

      /**
       * Checked against the model's line as well as the rendered one: a
       * viewer who said "insane" must not say "insane KEKW" a minute later.
       * That is the same person saying the same thing with a sticker on it.
       */
      const said = (
        result.message.source === "ai"
          ? [reaction.text, result.message.text]
          : [result.message.text]
      ).map(normaliseSaid);
      const block =
        result.message.source !== "ai" ||
        result.message.text.split(/\s+/).every((word) => this.emoteNames.has(word));
      const window = block ? EMOTE_BLOCK_WINDOW_MS : Number.POSITIVE_INFINITY;
      if (said.some((text) => this.population.hasSaid(result.viewerId, text, at, window))) {
        // This person has said this. Someone else may not have.
        barred.add(result.viewerId);
        continue;
      }

      this.reactions.splice(index, 1);
      const thread = this.threads.find((t) => t.id === reaction.utteranceId);
      if (thread) thread.answered += 1;
      this.population.remember(result.viewerId, said, intent, at, {
        line: result.message.text,
        // The live topic when there is one, and otherwise what the streamer
        // was last on about: a quiet sentence can fall below the topic floor
        // and still be the thing this person just replied to.
        topics: topic?.keywords ?? this.lastClassification?.keywords,
      });
      if (reaction.wave || ONE_SHOT_INTENTS.has(intent)) {
        const wave = this.waveSpeakers.get(reaction.batchId) ?? new Set<string>();
        wave.add(result.viewerId);
        this.waveSpeakers.set(reaction.batchId, wave);
      }
      this.consecutive = result.viewerId === this.lastSpeakerId ? this.consecutive + 1 : 1;
      this.postTimes.set(result.viewerId, [...(this.postTimes.get(result.viewerId) ?? []), at]);
      this.lastSpeakerId = result.viewerId;
      if (topic) this.topics.recordParticipation(topic, result.viewerId);
      this.recentShapes.push(this.isEmoteOnly(result.message.text));
      if (this.recentShapes.length > SHAPE_WINDOW) this.recentShapes.shift();
      this.scheduler.enqueueAt(result.message, at);
      return true;
    }

    /**
     * Nobody eligible could say this line right now.
     *
     * Delayed first: it goes to the back of the queue so the lines behind it
     * are not stuck, and it gets another chance once others have spoken. A
     * line that fails twice is one nobody in the room can say — everyone who
     * could has — and it is dropped rather than left to block the batch.
     */
    this.reactions.splice(index, 1);
    const attempts = (reaction.attempts ?? 0) + 1;
    /**
     * A line written for a named person waits longer.
     *
     * Anyone can say an unattributed line, so two tries means nobody could.
     * A named line has exactly one possible speaker, who is often simply
     * mid-cooldown in a room of three — and at a slow tier there is time to
     * wait for them.
     */
    if (attempts < (reaction.from ? NAMED_ATTEMPTS : 2)) {
      this.reactions.push({ ...reaction, attempts });
    } else this.linesDropped += 1;
    this.slotsWaited += 1;
    return false;
  }

  // ------------------------------------------------------------------ room

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
    for (const viewer of this.population.all()) {
      const last = this.population.lastDid(viewer.id, intent);
      if (last !== undefined && now - last < cooldown) barred.add(viewer.id);
    }
    /**
     * A preference for most things, an absolute for hello and goodbye.
     *
     * When everyone has done a thing recently the bar normally lifts, so
     * the room still answers rather than going silent. Greeting cannot work
     * that way: with three regulars the whole room is on cooldown after
     * three hellos, the bar lifted immediately, and the same name said hi
     * twice nine seconds apart — the exact tell this rule exists to stop.
     * Here the line goes unsaid instead, and the room is quieter for it.
     */
    if (ONE_SHOT_INTENTS.has(intent)) return barred;
    return barred.size >= this.population.size ? new Set() : barred;
  }

  /**
   * One regular leaves, one new name arrives.
   *
   * Only at the faster tiers, and slowly: the roster never grows, a departed
   * name is never reissued, and the newcomer starts with no history. Left
   * off entirely for slow streams, where the same handful every session is
   * the realism.
   */
  private turnOver(now: number): void {
    const interval = turnoverIntervalFor(this.settings.messagesPerSecond);
    if (interval === null || now - this.lastTurnoverAt < interval) return;
    this.lastTurnoverAt = now;
    if (this.population.size >= 2) this.population.churn();
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
      slotsWaited: this.slotsWaited,
      linesDropped: this.linesDropped,
      latencyMs: this.latencyMs,
      event: this.event,
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
