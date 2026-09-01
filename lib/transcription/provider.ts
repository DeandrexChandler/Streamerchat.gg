import type { Emitter } from "../audio/emitter";

/**
 * Transcription is behind an interface so the engine never knows or cares
 * where text came from. Three implementations:
 *
 *   web-speech  browser SpeechRecognition — free, streaming, Chrome/Edge
 *   whisper     server round-trip — accurate, costs money, any browser
 *   mock        scripted — tests and offline UI work
 */

export interface TranscriptionEvents {
  /** A completed utterance. This is what feeds the simulation. */
  final: { text: string };
  /** In-progress text. Display only — never fed to the engine. */
  interim: { text: string };
  /** Recognition is live and listening. */
  listening: void;
  /** Recognition stopped, whether deliberately or not. */
  idle: void;
  error: { code: TranscriptionErrorCode; message: string; fatal: boolean };
}

export type TranscriptionErrorCode =
  | "not-supported"
  | "permission-denied"
  | "network"
  | "no-speech"
  | "aborted"
  | "unknown";

export interface TranscriptionProvider {
  readonly name: string;
  readonly events: Emitter<TranscriptionEvents>;
  /** True if this provider can run in the current environment. */
  isSupported(): boolean;
  start(): Promise<void>;
  stop(): void;
  readonly isRunning: boolean;
}

/**
 * Junk filter.
 *
 * Speech recognisers emit artefacts during silence and background noise —
 * Whisper is notorious for hallucinating "Thank you." and "Thanks for
 * watching", and Web Speech produces short fragments from keyboard clicks and
 * breathing. Feeding those to the engine makes chat react to nothing, which
 * looks worse than chat staying quiet.
 *
 * The filter is deliberately narrow, because anything dropped here never
 * reaches the engine and no amount of tuning downstream can recover it. An
 * earlier version blocked every utterance under three characters plus "okay",
 * "yeah" and "hmm" — which killed "yo", "gg", "ez" and a chunk of ordinary
 * speech, and was a large part of why chat seemed to ignore everything.
 */

/** Phrases recognisers invent out of silence. Never real speech on a stream. */
const HALLUCINATIONS = new Set([
  "thanks", "thank you", "thanks for watching", "thank you for watching",
  "please subscribe", "subscribe", "you",
]);

/**
 * Sounds that carry nothing on their own.
 *
 * "okay", "yeah", "hmm" and "bye" are deliberately absent: those are real
 * reactions, and "hmm" is a confusion signal the classifier handles.
 */
const FILLER = new Set([
  "uh", "um", "ah", "mm", "mhm", "erm", "eh",
  "the", "a", "an", "i", "and", "so", "to", "of", "it",
]);

export function isLikelyArtefact(raw: string): boolean {
  const text = raw.trim().toLowerCase().replace(/[.,!?]+$/g, "");

  // Single characters are noise; two is enough for "yo", "gg", "ez".
  if (text.length < 2) return true;
  if (/^[\s.,!?'"-]*$/.test(text)) return true;
  if (HALLUCINATIONS.has(text)) return true;
  if (FILLER.has(text)) return true;
  // Recognisers sometimes emit URLs from audio that contains none.
  if (/\b(www\.|https?:|\.com|\.org|\.net)\b/i.test(text)) return true;

  return false;
}
