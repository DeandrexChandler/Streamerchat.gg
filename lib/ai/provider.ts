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
   * Pulled forward because the screen just changed. The prompt leads with
   * the image instead of the last thing said. Only meaningful with a frame.
   */
  screen?: boolean;
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

export interface GenerationResult {
  reactions: Reaction[];
  /** What the model saw happening, when it was given a frame. */
  event?: GameEvent;
  status: ProviderStatus;
  /** The provider's own message, when it gave one. For logs, never the UI. */
  detail?: string;
}

export interface CandidateProvider {
  readonly name: string;
  /**
   * Returns audience lines and why.
   *
   * Never throws. Chat is AI-only, so a failure means chat stays quiet for
   * this batch — never a deterministic pool standing in.
   */
  generate(request: CandidateRequest): Promise<GenerationResult>;
}
