import { NextResponse } from "next/server";
import { RateLimiter, clientKey } from "@/lib/http/rate-limit";
import { createGeminiProvider } from "@/lib/ai/gemini";
import { AiRateLimiter, loadAiConfig, type AiConfig } from "@/lib/ai/config";
import type { CandidateProvider } from "@/lib/ai/provider";
import { validateReactions } from "@/lib/ai/validate";
import { CandidateRequestSchema } from "@/lib/ai/schema";
import type { Reaction } from "@/lib/ai/reaction";

/**
 * Chat batch generation.
 *
 * One request per batch, returning lines the simulation releases over the
 * following seconds. Never one call per rendered message.
 *
 * The key lives here and only here — never NEXT_PUBLIC_, which would inline it
 * into the client bundle.
 *
 * WHAT THE BROWSER IS TOLD. Two things: the reactions, and whether the batch
 * is "ok" or "unavailable". Nothing else. Provider names, HTTP statuses,
 * quota state, validation counts and error text stay in the server log,
 * because the person reading the browser is live on stream and cannot act on
 * any of it. The person reading the server log can.
 *
 * SECURITY POSTURE. CLAUDE.md requires that any route which spends money be
 * authenticated, rate limited and size capped. This one is rate limited and
 * size capped. It is NOT authenticated, because the product has no accounts.
 * That is acceptable on localhost and nowhere else: exposed to a network it is
 * an open relay on the owner's API key.
 */

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32 * 1024;

/** The only two things a client ever learns. */
export type BatchStatus = "ok" | "unavailable";

export interface BatchResponse {
  reactions: Reaction[];
  status: BatchStatus;
}

export interface HandlerDeps {
  config: AiConfig;
  provider: CandidateProvider;
  limiter: AiRateLimiter;
  httpLimiter: RateLimiter;
  log?: Pick<Console, "log" | "warn">;
}

const unavailable = (): BatchResponse => ({ reactions: [], status: "unavailable" });

/**
 * The route body, with every dependency injectable.
 *
 * Tests drive this with a mock provider and never reach the network. The
 * exported POST below binds the real ones.
 */
export function createCandidatesHandler(deps: HandlerDeps) {
  const { config, provider, limiter, httpLimiter } = deps;
  const log = deps.log ?? console;

  return async function handle(request: Request): Promise<Response> {
    const noStore = { headers: { "cache-control": "no-store" } };

    if (httpLimiter.check(clientKey(request))) {
      return NextResponse.json(unavailable(), { status: 429, ...noStore });
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json(unavailable(), { status: 413, ...noStore });
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json(unavailable(), { status: 400, ...noStore });
    }

    const parsed = CandidateRequestSchema.safeParse(json);
    if (!parsed.success) {
      // Which field, and why — in the log, where it can be acted on.
      const issues = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      log.warn(`[ai] INVALID REQUEST — ${issues}`);
      return NextResponse.json(unavailable(), { status: 400, ...noStore });
    }

    const candidateRequest = parsed.data;
    const count = Math.min(candidateRequest.count, config.maxBatchSize);
    const label = describe(candidateRequest);

    const refusal = limiter.refusal();
    if (refusal) {
      log.warn(`[ai] REFUSED (${refusal}) | ${label}`);
      return NextResponse.json(unavailable(), noStore);
    }

    /**
     * Exactly one retry.
     *
     * A transient failure — a timeout, a 5xx, a batch the validator emptied —
     * is worth a second attempt, because the alternative is ten seconds of
     * silence on stream. A second failure is not worth a third: at that point
     * the provider is down or the key is wrong, and hammering it fixes
     * neither. The next batch will try again on its own.
     */
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      limiter.record();
      const started = Date.now();
      const generated = await provider.generate({ ...candidateRequest, count });
      const elapsed = Date.now() - started;

      // Validation runs server-side so a client cannot skip it.
      const validated = validateReactions(generated.reactions, candidateRequest.recent);

      if (generated.status === "ok" && validated.reactions.length > 0) {
        log.log(
          `[ai] ← ${validated.reactions.length} lines in ${elapsed}ms` +
            `${attempt > 1 ? " (retry)" : ""} | ${label}` +
            `${validated.echoed ? " | echoes only" : ""}`,
        );
        return NextResponse.json(
          { reactions: validated.reactions, status: "ok" } satisfies BatchResponse,
          noStore,
        );
      }

      const counts = Object.entries(validated.rejected)
        .filter(([, n]) => n > 0)
        .map(([rule, n]) => `${rule}=${n}`)
        .join(" ");
      log.warn(
        `[ai] ← EMPTY (attempt ${attempt}/2) after ${elapsed}ms` +
          ` | provider=${generated.status}` +
          `${counts ? ` | rejected ${counts}` : ""}` +
          `${generated.detail ? ` | ${generated.detail}` : ""}` +
          ` | ${label}`,
      );
    }

    log.warn(`[ai] GIVING UP on this batch — chat stays quiet | ${label}`);
    return NextResponse.json(unavailable(), noStore);
  };
}

/** One line that says what was asked for, for the log. */
function describe(request: { utterance: string; count: number; history: readonly string[] }): string {
  return `ctx=${request.history.length} | batch=${request.count} | "${request.utterance.slice(0, 80)}"`;
}

// ---------------------------------------------------------------- production

/**
 * Process-wide, so the ceilings actually hold.
 *
 * Pinned to globalThis because `next dev` re-evaluates modules on hot reload,
 * and a limiter that resets on every edit protects nothing during exactly the
 * session it exists for.
 */
const globalRef = globalThis as typeof globalThis & {
  __aiLimiter?: AiRateLimiter;
  __aiHttpLimiter?: RateLimiter;
};

export async function POST(request: Request) {
  const config = loadAiConfig();
  const handler = createCandidatesHandler({
    config,
    provider: createGeminiProvider({
      apiKey: config.apiKey,
      model: config.model,
      maxOutputTokens: config.maxOutputTokens,
    }),
    limiter: (globalRef.__aiLimiter ??= new AiRateLimiter(config)),
    httpLimiter: (globalRef.__aiHttpLimiter ??= new RateLimiter({
      windowMs: 60_000,
      maxRequests: 60,
    })),
  });
  return handler(request);
}
