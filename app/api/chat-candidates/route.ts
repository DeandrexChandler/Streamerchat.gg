import { NextResponse } from "next/server";
import { RateLimiter, clientKey } from "@/lib/http/rate-limit";
import { createGeminiProvider } from "@/lib/ai/gemini";
import { createOpenAiProvider } from "@/lib/ai/openai";
import { createMockProvider } from "@/lib/ai/mock";
import { AiRateLimiter, KEY_ENV, loadAiConfig } from "@/lib/ai/config";
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

  const apiKey = process.env[KEY_ENV[config.provider]] ?? "";
  const settings = {
    apiKey,
    model: model || config.model,
    maxOutputTokens: config.maxOutputTokens,
  };

  const provider =
    config.mode === "mock"
      ? createMockProvider()
      : config.provider === "gemini"
        ? createGeminiProvider(settings)
        : createOpenAiProvider(settings);

  console.log(
    `[ai] → ${provider.name} | ctx=${candidateRequest.history.length} | batch=${count} | "${said}"`,
  );

  limiter.record();
  const started = Date.now();
  const generated = await provider.generate({ ...candidateRequest, count });
  const elapsed = Date.now() - started;

  // Validation runs server-side so a client cannot skip it.
  const validated = validateReactions(generated.reactions, candidateRequest.recent);

  /**
   * The provider's own verdict wins when it failed.
   *
   * "all-rejected" only makes sense if something actually came back; reporting
   * it for a rejected key would send the streamer looking at safety rules for
   * an authentication problem.
   */
  const status =
    generated.status !== "ok"
      ? generated.status
      : validated.reactions.length === 0
        ? "all-rejected"
        : "ok";

  if (validated.reactions.length === 0) {
    const counts = Object.entries(validated.rejected)
      .filter(([, n]) => n > 0)
      .map(([rule, n]) => `${rule}=${n}`)
      .join(" ");
    console.warn(
      `[ai] ← EMPTY after ${elapsed}ms | provider=${generated.status}` +
        `${counts ? ` | rejected ${counts}` : ""}` +
        `${generated.detail ? ` | ${generated.detail}` : ""}`,
    );
  } else {
    console.log(
      `[ai] ← ${validated.reactions.length} reactions in ${elapsed}ms` +
        `${validated.echoed ? " (echoes — everything else duplicated recent chat)" : ""}`,
    );
  }

  return NextResponse.json(
    {
      reactions: validated.reactions,
      status,
      rejected: validated.rejected,
      echoed: validated.echoed,
      usage: limiter.usage(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
