import { Emitter } from "./emitter";

/**
 * Microphone capture and loudness measurement.
 *
 * Deliberately a plain class with no React in it. The previous implementation
 * called setState() on every animation frame, re-rendering a 1,000-line
 * component roughly 60 times a second, and needed nine refs purely to mirror
 * state into the rAF closure. Both problems disappear once the audio loop
 * lives outside the component tree.
 *
 * The level meter is driven by subscribing to `level` and writing to a CSS
 * custom property or a DOM style directly — never by putting the value in
 * React state.
 */

export interface MicSessionEvents {
  /** Instantaneous loudness, 0..1. Fires at animation-frame rate. */
  level: number;
  /** Capture started and is producing audio. */
  started: void;
  stopped: void;
  error: { code: MicErrorCode; message: string };
}

export type MicErrorCode =
  | "permission-denied"
  | "no-device"
  | "insecure-context"
  | "unsupported"
  | "unknown";

export interface MicSessionOptions {
  /** Frames of history kept for recentEnergy(). ~2s at 60fps. */
  historyFrames?: number;
}

export class MicSession {
  readonly events = new Emitter<MicSessionEvents>();

  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private frame: number | null = null;
  private buffer: Uint8Array<ArrayBuffer> | null = null;

  /** Rolling loudness history as [timestamp, level] pairs. */
  private history: Array<[number, number]> = [];
  private readonly historyFrames: number;

  private running = false;
  private deviceLabel = "";

  constructor(options: MicSessionOptions = {}) {
    this.historyFrames = options.historyFrames ?? 120;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get label(): string {
    return this.deviceLabel;
  }

  static isSupported(): boolean {
    return (
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof AudioContext !== "undefined"
    );
  }

  async start(): Promise<boolean> {
    if (this.running) return true;

    if (!MicSession.isSupported()) {
      // getUserMedia is undefined on http:// origins, which is the most
      // likely cause here and produces a very confusing error otherwise.
      const insecure =
        typeof window !== "undefined" && !window.isSecureContext;
      this.fail(
        insecure ? "insecure-context" : "unsupported",
        insecure
          ? "Microphone access requires HTTPS (or localhost)."
          : "This browser cannot capture microphone audio.",
      );
      return false;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      this.fail(...describeGetUserMediaError(error));
      return false;
    }

    this.deviceLabel = this.stream.getAudioTracks()[0]?.label ?? "Microphone";

    this.context = new AudioContext();
    // Browsers may hand back a suspended context when there was no user
    // gesture; resuming is harmless when it's already running.
    if (this.context.state === "suspended") {
      await this.context.resume().catch(() => {});
    }

    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.3;

    this.source = this.context.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser);
    // Note: intentionally NOT connected to destination — that would play the
    // microphone back through the speakers and feed back into the stream.

    this.buffer = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    this.running = true;
    this.history = [];
    this.events.emit("started", undefined);
    this.loop();

    return true;
  }

  stop(): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }

    this.source?.disconnect();
    this.source = null;
    this.analyser = null;
    this.buffer = null;

    // close() returns a promise; failure here is not actionable.
    this.context?.close().catch(() => {});
    this.context = null;

    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;

    if (this.running) {
      this.running = false;
      this.events.emit("level", 0);
      this.events.emit("stopped", undefined);
    }
  }

  /**
   * Peak loudness over the last `windowMs`, 0..1.
   *
   * Used as the classifier's `audioEnergy` signal: "oh no" shouted and "oh no"
   * muttered produce identical transcripts but should not produce identical
   * chat reactions. Peak rather than mean, because a single loud moment in an
   * otherwise quiet sentence is exactly what we want to catch.
   */
  recentEnergy(windowMs = 2500): number {
    const cutoff = performance.now() - windowMs;
    let peak = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      const [at, level] = this.history[i];
      if (at < cutoff) break;
      if (level > peak) peak = level;
    }
    return peak;
  }

  private loop = (): void => {
    if (!this.analyser || !this.buffer) return;

    // Time-domain RMS, not a frequency-bin average. The previous code averaged
    // getByteFrequencyData, which is a poor loudness proxy — it reports high
    // values for quiet-but-broadband noise and low values for loud pure tones.
    this.analyser.getByteTimeDomainData(this.buffer);

    let sumSquares = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const centered = (this.buffer[i] - 128) / 128;
      sumSquares += centered * centered;
    }
    const rms = Math.sqrt(sumSquares / this.buffer.length);

    // Speech RMS sits well below 1.0, so scale into a usable meter range.
    const level = Math.min(1, rms * 3.2);

    const now = performance.now();
    this.history.push([now, level]);
    if (this.history.length > this.historyFrames) this.history.shift();

    this.events.emit("level", level);
    this.frame = requestAnimationFrame(this.loop);
  };

  private fail(code: MicErrorCode, message: string): void {
    this.events.emit("error", { code, message });
  }
}

function describeGetUserMediaError(
  error: unknown,
): [MicErrorCode, string] {
  const name = error instanceof Error ? error.name : "";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return [
        "permission-denied",
        "Microphone access was blocked. Allow it in your browser's site settings.",
      ];
    case "NotFoundError":
    case "OverconstrainedError":
      return ["no-device", "No microphone was found."];
    case "NotReadableError":
      return [
        "no-device",
        "The microphone is in use by another application.",
      ];
    default:
      return ["unknown", "Could not start the microphone."];
  }
}
