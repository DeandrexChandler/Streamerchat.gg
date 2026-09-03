import { buildPrompt } from "./prompt";
import { parseReactions } from "./parse";
import type {
  CandidateProvider,
  CandidateRequest,
  GenerationResult,
  ProviderStatus,
} from "./provider";

/**
 * OpenAI implementation of the candidate provider.
 *
 * Same contract as every other provider: it returns reactions and a reason,
 * and never throws. Swapping upstreams is a config change because nothing
 * outside this file knows which one is in use.
 */

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

/**
 * Generous, because latency is bimodal in practice — usually around a second,
 * with occasional multi-second outliers. Kept under the limiter's spacing so a
 * slow request cannot still be running when the next is allowed.
 */
const TIMEOUT_MS = 20_000;

export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export interface OpenAiOptions {
  apiKey: string;
  model?: string;
  maxOutputTokens?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Maps an HTTP status onto something the streamer can act on.
 *
 * 404 is separated from other 4xx because providers retire models, and that
 * reads as a broken app unless it is named for what it is.
 */
function statusFor(httpStatus: number): ProviderStatus {
  if (httpStatus === 401 || httpStatus === 403) return "auth";
  if (httpStatus === 404) return "model-missing";
  if (httpStatus === 429) return "quota";
  if (httpStatus >= 500) return "network";
  return "bad-response";
}

export function createOpenAiProvider(options: OpenAiOptions): CandidateProvider {
  const model = options.model || DEFAULT_OPENAI_MODEL;
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  return {
    name: `openai:${model}`,

    async generate(request: CandidateRequest): Promise<GenerationResult> {
      try {
        const response = await doFetch(ENDPOINT, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            // Header, never a query parameter: a key in a URL ends up in logs,
            // proxies and error messages.
            authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: buildPrompt(request) }],
            // High on purpose: the deterministic tiers cover predictable
            // reactions, so this exists for phrasings a table would not hold.
            temperature: 1.1,
            top_p: 0.95,
            max_tokens: options.maxOutputTokens ?? 1200,
            response_format: { type: "json_object" },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          const status = statusFor(response.status);
          console.warn(
            `[ai] ${model} HTTP ${response.status} (${status}): ${detail.slice(0, 300)}`,
          );
          return { reactions: [], status, detail: detail.slice(0, 300) };
        }

        const body = (await response.json()) as {
          choices?: Array<{
            message?: { content?: string };
            finish_reason?: string;
          }>;
        };

        const text = body.choices?.[0]?.message?.content ?? "";
        if (!text.trim()) {
          const finish = body.choices?.[0]?.finish_reason ?? "none";
          console.warn(`[ai] ${model} returned no text (finish_reason ${finish})`);
          return {
            reactions: [],
            status: "empty",
            detail: `finish_reason ${finish}`,
          };
        }

        const reactions = parseReactions(text);
        if (reactions.length === 0) {
          console.warn(`[ai] ${model} output could not be parsed: ${text.slice(0, 200)}`);
          return { reactions, status: "bad-response", detail: text.slice(0, 200) };
        }
        return { reactions, status: "ok" };
      } catch (error) {
        // Timeout, DNS, connection reset. Named, because a silent empty batch
        // is indistinguishable from a refusal.
        const detail = String(error).slice(0, 200);
        const timedOut = detail.includes("Timeout") || detail.includes("abort");
        console.warn(`[ai] ${model} request failed: ${detail}`);
        return {
          reactions: [],
          status: timedOut ? "timeout" : "network",
          detail,
        };
      }
    },
  };
}
