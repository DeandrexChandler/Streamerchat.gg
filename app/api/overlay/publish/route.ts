import { NextResponse } from "next/server";
import { RateLimiter, clientKey } from "@/lib/http/rate-limit";
import { overlayHub } from "@/lib/overlay/hub";
import {
  MAX_PUBLISH_BODY_BYTES,
  OverlayPublishSchema,
} from "@/lib/overlay/protocol";

/**
 * Simulator -> relay. One POST per engine tick carrying the messages the
 * scheduler just released.
 *
 * Spends no money, but it writes text onto someone's live broadcast, so it is
 * treated like any other write endpoint: size-capped, schema-validated, rate
 * limited, and it never creates a session — a publish to a key nobody is
 * listening on is a no-op that reports zero subscribers back to the client,
 * which is how the transport knows to go quiet.
 */

export const dynamic = "force-dynamic";

/**
 * The engine ticks 5x a second; the ceiling is well above that so a burst of
 * retries is absorbed rather than punished, while a runaway loop still stops.
 */
const limiter = new RateLimiter({ windowMs: 60_000, maxRequests: 900 });

export async function POST(request: Request) {
  if (limiter.check(clientKey(request))) {
    return NextResponse.json(
      { error: "Publishing too fast." },
      { status: 429 },
    );
  }

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_PUBLISH_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const raw = await request.text();
  // content-length is a claim, not a fact — check the body we actually read.
  if (raw.length > MAX_PUBLISH_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  const parsed = OverlayPublishSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const { key, messages, clear, emotes } = parsed.data;
  const hub = overlayHub();

  if (emotes) {
    hub.publish(key, { event: "emotes", data: JSON.stringify({ emotes }) });
  }
  if (clear) {
    hub.publish(key, { event: "clear", data: "{}" });
  }
  if (messages.length > 0) {
    hub.publish(key, { event: "chat", data: JSON.stringify({ messages }) });
  }

  return NextResponse.json(
    { subscribers: hub.subscriberCount(key) },
    { headers: { "cache-control": "no-store" } },
  );
}
