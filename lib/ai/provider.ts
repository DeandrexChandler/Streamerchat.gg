import type { Classification } from "../engine/types";
import type { Reaction } from "./reaction";
import type { GameEvent } from "./moment";

/**
 * The AI tier is behind an interface for one reason: tests and the headless
 * harness need a stand-in that never touches the network. There is exactly
 * one real implementation (Gemini) and there is no selection between them at
 * runtime — the mock is injected by tests, never chosen by configuration.
 *
 * The contract is deliberately narrow. A provider takes a description of the
 * moment and returns candidate lines. It does not decide when to run, how
 * often, or what happens to the output — the engine, the limiter and the
 * validator own those.
 */

/**
 * What kind of moment a batch is for.
 *
 *   startup  the stream just went live and nobody has spoken
 *   active   the streamer said something, or chat is still on it
 *   idle     the streamer has been silent past the threshold
 */
export type GenerationPhase = "startup" | "active" | "idle";

/**
 * How long the silence has gone on, in coarse steps the prompt can act on.
 *
 *   1  the streamer is focused on something
 *   2  the streamer may be busy or away
 *   3  is the streamer still there?
 *   4  chat has given up waiting and is entertaining itself
 */
export type IdleStage = 1 | 2 | 3 | 4;

export interface CandidateRequest {
  phase: GenerationPhase;
  /**
   * What the streamer said most recently, verbatim. Empty during startup.
   *
   * This was absent once, and its absence was the central bug: the model
   * received an intent label and a keyword list, so it could not react to a
   * sentence it had never seen.
   */
  utterance: string;
  /** Recent streamer inputs before that, oldest first, so a change of mind is visible. */
  history: readonly string[];
  classification: Classification;
  /**
   * Active only: the batch for this utterance already drained and the
   * streamer has not said anything new. Chat keeps going rather than
   * reacting afresh to a sentence from half a minute ago.
   */
  continuation: boolean;
  /** Seconds since the streamer last said anything. */
  silenceSeconds: number;
  idleStage?: IdleStage;
  /**
   * Emote names actually loaded in this session.
   *
   * Supplied so the model reaches for emotes the renderer can resolve. An
   * invented name renders as bare text and reads as a typo on stream.
   */
  emotes: readonly string[];
  /** Recent chat lines, so a refill doesn't echo what just went out. */
  recent: readonly string[];
  streamer?: string;
  topic?: string;
  count: number;
  /**
   * A downscaled JPEG of the streamer's screen, base64, no data URL prefix.
   *
   * Rides along with a batch the engine was going to request anyway, which
   * is the only reason it is affordable: a frame is roughly 260 input
   * tokens against five calls a minute, so about three cents a stream hour.
   * Absent when capture is off, which is the default.
   */
  frame?: string;
  /**
   * Pulled forward to look at the screen, and why.
   *
   * "changed" is the picture moving on its own; "asked" is the streamer
   * saying the word. The prompt leads with the image either way, but being
   * told to look is a different moment from noticing something. Only
   * meaningful with a frame.
   */
  screen?: ScreenReason;
  /**
   * Who is in the room, at the slow tiers only.
   *
   * When present the model writes each line as one of these people and says
   * which, because a chat of three is a conversation with people the
   * streamer knows by name — and nobody can answer to their name if the
   * model has never seen it.
   */
  roster?: readonly RosterEntry[];
  /** The regular the streamer just addressed by name, if any. */
  addressed?: string;
  /**
   * Things said recently that chat barely answered, newest last.
   *
   * Chat's short memory: talking steadily, each reply is cut short by the
   * next, and this is what lets a batch circle back to something from half
   * a minute ago instead of forgetting it.
   */
  callbacks?: readonly string[];
}

export type ScreenReason = "changed" | "asked";

/** One regular, as the model is told about them. */
export interface RosterEntry {
  name: string;
  /** Their archetype and typing habits: "hype viewer; short lines, ...". */
  persona: string;
  /** What they have been on about this stream. Empty on their first line. */
  notes?: string;
  /** Written by the streamer, in their own words. Outranks the rest. */
  character?: string;
}

/**
 * Why a generation produced what it did. For the server log and for tests —
 * the browser is only ever told "ok" or "unavailable".
 */
export type ProviderStatus =
  | "ok"
  | "auth"          // key rejected
  | "model-missing" // retired, or not available to this key
  | "quota"         // provider-side rate limit or exhausted quota
  | "timeout"       // the request ran past its deadline
  | "network"       // DNS, connection reset, provider 5xx
  | "bad-response"  // 2xx that could not be parsed
  | "empty";        // parsed fine, contained nothing

/** What one call cost, as the provider counted it. */
export interface TokenUsage {
  input: number;
  output: number;
}

export interface GenerationResult {
  reactions: Reaction[];
  /** Tokens billed for this call, when the provider reported them. */
  usage?: TokenUsage;
  /** What the model saw happening, when it was given a frame. */
  event?: GameEvent;
  status: ProviderStatus;
  /** The provider's own message, when it gave one. For logs, never the UI. */
  detail?: string;
}

export interface GenerateOptions {
  /**
   * Lines as they arrive, before the batch is finished.
   *
   * The result still carries every line at the end; this is what lets the
   * first of them reach chat a second after asking instead of after the
   * whole batch is written.
   */
  onLines?: (reactions: Reaction[], event?: GameEvent) => void;
  /**
   * The browser went away — usually because the engine moved on to newer
   * speech. Output is most of the cost, so the provider stops writing.
   */
  signal?: AbortSignal;
}

export interface CandidateProvider {
  readonly name: string;
  /**
   * Returns audience lines and why.
   *
   * Never throws. Chat is AI-only, so a failure means chat stays quiet for
   * this batch — never a deterministic pool standing in.
   */
  generate(request: CandidateRequest, options?: GenerateOptions): Promise<GenerationResult>;
}
