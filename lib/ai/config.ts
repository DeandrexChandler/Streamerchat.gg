/**
 * AI configuration, read from the environment.
 *
 * One provider, one model. There is no selection here on purpose: the product
 * is a Gemini wrapper, and a testing phase that added a second provider left
 * the default pointing at the wrong one. Configuration that can be wrong is
 * configuration nobody asked for.
 *
 * Every limit has a conservative default, so an empty `.env.local` is a safe
 * `.env.local`. The one thing that must be set is the key.
 */

/** The model this project chose by measurement — see lib/ai/gemini.ts. */
export const MODEL = "gemini-3.5-flash-lite";

/** The env var holding the Gemini key. Never NEXT_PUBLIC_. */
export const KEY_ENV = "GOOGLE_API_KEY";

export interface AiConfig {
  /** Empty when unset. The route treats that as "unavailable", never as an error. */
  apiKey: string;
  model: string;
  /**
   * Call ceilings.
   *
   * Continuous chat refills roughly every ten to fifteen seconds at any speed
   * tier, which is four to six calls a minute. The ceilings sit above that
   * so a healthy session never trips them, and far enough below runaway to
   * protect a key from a defect.
   */
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
  return {
    apiKey: process.env[KEY_ENV] ?? "",
    model: MODEL,
    maxCallsPerMinute: num("AI_MAX_CALLS_PER_MINUTE", 10),
    maxCallsPerHour: num("AI_MAX_CALLS_PER_HOUR", 500),
    cooldownMs: num("AI_COOLDOWN_MS", 2_500),
    maxOutputTokens: num("AI_MAX_OUTPUT_TOKENS", 3_000),
    maxBatchSize: num("AI_MAX_BATCH_SIZE", 60),
  };
}

/** Why a request was refused, for the log line the developer actually reads. */
export type RefusalReason = "cooldown" | "per-minute" | "per-hour" | "no-key";

/**
 * Call ceilings.
 *
 * Exists to keep a session inside a sane spend and a defect from spinning on
 * the key. Not a pacing control: the engine decides when a batch is needed.
 */
export class AiRateLimiter {
  private calls: number[] = [];
  private lastCallAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly config: AiConfig) {}

  /** Null when a call is allowed, otherwise why it is not. */
  refusal(now: number = Date.now()): RefusalReason | null {
    if (!this.config.apiKey) return "no-key";
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

  /** For the log line: how much of each ceiling is used. */
  usage(now: number = Date.now()): { minute: number; hour: number } {
    this.calls = this.calls.filter((t) => now - t < 3_600_000);
    return {
      minute: this.calls.filter((t) => now - t < 60_000).length,
      hour: this.calls.length,
    };
  }
}
