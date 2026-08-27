/**
 * Hard spending limits for the AI tier.
 *
 * The tier itself isn't built yet, but the guard is, because the failure it
 * prevents is expensive and silent. The governing rule:
 *
 *   **AI cost scales with session length, never with message volume.**
 *
 * That distinction matters more than it sounds. At the top speed setting the
 * engine emits ~400 messages a minute against ~30 at the default — a 13x
 * swing. If refills were triggered per-message, turning up chat speed would
 * multiply the API bill by thirteen while the streamer's actual speech, which
 * is the only thing worth generating against, stayed exactly the same.
 *
 * So every limit here is measured in wall-clock time and absolute call counts.
 * Nothing consults the message rate.
 *
 * Layers, cheapest first:
 *
 *  1. Batching. One call returns many candidate lines, drained over the
 *     following half-minute. A refill amortises across ~15-20 messages.
 *  2. A minimum interval between calls, so a burst of speech can't stack them.
 *  3. Hourly and per-session ceilings, so a stream left running overnight has
 *     a knowable worst case rather than an open tab.
 *  4. Exponential backoff on failure, so an outage or a bad key degrades to
 *     occasional retries instead of hammering a dead endpoint.
 */

export interface AiBudgetOptions {
  /** Minimum wall-clock gap between calls. */
  minIntervalMs?: number;
  maxCallsPerHour?: number;
  /** Absolute ceiling for one session. The overnight-stream backstop. */
  maxCallsPerSession?: number;
  /** Rough input+output tokens per call, for cost reporting. */
  estimatedTokensPerCall?: number;
}

const DEFAULTS = {
  // A batch covers ~20-30s of chat, so refilling faster than this throws away
  // candidates that were still perfectly usable.
  minIntervalMs: 25_000,
  maxCallsPerHour: 90,
  maxCallsPerSession: 400,
  estimatedTokensPerCall: 900,
} as const;

export interface AiBudgetStats {
  calls: number;
  estimatedTokens: number;
  /** Requests refused by a limit. High values mean the tier is over-eager. */
  blocked: number;
  failures: number;
  /** Null when nothing is holding it back right now. */
  blockedBy: string | null;
}

export class AiBudget {
  private readonly minIntervalMs: number;
  private readonly maxCallsPerHour: number;
  private readonly maxCallsPerSession: number;
  private readonly tokensPerCall: number;

  private callTimes: number[] = [];
  private totalCalls = 0;
  private blocked = 0;
  private failures = 0;
  private lastCallAt = -Infinity;
  /** Set after a failure; no calls until this passes. */
  private backoffUntil = 0;

  constructor(options: AiBudgetOptions = {}) {
    this.minIntervalMs = options.minIntervalMs ?? DEFAULTS.minIntervalMs;
    this.maxCallsPerHour = options.maxCallsPerHour ?? DEFAULTS.maxCallsPerHour;
    this.maxCallsPerSession =
      options.maxCallsPerSession ?? DEFAULTS.maxCallsPerSession;
    this.tokensPerCall =
      options.estimatedTokensPerCall ?? DEFAULTS.estimatedTokensPerCall;
  }

  /** Why a call would be refused right now, or null if it's allowed. */
  blockReason(now: number): string | null {
    if (now < this.backoffUntil) return "backoff";
    if (this.totalCalls >= this.maxCallsPerSession) return "session-limit";
    if (now - this.lastCallAt < this.minIntervalMs) return "min-interval";
    if (this.callsInLastHour(now) >= this.maxCallsPerHour) return "hourly-limit";
    return null;
  }

  canSpend(now: number): boolean {
    const reason = this.blockReason(now);
    if (reason) this.blocked++;
    return reason === null;
  }

  /** Records a successful call. Call this when the request is *issued*. */
  record(now: number): void {
    this.lastCallAt = now;
    this.totalCalls++;
    this.callTimes.push(now);
    this.backoffUntil = 0;
    this.failures = 0;
  }

  /**
   * Records a failure and backs off.
   *
   * Doubling from 30s to a 10 minute ceiling: long enough that a dead endpoint
   * costs almost nothing, short enough that a transient blip recovers within a
   * stream.
   */
  recordFailure(now: number): void {
    this.failures++;
    const delay = Math.min(600_000, 30_000 * Math.pow(2, this.failures - 1));
    this.backoffUntil = now + delay;
    this.lastCallAt = now;
  }

  private callsInLastHour(now: number): number {
    const cutoff = now - 3_600_000;
    while (this.callTimes.length > 0 && this.callTimes[0] < cutoff) {
      this.callTimes.shift();
    }
    return this.callTimes.length;
  }

  stats(now = Date.now()): AiBudgetStats {
    return {
      calls: this.totalCalls,
      estimatedTokens: this.totalCalls * this.tokensPerCall,
      blocked: this.blocked,
      failures: this.failures,
      blockedBy: this.blockReason(now),
    };
  }

  reset(): void {
    this.callTimes = [];
    this.totalCalls = 0;
    this.blocked = 0;
    this.failures = 0;
    this.lastCallAt = -Infinity;
    this.backoffUntil = 0;
  }
}
