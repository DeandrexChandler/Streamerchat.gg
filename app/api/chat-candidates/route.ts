import { NextResponse } from "next/server";
import { RateLimiter, clientKey } from "@/lib/http/rate-limit";
import { createGeminiProvider } from "@/lib/ai/gemini";
import { createMockProvider } from "@/lib/ai/mock";
import { AiRateLimiter, loadAiConfig } from "@/lib/ai/config";
import { validateReactions } from "@/lib/ai/validate";
import { CandidateRequestSchema } from "@/lib/ai/schema";

/**
 * Audience reaction generation.
 *
 * One request per streamer utterance, returning a batch the simulation then
 * releases over the following seconds. Never one call per rendered message.
 *
 * The key lives here and only here — never NEXT_PUBLIC_, which would inline it
 * into the client bundle.
 *
 * SECURITY POSTURE. CLAUDE.md requires that any route which spends money be
 * authenticated, rate limited and size capped. This one is rate limited and
 * size capped. It is NOT authenticated, because the product has no accounts.
 * That is acceptable on localhost and nowhere else: exposed to a network it is
 * an open relay on the owner's API key.
 */

export const dynamic = "force-dynamic";

const httpLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 60 });

/**
 * Process-wide, so the ceilings actually hold.
 *
 * Pinned to globalThis because `next dev` re-evaluates modules on hot reload,
 * and a limiter that resets on every edit protects nothing during exactly the
 * session it exists for.
 */
const globalRef = globalThis as typeof globalThis & {
  __aiLimiter?: AiRateLimiter;
};

const MAX_BODY_BYTES = 32 * 1024;

export async function POST(request: Request) {
  const config = loadAiConfig();
  const limiter = (globalRef.__aiLimiter ??= new AiRateLimiter(config));

  if (httpLimiter.check(clientKey(request))) {
    return NextResponse.json(
      { reactions: [], status: "http-rate-limited" },
      { status: 429 },
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ reactions: [], status: "too-large" }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ reactions: [], status: "malformed" }, { status: 400 });
  }

  const parsed = CandidateRequestSchema.safeParse(json);
  if (!parsed.success) {
    // Which field, and why. "invalid" on its own sends you reading the whole
    // request shape looking for the one thing that moved.
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    console.warn(`[ai] INVALID REQUEST — ${issues}`);
    return NextResponse.json(
      { reactions: [], status: "invalid", issues },
      { status: 400 },
    );
  }

  const { model, ...candidateRequest } = parsed.data;
  const count = Math.min(candidateRequest.count, config.maxBatchSize);
  const said = candidateRequest.utterance.slice(0, 80);

  const refusal = limiter.refusal();
  if (refusal) {
    // Visible, never silent: the developer has to be able to tell an exhausted
    // quota from a broken application.
    console.warn(`[ai] REFUSED (${refusal}) — falling back to templates | "${said}"`);
    return NextResponse.json(
      { reactions: [], status: refusal, usage: limiter.usage() },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const provider =
    config.mode === "mock"
      ? createMockProvider()
      : createGeminiProvider({
          apiKey: process.env.GOOGLE_API_KEY ?? "",
          model: model || config.model,
          maxOutputTokens: config.maxOutputTokens,
        });

  console.log(
    `[ai] → ${provider.name} | ctx=${candidateRequest.history.length} | batch=${count} | "${said}"`,
  );

  limiter.record();
  const started = Date.now();
  const generated = await provider.generate({ ...candidateRequest, count });
  const elapsed = Date.now() - started;

  // Validation runs server-side so a client cannot skip it.
  const reactions = validateReactions(generated, candidateRequest.recent);

  if (reactions.length === 0) {
    // Distinguished on purpose: "the model returned nothing" and "everything
    // it returned was rejected" have completely different causes, and a single
    // message for both sends you looking in the wrong place.
    const why =
      generated.length === 0
        ? "provider returned nothing — bad key, refusal, or timeout"
        : `all ${generated.length} rejected by validation`;
    console.warn(`[ai] ← EMPTY after ${elapsed}ms (${why})`);
  } else {
    console.log(`[ai] ← ${reactions.length} reactions in ${elapsed}ms`);
  }

  return NextResponse.json(
    { reactions, status: "ok", usage: limiter.usage() },
    { headers: { "cache-control": "no-store" } },
  );
}
