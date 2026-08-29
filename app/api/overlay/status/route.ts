import { NextResponse } from "next/server";
import { RateLimiter, clientKey } from "@/lib/http/rate-limit";
import { overlayHub } from "@/lib/overlay/hub";
import { OVERLAY_KEY_PATTERN } from "@/lib/overlay/protocol";

/**
 * "Is my browser source actually attached?"
 *
 * Exists because the alternative is the streamer alt-tabbing to OBS to find
 * out, which is exactly the twenty minutes of guesswork the setup page is
 * meant to prevent. Polled by the OBS page while it is open.
 */

export const dynamic = "force-dynamic";

const limiter = new RateLimiter({ windowMs: 60_000, maxRequests: 120 });

export async function GET(request: Request) {
  if (limiter.check(clientKey(request))) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!OVERLAY_KEY_PATTERN.test(key)) {
    return NextResponse.json({ error: "Invalid key." }, { status: 400 });
  }

  return NextResponse.json(
    { subscribers: overlayHub().subscriberCount(key) },
    { headers: { "cache-control": "no-store" } },
  );
}
