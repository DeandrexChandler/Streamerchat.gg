import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifySignature } from "../stripe";
import { limitFor, planForPrice, priceIdFor, BATCHES_PER_MONTH } from "../plans";
import { recordAndCheck } from "../usage";
import { usageKey } from "../db";

const SECRET = "whsec_test";
const sign = (body: string, t: number, secret = SECRET) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

describe("verifySignature", () => {
  const now = 1_800_000_000_000;
  const t = now / 1000;
  it("accepts a fresh, correct signature", () => {
    expect(verifySignature("{}", sign("{}", t), SECRET, now)).toBe(true);
  });
  it("accepts when any v1 matches (secret rotation)", () => {
    expect(verifySignature("{}", `${sign("{}", t, "old")},v1=${sign("{}", t).split("v1=")[1]}`, SECRET, now)).toBe(true);
  });
  it("rejects a tampered body, wrong secret, stale timestamp, or no header", () => {
    expect(verifySignature('{"a":1}', sign("{}", t), SECRET, now)).toBe(false);
    expect(verifySignature("{}", sign("{}", t, "other"), SECRET, now)).toBe(false);
    expect(verifySignature("{}", sign("{}", t - 301), SECRET, now)).toBe(false);
    expect(verifySignature("{}", null, SECRET, now)).toBe(false);
    expect(verifySignature("{}", `t=${t},v1=short`, SECRET, now)).toBe(false);
  });
});

describe("plans", () => {
  it("no free tier: only an active or trialing subscription gets a limit", () => {
    expect(limitFor({ plan: "pro", status: "active" })).toBe(BATCHES_PER_MONTH.pro);
    expect(limitFor({ plan: "pro", status: "trialing" })).toBe(BATCHES_PER_MONTH.pro);
    expect(limitFor({ plan: "pro", status: "past_due" })).toBe(0);
    expect(limitFor({})).toBe(0);
    expect(limitFor({ plan: "unknown", status: "active" })).toBe(0);
  });
  it("maps plans to prices and back; free and unknown plans have no price", () => {
    const pro = priceIdFor("pro")!;
    expect(pro).toMatch(/^price_/);
    expect(planForPrice(pro)).toBe("pro");
    expect(priceIdFor("free")).toBeNull();
    expect(priceIdFor("nope")).toBeNull();
    expect(planForPrice("price_x")).toBe("unknown");
    expect(planForPrice(undefined)).toBe("unknown");
  });
  it("buckets usage by UTC month", () => {
    expect(usageKey("u", new Date("2026-11-30T23:59:59Z"))).toBe("usage:u:2026-11");
    expect(usageKey("u", new Date("2026-12-01T00:00:00Z"))).toBe("usage:u:2026-12");
  });
});

describe("recordAndCheck", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const withRedis = (count: number, plan: string | null, status: string | null) => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("KV_REST_API_URL", "https://kv.test");
    vi.stubEnv("KV_REST_API_TOKEN", "tok");
    const fetch = vi.fn(async () =>
      Response.json([{ result: count }, { result: 1 }, { result: plan }, { result: status }]),
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
  };

  it("is unlimited and touches nothing in local mode", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await recordAndCheck("u")).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("counts the batch and allows up to the limit", async () => {
    const fetch = withRedis(BATCHES_PER_MONTH.pro, "pro", "active");
    expect(await recordAndCheck("u", new Date("2026-11-08T00:00:00Z"))).toBe(true);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://kv.test/pipeline");
    expect(JSON.parse(init.body as string)[0]).toEqual(["INCR", "usage:u:2026-11"]);
  });
  it("refuses past the limit, and takes the refused batch back off the count", async () => {
    const fetch = withRedis(BATCHES_PER_MONTH.pro + 1, "pro", "active");
    expect(await recordAndCheck("u", new Date("2026-11-08T00:00:00Z"))).toBe(false);
    const [, init] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual([["DECR", "usage:u:2026-11"]]);
  });
  it("refuses anyone without a subscription", async () => {
    withRedis(1, null, null);
    expect(await recordAndCheck("u")).toBe(false);
  });
  it("fails closed when the database is down", async () => {
    withRedis(0, null, null).mockResolvedValue(new Response("", { status: 500 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await recordAndCheck("u")).toBe(false);
  });
});
