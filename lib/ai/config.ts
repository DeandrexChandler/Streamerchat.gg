/**
 * AI limits, read from the environment.
 *
 * Configuration rather than constants scattered through the code, because the
 * numbers that matter during development are quota numbers — and the person
 * who needs to change them is testing against a free tier, not editing the
 * engine.
 *
 * Every value has a conservative default, so an empty `.env.local` is a safe
 * `.env.local`.
 */

export type AiMode = "live" | "mock" | "off";

/** Which upstream to call. Configuration, never a rewrite. */
export type AiProviderId = "openai" | "gemini";

const DEFAULT_MODELS: Record<AiProviderId, string> = {
  openai: "gpt-4o-mini",
  gemini: "gemini-3.5-flash-lite",
};

/** The env var each provider reads its key from. */
export const KEY_ENV: Record<AiProviderId, string> = {
  openai: "OPENAI_API_KEY",
  gemini: "GOOGLE_API_KEY",
};

export interface AiConfig {
  mode: AiMode;
  provider: AiProviderId;
  model: string;
  /** Ceilings. The per-minute one is what protects a free-tier daily quota. */
  maxCallsPerMinute: number;
  maxCallsPerHour: number;
  /** Minimum gap between calls, independent of the ceilings above. */
  cooldownMs: number;
  maxOutputTokens: number;
  /**
   * Hard cap on reactions per request.
   *
   * A backstop, not a target. Chat speed scales the requested batch, and this
   * exists so a UI slider can never drive spend past a known ceiling.
   */
  maxBatchSize: number;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function loadAiConfig(): AiConfig {
  const provider: AiProviderId =
    (process.env.AI_PROVIDER ?? "").toLowerCase() === "gemini" ? "gemini" : "openai";

  const hasKey = Boolean(process.env[KEY_ENV[provider]]);
  const requested = (process.env.AI_MODE ?? "").toLowerCase();

  const mode: AiMode =
    requested === "mock" || requested === "off"
      ? requested
      : // No key is "off", not an error: running with zero keys is supported.
        hasKey
        ? "live"
        : "off";

  return {
    mode,
    provider,
    model: process.env.AI_MODEL || DEFAULT_MODELS[provider],
    maxCallsPerMinute: num("AI_MAX_CALLS_PER_MINUTE", 6),
    maxCallsPerHour: num("AI_MAX_CALLS_PER_HOUR", 120),
    cooldownMs: num("AI_COOLDOWN_MS", 3_000),
    maxOutputTokens: num("AI_MAX_OUTPUT_TOKENS", 1_200),
    maxBatchSize: num("AI_MAX_BATCH_SIZE", 25),
  };
}

/** Why a request was refused, for the log line the developer actually reads. */
export type RefusalReason = "cooldown" | "per-minute" | "per-hour" | "disabled";

/**
 * Call ceilings.
 *
 * Deliberately separate from the engine's older AiBudget, which counted
 * session-long spend. This one exists to keep a debugging session inside a
 * free-tier daily quota, which is a different problem with different numbers.
 */
export class AiRateLimiter {
  private calls: number[] = [];
  private lastCallAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly config: AiConfig) {}

  /** Null when a call is allowed, otherwise why it is not. */
  refusal(now: number = Date.now()): RefusalReason | null {
    if (this.config.mode === "off") return "disabled";
    if (now - this.lastCallAt < this.config.cooldownMs) return "cooldown";

    this.calls = this.calls.filter((t) => now - t < 3_600_000);
    const lastMinute = this.calls.filter((t) => now - t < 60_000).length;

    if (lastMinute >= this.config.maxCallsPerMinute) return "per-minute";
    if (this.calls.length >= this.config.maxCallsPerHour) return "per-hour";
    return null;
  }

  record(now: number = Date.now()): void {
    this.lastCallAt = now;
    this.calls.push(now);
  }

  /** For the status line: how much of each ceiling is used. */
  usage(now: number = Date.now()): { minute: number; hour: number } {
    this.calls = this.calls.filter((t) => now - t < 3_600_000);
    return {
      minute: this.calls.filter((t) => now - t < 60_000).length,
      hour: this.calls.length,
    };
  }
}
