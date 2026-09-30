import { NextResponse } from "next/server";
import { RateLimiter, clientKey } from "@/lib/http/rate-limit";
import { KEY_ENV, MODEL, loadAiConfig } from "@/lib/ai/config";

/**
 * Is the key there, and does Google accept it?
 *
 * Setup, not diagnostics. A missing or rejected key looks exactly like a
 * working one from the simulator — chat is silent when a batch fails, on
 * purpose — so the first run has no way to tell "nobody has spoken yet"
 * from "this was never going to work". This answers that question once, on
 * a settings page, and is never called while chat is running.
 *
 * Three rules it keeps:
 *
 *  - The key never leaves the server. The browser learns "ok", "missing",
 *    "rejected" or "unreachable", and nothing else.
 *  - No generation. It asks Google to describe the model, which costs
 *    nothing and still proves the key is accepted and the model exists.
 *  - Provider wording stays here. The simulator shows none of this.
 */

export const dynamic = "force-dynamic";

/** Opening a settings page is not a loop; this only stops one. */
const limiter = new RateLimiter({ windowMs: 60_000, maxRequests: 20 });

const TIMEOUT_MS = 6_000;

export type AiKeyState = "ok" | "missing" | "rejected" | "unreachable";

export async function GET(request: Request) {
  if (limiter.check(clientKey(request))) {
    return NextResponse.json({ state: "unreachable" satisfies AiKeyState }, { status: 429 });
  }

  const { apiKey } = loadAiConfig();
  if (!apiKey) {
    return NextResponse.json({ state: "missing" satisfies AiKeyState, env: KEY_ENV });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}`,
      {
        headers: { "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      },
    );

    if (response.ok) {
      return NextResponse.json({ state: "ok" satisfies AiKeyState, model: MODEL });
    }

    // 400 and 403 are what a bad key looks like; 404 means the key works but
    // cannot see this model, which needs the same action from the streamer.
    const state: AiKeyState =
      response.status === 400 || response.status === 403 || response.status === 404
        ? "rejected"
        : "unreachable";
    console.warn(`[ai] key check: HTTP ${response.status} for ${MODEL}`);
    return NextResponse.json({ state, model: MODEL });
  } catch (error) {
    console.warn(`[ai] key check failed: ${String(error).slice(0, 120)}`);
    return NextResponse.json({ state: "unreachable" satisfies AiKeyState });
  }
}
