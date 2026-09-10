import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AiRateLimiter, KEY_ENV, MODEL, loadAiConfig } from "../config";

/**
 * One provider, one model, pinned.
 *
 * A testing phase once added a second provider and left it as the default,
 * so a correctly configured Google key was ignored. There is no longer a
 * selection to get wrong, and this makes sure one does not creep back.
 */

let saved: string | undefined;

beforeEach(() => {
  saved = process.env[KEY_ENV];
  delete process.env[KEY_ENV];
});

afterEach(() => {
  if (saved === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = saved;
});

describe("AI configuration", () => {
  it("is Gemini Flash-Lite, always", () => {
    expect(MODEL).toBe("gemini-3.5-flash-lite");
    expect(loadAiConfig().model).toBe("gemini-3.5-flash-lite");
  });

  it("reads the key from GOOGLE_API_KEY", () => {
    expect(KEY_ENV).toBe("GOOGLE_API_KEY");
    process.env.GOOGLE_API_KEY = "test-key";
    expect(loadAiConfig().apiKey).toBe("test-key");
  });

  it("has no provider or model switch to flip", () => {
    const config = loadAiConfig() as unknown as Record<string, unknown>;
    expect(config).not.toHaveProperty("provider");
    expect(config).not.toHaveProperty("mode");
  });

  it("refuses every call with no key rather than calling anything", () => {
    const limiter = new AiRateLimiter(loadAiConfig());
    expect(limiter.refusal(0)).toBe("no-key");
  });

  it("allows a healthy continuous session's call rate", () => {
    // Continuous chat refills about every ten seconds. Six calls in a minute
    // must never trip the ceiling.
    process.env.GOOGLE_API_KEY = "test-key";
    const limiter = new AiRateLimiter(loadAiConfig());
    for (let i = 0; i < 6; i += 1) {
      expect(limiter.refusal(i * 10_000)).toBeNull();
      limiter.record(i * 10_000);
    }
  });

  it("enforces the cooldown between calls", () => {
    process.env.GOOGLE_API_KEY = "test-key";
    const limiter = new AiRateLimiter(loadAiConfig());
    limiter.record(0);
    expect(limiter.refusal(500)).toBe("cooldown");
    expect(limiter.refusal(5_000)).toBeNull();
  });
});
