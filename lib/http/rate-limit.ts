/**
 * Sliding-window rate limiter for API routes.
 *
 * Small and in-memory on purpose — the same reasoning as the overlay hub:
 * one process, one laptop. It exists so a runaway client (or a leaked overlay
 * key) can't spin a route forever, not because we expect adversarial traffic.
 *
 * `Date.now()` is injectable so the window behaviour is testable without
 * sleeping, and the bucket map self-prunes so a long-running dev server does
 * not accumulate a key per client forever.
 */
export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  /** Buckets tracked before the pruner runs. */
  maxKeys?: number;
}

export class RateLimiter {
  private hits = new Map<string, number[]>();
  private readonly maxKeys: number;

  constructor(private readonly options: RateLimitOptions) {
    this.maxKeys = options.maxKeys ?? 256;
  }

  /** Records an attempt. Returns true when the caller has exceeded the limit. */
  check(key: string, now: number = Date.now()): boolean {
    const { windowMs, maxRequests } = this.options;

    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    this.hits.set(key, recent);

    if (this.hits.size > this.maxKeys) this.prune(now);

    return recent.length > maxRequests;
  }

  private prune(now: number): void {
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= this.options.windowMs)) {
        this.hits.delete(key);
      }
    }
  }

  get size(): number {
    return this.hits.size;
  }
}

/**
 * Best-effort caller identity.
 *
 * Behind a proxy this is the forwarded address; run locally there is no such
 * header and every request is the same machine, so they share one bucket. That
 * is the correct behaviour for the intended deployment rather than a gap.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}
