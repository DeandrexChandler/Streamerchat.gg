import type { Classification } from "../engine/types";
import type { Reaction } from "./reaction";

/**
 * The AI tier is behind an interface for the same reason transcription is: the
 * engine must never know or care which model produced a line, and swapping
 * providers should be a new implementation rather than a rewrite.
 *
 * The contract is deliberately narrow. A provider takes a description of the
 * moment and returns candidate lines. It does not decide when to run, how
 * often, or what happens to the output — the budget guard, the director and
 * the validator own those.
 */

export interface CandidateRequest {
  /**
   * What the streamer just said, verbatim.
   *
   * This was absent, and its absence was the central bug: the model received
   * an intent label and a keyword list, so it could not react to a sentence it
   * had never seen.
   */
  utterance: string;
  /** Recent utterances, oldest first, so a change of mind is visible. */
  history: readonly string[];
  classification: Classification;
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
}

/**
 * Why a generation produced what it did.
 *
 * An empty batch used to be indistinguishable from a rejected key, an
 * exhausted quota and a retired model — all of which reached the streamer as
 * the same unhelpful line. These need different fixes, so they get different
 * names.
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
  status: ProviderStatus;
  /** The provider's own message, when it gave one. For logs, not the UI. */
  detail?: string;
}

export interface CandidateProvider {
  readonly name: string;
  /**
   * Returns audience reactions and why.
   *
   * Never throws. Active chat is AI-only, so a failure means chat stays quiet
   * and the reason is surfaced — never a deterministic pool standing in.
   */
  generate(request: CandidateRequest): Promise<GenerationResult>;
}
