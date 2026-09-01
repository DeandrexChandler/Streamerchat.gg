import type { Classification } from "../engine/types";

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

export interface CandidateProvider {
  readonly name: string;
  /**
   * Returns candidate lines, or an empty array.
   *
   * Never throws. An AI outage must degrade variety, never stop chat, so
   * every failure path resolves to `[]` and lets the pool tier carry on.
   */
  generate(request: CandidateRequest): Promise<string[]>;
}
