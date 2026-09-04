import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KEY_ENV, loadAiConfig } from "../config";

/**
 * The provider default, pinned.
 *
 * Nothing tested this, which is how a temporary OpenAI testing phase left
 * `openai` as the shipped default: a correctly configured GOOGLE_API_KEY was
 * ignored, and the streamer got a model error for a provider they had never
 * chosen and could not see.
 */

const TOUCHED = ["AI_PROVIDER", "AI_MODE", "AI_MODEL", ...Object.values(KEY_ENV)];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(TOUCHED.map((key) => [key, process.env[key]]));
  for (const key of TOUCHED) delete process.env[key];
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("provider configuration", () => {
  it("is Gemini with nothing set", () => {
    expect(loadAiConfig().provider).toBe("gemini");
  });

  it("uses the cheap Flash-Lite model chosen by measurement", () => {
    process.env.GOOGLE_API_KEY = "test-key";
    const config = loadAiConfig();
    expect(config.provider).toBe("gemini");
    expect(config.model).toBe("gemini-3.5-flash-lite");
  });

  it("reads Gemini's key from GOOGLE_API_KEY", () => {
    expect(KEY_ENV.gemini).toBe("GOOGLE_API_KEY");
  });

  it("goes live on a Google key alone, with no provider set", () => {
    process.env.GOOGLE_API_KEY = "test-key";
    expect(loadAiConfig().mode).toBe("live");
  });

  it("switches to OpenAI only when explicitly asked", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    const config = loadAiConfig();
    expect(config.provider).toBe("openai");
    expect(config.model).toBe("gpt-4o-mini");
  });

  it("stays on Gemini for an unrecognised provider name", () => {
    process.env.AI_PROVIDER = "anthropic";
    expect(loadAiConfig().provider).toBe("gemini");
  });

  it("never falls back to OpenAI when the Google key is missing", () => {
    // The failure mode worth naming: no key should mean "not configured",
    // never "quietly call a different vendor".
    const config = loadAiConfig();
    expect(config.provider).toBe("gemini");
    expect(config.mode).not.toBe("live");
  });
});
