import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSpeechProvider } from "../web-speech";

/**
 * Stand-in for the browser's SpeechRecognition.
 *
 * Chrome's real implementation ends recognition on its own, repeatedly, over a
 * long session. That behaviour is the whole reason the provider has restart
 * logic, and it can't be exercised against a real browser in unit tests — so
 * this fake lets us drive `onend` and `onerror` deliberately.
 */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  static failOnStart = false;

  continuous = false;
  interimResults = false;
  lang = "";
  maxAlternatives = 0;

  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;

  started = false;
  aborted = false;

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start(): void {
    if (FakeRecognition.failOnStart) throw new Error("InvalidStateError");
    this.started = true;
    this.onstart?.();
  }

  stop(): void {
    this.started = false;
  }

  abort(): void {
    this.aborted = true;
    this.started = false;
  }

  /** Simulates Chrome ending the session by itself. */
  endNaturally(): void {
    this.started = false;
    this.onend?.();
  }

  emitFinal(transcript: string): void {
    this.onresult?.({
      resultIndex: 0,
      results: [Object.assign([{ transcript }], { isFinal: true })],
    });
  }

  emitInterim(transcript: string): void {
    this.onresult?.({
      resultIndex: 0,
      results: [Object.assign([{ transcript }], { isFinal: false })],
    });
  }
}

const latest = () => FakeRecognition.instances.at(-1)!;

beforeEach(() => {
  vi.useFakeTimers();
  FakeRecognition.instances = [];
  FakeRecognition.failOnStart = false;
  vi.stubGlobal("window", { SpeechRecognition: FakeRecognition });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("WebSpeechProvider", () => {
  it("reports support when the API is present", () => {
    expect(new WebSpeechProvider().isSupported()).toBe(true);
  });

  it("reports no support when the API is absent", () => {
    vi.stubGlobal("window", {});
    expect(new WebSpeechProvider().isSupported()).toBe(false);
  });

  it("emits a fatal error on an unsupported browser", async () => {
    vi.stubGlobal("window", {});
    const provider = new WebSpeechProvider();
    const onError = vi.fn();
    provider.events.on("error", onError);

    await provider.start();

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "not-supported", fatal: true }),
    );
    expect(provider.isRunning).toBe(false);
  });

  it("configures continuous recognition with interim results", async () => {
    await new WebSpeechProvider().start();
    expect(latest().continuous).toBe(true);
    expect(latest().interimResults).toBe(true);
  });

  it("emits final transcripts", async () => {
    const provider = new WebSpeechProvider();
    const onFinal = vi.fn();
    provider.events.on("final", onFinal);

    await provider.start();
    latest().emitFinal("chat what do you think");

    expect(onFinal).toHaveBeenCalledWith({ text: "chat what do you think" });
  });

  it("emits interim transcripts separately from finals", async () => {
    const provider = new WebSpeechProvider();
    const onFinal = vi.fn();
    const onInterim = vi.fn();
    provider.events.on("final", onFinal);
    provider.events.on("interim", onInterim);

    await provider.start();
    latest().emitInterim("chat what do you");

    expect(onInterim).toHaveBeenCalledWith({ text: "chat what do you" });
    expect(onFinal).not.toHaveBeenCalled();
  });

  it("filters recogniser artefacts out of finals", async () => {
    const provider = new WebSpeechProvider();
    const onFinal = vi.fn();
    provider.events.on("final", onFinal);

    await provider.start();
    latest().emitFinal("Thank you.");
    latest().emitFinal("uh");

    expect(onFinal).not.toHaveBeenCalled();
  });

  it("restarts itself when Chrome ends the session", async () => {
    // Without this, transcription silently dies after ~a minute of a stream
    // and the app looks broken with no error anywhere.
    const provider = new WebSpeechProvider();
    await provider.start();
    expect(FakeRecognition.instances).toHaveLength(1);

    latest().endNaturally();
    await vi.advanceTimersByTimeAsync(300);

    expect(FakeRecognition.instances.length).toBeGreaterThan(1);
    expect(latest().started).toBe(true);
  });

  it("does NOT restart after stop()", async () => {
    const provider = new WebSpeechProvider();
    await provider.start();
    provider.stop();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(FakeRecognition.instances).toHaveLength(1);
    expect(provider.isRunning).toBe(false);
  });

  it("aborts rather than stops, so no restart is triggered", async () => {
    const provider = new WebSpeechProvider();
    await provider.start();
    const instance = latest();
    provider.stop();
    expect(instance.aborted).toBe(true);
  });

  it("backs off exponentially when restarts keep failing", async () => {
    // A recogniser that fails instantly must degrade to occasional retries,
    // never a hot loop that pins the CPU.
    const provider = new WebSpeechProvider();
    await provider.start();

    FakeRecognition.failOnStart = true;
    latest().endNaturally();

    await vi.advanceTimersByTimeAsync(300);
    const afterFirst = FakeRecognition.instances.length;

    // A long stretch must produce only a handful of attempts, not hundreds.
    await vi.advanceTimersByTimeAsync(30_000);
    const attempts = FakeRecognition.instances.length - afterFirst;

    expect(attempts).toBeGreaterThan(0);
    expect(attempts).toBeLessThan(12);
  });

  it("resets the backoff once real speech comes through", async () => {
    const provider = new WebSpeechProvider();
    await provider.start();

    // Burn the backoff up with failures.
    FakeRecognition.failOnStart = true;
    latest().endNaturally();
    await vi.advanceTimersByTimeAsync(20_000);

    // Recovery: a successful session that produces speech.
    FakeRecognition.failOnStart = false;
    await vi.advanceTimersByTimeAsync(10_000);
    latest().emitFinal("okay we are back and talking again");

    const before = FakeRecognition.instances.length;
    latest().endNaturally();
    // Backoff should be back to its minimum, so this restarts promptly.
    await vi.advanceTimersByTimeAsync(300);

    expect(FakeRecognition.instances.length).toBeGreaterThan(before);
  });

  it("ignores routine no-speech and aborted errors", async () => {
    // These fire constantly during normal silence and must never reach the UI.
    const provider = new WebSpeechProvider();
    const onError = vi.fn();
    provider.events.on("error", onError);

    await provider.start();
    latest().onerror?.({ error: "no-speech" });
    latest().onerror?.({ error: "aborted" });

    expect(onError).not.toHaveBeenCalled();
  });

  it("surfaces a permission denial as fatal and stops running", async () => {
    const provider = new WebSpeechProvider();
    const onError = vi.fn();
    provider.events.on("error", onError);

    await provider.start();
    latest().onerror?.({ error: "not-allowed" });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "permission-denied", fatal: true }),
    );
    expect(provider.isRunning).toBe(false);
  });

  it("does not restart after a fatal error", async () => {
    const provider = new WebSpeechProvider();
    await provider.start();
    latest().onerror?.({ error: "not-allowed" });
    latest().endNaturally();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it("treats a network error as non-fatal and keeps trying", async () => {
    const provider = new WebSpeechProvider();
    const onError = vi.fn();
    provider.events.on("error", onError);

    await provider.start();
    latest().onerror?.({ error: "network" });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "network", fatal: false }),
    );
    expect(provider.isRunning).toBe(true);
  });

  it("start() twice does not spawn a second recogniser", async () => {
    const provider = new WebSpeechProvider();
    await provider.start();
    await provider.start();
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it("survives start() throwing InvalidStateError", async () => {
    FakeRecognition.failOnStart = true;
    const provider = new WebSpeechProvider();

    await expect(provider.start()).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(1000);
    expect(provider.isRunning).toBe(true);
  });
});
