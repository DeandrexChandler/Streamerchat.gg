import { Emitter } from "../audio/emitter";
import { repairSlang } from "./slang";
import {
  isLikelyArtefact,
  type TranscriptionEvents,
  type TranscriptionProvider,
} from "./provider";

/**
 * Browser SpeechRecognition provider.
 *
 * Free, low-latency, and gives utterance boundaries for free via `isFinal`,
 * which is why no separate voice-activity detector is needed on this path.
 *
 * Two behaviours make this harder than the API suggests:
 *
 *  1. Chrome ends recognition on its own — after a stretch of silence, and
 *     periodically regardless. `continuous = true` reduces but does not
 *     eliminate this. A long stream will see many `onend` events, so the
 *     session has to restart itself or transcription silently dies after a
 *     minute and the app looks broken.
 *  2. Restarting naively can spin. Calling start() while already started
 *     throws InvalidStateError, and an immediately-failing restart becomes a
 *     tight loop. Restarts are therefore debounced with backoff, and the
 *     backoff resets whenever real speech comes through.
 */

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionResultEventLike {
  resultIndex: number;
  results: ArrayLike<
    ArrayLike<{ transcript: string }> & { isFinal: boolean }
  >;
}

function getConstructor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | SpeechRecognitionCtor
    | null;
}

const MIN_RESTART_DELAY_MS = 250;
const MAX_RESTART_DELAY_MS = 8_000;

/**
 * Talking straight through, the transcript is handed over this often.
 *
 * Chrome only finalises at a pause, and only finals reach the engine, so a
 * streamer who never stops was a streamer chat could not hear — then one
 * paragraph arrived at once. Long enough that a sentence with an ordinary
 * pause finalises on its own first; short enough that chat keeps up.
 */
const COMMIT_AFTER_MS = 5_000;
/** Fewer words than this is not worth a reply of its own yet. */
const COMMIT_MIN_WORDS = 4;

export class WebSpeechProvider implements TranscriptionProvider {
  readonly name = "web-speech";
  readonly events = new Emitter<TranscriptionEvents>();

  private recognition: SpeechRecognitionLike | null = null;
  /** What the caller wants. Distinct from whether recognition is live. */
  private wantRunning = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private restartDelay = MIN_RESTART_DELAY_MS;
  /** Words at the front of the unfinished text already handed over. */
  private committedWords = 0;
  /** When the unfinished text started, or was last handed over. */
  private pendingSince: number | null = null;

  constructor(private readonly lang: string = "en-US") {}

  get isRunning(): boolean {
    return this.wantRunning;
  }

  isSupported(): boolean {
    return getConstructor() !== null;
  }

  async start(): Promise<void> {
    if (this.wantRunning) return;

    const Ctor = getConstructor();
    if (!Ctor) {
      this.events.emit("error", {
        code: "not-supported",
        message:
          "This browser has no speech recognition. Chrome or Edge is required.",
        fatal: true,
      });
      return;
    }

    this.wantRunning = true;
    this.restartDelay = MIN_RESTART_DELAY_MS;
    this.spawn(Ctor);
  }

  stop(): void {
    this.wantRunning = false;
    this.clearRestart();

    if (this.recognition) {
      // abort() rather than stop(): stop() waits to finalise pending audio and
      // still fires onend, which would trip the restart path.
      this.recognition.onend = null;
      this.recognition.abort();
      this.recognition = null;
    }

    this.events.emit("idle", undefined);
  }

  private spawn(Ctor: SpeechRecognitionCtor): void {
    this.committedWords = 0;
    this.pendingSince = null;
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = this.lang;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      this.events.emit("listening", undefined);
    };

    recognition.onresult = (event) => {
      let interim = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (!text) continue;

        if (result.isFinal) {
          // Whatever of it was already handed over early is not sent twice.
          const words = text.trim().split(/\s+/);
          const skip = Math.min(this.committedWords, words.length);
          this.committedWords -= skip;
          this.pendingSince = null;
          this.emitFinal(words.slice(skip).join(" "));
        } else {
          interim += text;
        }
      }

      const words = interim.trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        this.committedWords = 0;
        this.pendingSince = null;
        return;
      }

      const now = Date.now();
      this.pendingSince ??= now;
      const fresh = words.slice(this.committedWords);
      if (now - this.pendingSince >= COMMIT_AFTER_MS && fresh.length > COMMIT_MIN_WORDS) {
        // The last word is the one Chrome is still revising; it waits.
        const chunk = fresh.slice(0, -1);
        this.committedWords += chunk.length;
        this.pendingSince = now;
        this.emitFinal(chunk.join(" "));
      }

      const shown = words.slice(this.committedWords).join(" ");
      if (shown) this.events.emit("interim", { text: shown });
    };

    recognition.onerror = (event) => {
      const code = event.error;

      // "no-speech" and "aborted" are routine during a stream and must not be
      // surfaced to the user — they fire constantly during normal silence.
      if (code === "no-speech" || code === "aborted") return;

      const fatal = code === "not-allowed" || code === "service-not-allowed";
      this.events.emit("error", {
        code: fatal ? "permission-denied" : code === "network" ? "network" : "unknown",
        message: fatal
          ? "Microphone access was blocked for speech recognition."
          : `Speech recognition error: ${code}`,
        fatal,
      });

      if (fatal) this.wantRunning = false;
    };

    recognition.onend = () => {
      this.recognition = null;
      if (!this.wantRunning) {
        this.events.emit("idle", undefined);
        return;
      }
      this.scheduleRestart(Ctor);
    };

    this.recognition = recognition;

    try {
      recognition.start();
    } catch {
      // InvalidStateError when a previous instance hasn't fully released.
      this.scheduleRestart(Ctor);
    }
  }

  private emitFinal(text: string): void {
    // Repaired before anything downstream sees it: the classifier matches on
    // words, so a mistranscribed "low key" silently becomes chat ignoring you.
    const trimmed = repairSlang(text.trim());
    if (isLikelyArtefact(trimmed)) return;
    // Real speech means the connection is healthy — reset the backoff.
    this.restartDelay = MIN_RESTART_DELAY_MS;
    this.events.emit("final", { text: trimmed });
  }

  private scheduleRestart(Ctor: SpeechRecognitionCtor): void {
    if (this.restartTimer !== null) return;

    const delay = this.restartDelay;
    // Exponential backoff, so a persistently failing recogniser degrades into
    // occasional retries rather than a hot loop.
    this.restartDelay = Math.min(MAX_RESTART_DELAY_MS, this.restartDelay * 2);

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.wantRunning) this.spawn(Ctor);
    }, delay);
  }

  private clearRestart(): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }
}
