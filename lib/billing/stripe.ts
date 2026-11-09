import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe over its REST API: plain fetch, no SDK. Three calls (checkout,
 * portal, read a subscription) and one signature check don't need one.
 */
export async function stripe<T = Record<string, unknown>>(path: string, params?: Record<string, string>): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  // Test mode only on this track. Taking real money is the owner's call; delete this line then.
  if (!key.startsWith("sk_test_")) throw new Error("STRIPE_SECRET_KEY must be a test-mode key (sk_test_)");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}` },
    body: params && new URLSearchParams(params),
    cache: "no-store",
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`stripe ${path}: ${body?.error?.message ?? res.status}`);
  return body as T;
}

const TOLERANCE_S = 300;

/**
 * Stripe's webhook signature: header `t=<unix>,v1=<hex>[,v1=...]`, where v1 is
 * HMAC-SHA256 of `${t}.${rawBody}` with the endpoint secret. Rejects anything
 * older than five minutes so a captured event can't be replayed.
 */
export function verifySignature(payload: string, header: string | null, secret: string, nowMs = Date.now()): boolean {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  if (!t || Math.abs(nowMs / 1000 - Number(t)) > TOLERANCE_S) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex"));
  return parts.some(([k, v]) => {
    if (k !== "v1" || !v) return false;
    const got = Buffer.from(v);
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
