import { NextResponse } from "next/server";
import { z } from "zod";
import { RateLimiter, clientKey } from "@/lib/http/rate-limit";
import { DEFAULT_MODEL, createGeminiProvider } from "@/lib/ai/gemini";
import { validateCandidates } from "@/lib/ai/validate";
import type { Intent, Sentiment } from "@/lib/engine/types";

/**
 * AI candidate refill.
 *
 * The key lives here and only here — never NEXT_PUBLIC_, which would inline it
 * into the client bundle and ship it to every visitor.
 *
 * SECURITY POSTURE, stated so it is not discovered later. CLAUDE.md requires
 * that any route which spends money be authenticated, rate limited and size
 * capped. This one is rate limited and size capped. It is NOT authenticated,
 * because the product has no accounts and none are wanted.
 *
 * That is acceptable while this runs on localhost, and only there. Exposed to
 * a network it is an open relay on the owner's API key. The real backstop is
 * lib/engine/ai-budget.ts, which caps calls per hour and per session on the
 * client; the limiter here only stops a runaway loop.
 *
 * A missing key returns 200 with no lines rather than an error: running with
 * zero keys set is a supported state, not a failure.
 */

export const dynamic = "force-dynamic";

/**
 * The budget guard allows at most 90 calls an hour per session. This sits well
 * above that so a couple of people sharing one instance are never throttled,
 * while a loop still stops.
 */
const limiter = new RateLimiter({ windowMs: 60_000, maxRequests: 30 });

const MAX_BODY_BYTES = 16 * 1024;

/**
 * Annotated against the engine's own unions, so if an intent is added there
 * and not here the build breaks rather than this route silently rejecting
 * every request carrying the new value.
 */
const IntentSchema: z.ZodType<Intent> = z.enum([
  "greeting",
  "question_to_chat",
  "excitement",
  "struggle",
  "achievement",
  "story",
  "confusion",
  "showing",
  "farewell",
  "mundane",
]);

const SentimentSchema: z.ZodType<Sentiment> = z.enum([
  "positive",
  "negative",
  "neutral",
]);

const RequestSchema = z.object({
  classification: z.object({
    intent: IntentSchema,
    sentiment: SentimentSchema,
    energy: z.number().min(0).max(1),
    keywords: z.array(z.string().max(40)).max(12),
    confidence: z.number().min(0).max(1),
  }),
  emotes: z.array(z.string().max(60)).max(200).default([]),
  recent: z.array(z.string().max(200)).max(30).default([]),
  streamer: z.string().max(40).optional(),
  topic: z.string().max(80).optional(),
  count: z.number().int().min(1).max(24).default(12),
  model: z.string().max(60).optional(),
});

export async function POST(request: Request) {
  if (limiter.check(clientKey(request))) {
    return NextResponse.json({ lines: [], error: "rate-limited" }, { status: 429 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ lines: [], error: "too-large" }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ lines: [], error: "malformed" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ lines: [], error: "invalid" }, { status: 400 });
  }

  // The key check sits *after* validation on purpose. Running with no key is
  // the normal state during development, and short-circuiting before parsing
  // would return 200 for a malformed request and hide client bugs exactly
  // when they are cheapest to find.
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    // Not an error. The app is required to run fully with no keys set.
    return NextResponse.json(
      { lines: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const { model, ...candidateRequest } = parsed.data;

  const provider = createGeminiProvider({
    apiKey,
    model: model || DEFAULT_MODEL,
  });

  const generated = await provider.generate(candidateRequest);

  // Validation runs server-side so a client cannot skip it.
  const lines = validateCandidates(generated, candidateRequest.recent);

  return NextResponse.json({ lines }, { headers: { "cache-control": "no-store" } });
}
