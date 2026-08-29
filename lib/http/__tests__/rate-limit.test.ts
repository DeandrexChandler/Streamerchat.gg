import { describe, expect, it } from "vitest";
import { RateLimiter, clientKey } from "../rate-limit";

describe("RateLimiter", () => {
  it("allows requests up to the limit", () => {
    const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 3 });
    expect(limiter.check("a", 0)).toBe(false);
    expect(limiter.check("a", 10)).toBe(false);
    expect(limiter.check("a", 20)).toBe(false);
  });

  it("blocks once the limit is exceeded inside the window", () => {
    const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 2 });
    limiter.check("a", 0);
    limiter.check("a", 10);
    expect(limiter.check("a", 20)).toBe(true);
  });

  it("lets the window slide", () => {
    const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 2 });
    limiter.check("a", 0);
    limiter.check("a", 500);
    expect(limiter.check("a", 900)).toBe(true);
    // The first two attempts have aged out by now.
    expect(limiter.check("a", 1600)).toBe(false);
  });

  it("tracks callers separately", () => {
    const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 1 });
    limiter.check("a", 0);
    expect(limiter.check("a", 10)).toBe(true);
    expect(limiter.check("b", 10)).toBe(false);
  });

  it("prunes idle buckets rather than growing forever", () => {
    const limiter = new RateLimiter({
      windowMs: 1000,
      maxRequests: 10,
      maxKeys: 4,
    });
    for (let i = 0; i < 5; i += 1) limiter.check(`old-${i}`, 0);
    expect(limiter.size).toBe(5);

    limiter.check("new", 5000);
    expect(limiter.size).toBe(1);
  });
});

describe("clientKey", () => {
  it("uses the first forwarded address", () => {
    const request = new Request("http://localhost/x", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
    });
    expect(clientKey(request)).toBe("203.0.113.5");
  });

  it("falls back to a shared bucket when there is no proxy header", () => {
    expect(clientKey(new Request("http://localhost/x"))).toBe("local");
  });
});
