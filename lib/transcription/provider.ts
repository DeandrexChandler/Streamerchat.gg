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
 */
const ARTEFACTS = new Set([
  "thanks", "thank you", "thanks for watching", "bye", "you", "okay", "ok",
  "uh", "um", "ah", "hmm", "mm", "yeah", "so", "and", "the", "a", "i",
  "please subscribe", "subscribe",
]);

export function isLikelyArtefact(raw: string): boolean {
  const text = raw.trim().toLowerCase().replace(/[.,!?]+$/g, "");

  if (text.length < 3) return true;
  if (/^[\s.,!?'"-]*$/.test(text)) return true;
  if (ARTEFACTS.has(text)) return true;
  // Recognisers sometimes emit URLs from audio that contains none.
  if (/\b(www\.|https?:|\.com|\.org|\.net)\b/i.test(text)) return true;

  return false;
}
