import { NextRequest, NextResponse } from "next/server";
import { RateLimiter, clientKey } from "@/lib/http/rate-limit";
import {
  fetchChannelPack,
  fetchGlobalPack,
  fetchPopularPack,
  fetchSetPack,
} from "@/lib/emotes/seventv";

/**
 * 7TV import proxy.
 *
 * Server-side rather than fetching from the browser directly, for two
 * reasons: it keeps us off 7TV's CORS behaviour changing under us, and it
 * gives one place to cache. Nothing here spends money, but it does make
 * outbound requests, so it is rate limited like any other egress route.
 */

const limiter = new RateLimiter({ windowMs: 60_000, maxRequests: 12 });

export async function GET(request: NextRequest) {
  if (limiter.check(clientKey(request))) {
    return NextResponse.json(
      { error: "Too many imports. Wait a minute and try again." },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  const channel = searchParams.get("channel");
  const set = searchParams.get("set");
  const popular = searchParams.get("popular");

  try {
    const pack = popular
      ? await fetchPopularPack(Math.min(300, Math.max(1, Number(popular) || 150)))
      : channel
        ? await fetchChannelPack(channel)
        : set
          ? await fetchSetPack(set)
          : await fetchGlobalPack();

    if (pack.emotes.length === 0) {
      return NextResponse.json(
        {
          error:
            "That set has no animated emotes. Only animated ones are imported — still images make chat look like a screenshot.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json(pack, {
      // Emote sets change rarely; a short cache spares 7TV repeated identical
      // lookups when someone is experimenting with channel names.
      headers: { "cache-control": "public, max-age=300" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not reach 7TV.";
    console.error("Emote import failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
