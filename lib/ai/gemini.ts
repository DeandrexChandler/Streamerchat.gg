import { buildPrompt } from "./prompt";
import type {
  CandidateProvider,
  CandidateRequest,
  GenerationResult,
  ProviderStatus,
} from "./provider";
import { parseReactions } from "./parse";

/**
 * Gemini implementation of the candidate provider.
 *
 * Chosen over Flash-Lite because the failure this project is most exposed to
 * is output that reads as a corporate mascot, and over the 3.x Flash models
 * because they cost five to twenty times as much to write six-word chat lines
 * and skew more polite, which is the wrong direction for this register.
 *
 * Every failure path resolves to `[]`. An AI outage must degrade variety, not
 * stop chat — so nothing here throws, and the caller cannot be made to care
 * whether the model answered.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Generous, because measured latency is bimodal.
 *
 * Five consecutive identical calls returned in 1276, 912, 821, 757 and 30395
 * ms — usually under a second and a half, with occasional severe outliers.
 * At 12s roughly a fifth of refills were being thrown away mid-flight while
 * the model was still answering perfectly well.
 *
 * Kept under the budget guard's 25s minimum call interval so a slow request
 * cannot still be running when the next one is allowed. A timeout resolves to
 * an empty batch, which the client treats as "nothing to add" rather than as a
 * failure, so the cost of the remaining outliers is one skipped refill.
 */
const TIMEOUT_MS = 30_000;

/**
 * Chosen by measuring, not by headline rates.
 *
 * The 2.5 family is closed to new API keys — both `gemini-2.5-flash` and
 * `gemini-2.5-flash-lite` return 404 "no longer available to new users", even
 * though the public pricing page still lists them. `ListModels` reports them
 * too, so the only way to know is to make a real call.
 *
 * Among what is actually reachable, measured against this app's real prompt
 * (~428 input tokens, six runs each):
 *
 *   3.5-flash-lite   428 in /  80 out / 0 thinking    $0.000329 per call
 *   3.1-flash-lite   428 in / 221 out / 121 thinking  $0.000438 per call
 *   3.6-flash        429 in /  93 out / 0-421 varies  $0.000670 per call
 *
 * 3.1-flash-lite has the cheaper published rates ($0.25/$1.50 against
 * $0.30/$2.50) and is still a third more expensive, because it spends
 * reasoning tokens on every call and those bill at the output rate. Writing
 * six-word chat messages does not need deliberation.
 *
 * 3.6-flash is the quality option, and its thinking is *variable* — measured
 * at both 0 and 421 tokens for identical requests — so its cost is far less
 * predictable. 3.5-flash-lite returned zero thinking tokens on every run.
 */
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  maxOutputTokens?: number;
  fetchImpl?: typeof fetch;
}

export function createGeminiProvider(options: GeminiOptions): CandidateProvider {
  const model = options.model || DEFAULT_MODEL;
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  return {
    name: `gemini:${model}`,

    async generate(request: CandidateRequest): Promise<GenerationResult> {
      try {
        const response = await doFetch(
          `${ENDPOINT}/${encodeURIComponent(model)}:generateContent`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              // Header rather than a query parameter: a key in the URL ends up
              // in logs, proxies and error messages.
              "x-goog-api-key": options.apiKey,
            },
            body: JSON.stringify({
              contents: [
                { role: "user", parts: [{ text: buildPrompt(request) }] },
              ],
              generationConfig: {
                // High temperature on purpose. The deterministic tiers already
                // cover the predictable reactions; this tier exists for the
                // phrasings a lookup table would never contain.
                temperature: 1.1,
                topP: 0.95,
                /**
                 * Generous because reasoning is billed and counted as output.
                 * At 400 the model spent 381 tokens thinking and emitted 15,
                 * truncating the JSON mid-string. Twelve short chat lines need
                 * well under 200; the headroom exists so a verbose run degrades
                 * to a smaller batch rather than to salvaged fragments.
                 */
                maxOutputTokens: options.maxOutputTokens ?? 2000,
                /**
                 * Writing six-word chat messages needs no deliberation, and
                 * thinking tokens are billed at the output rate — 515 of them
                 * against 78 real tokens in one measured call. LOW removes them
                 * entirely (`thoughtsTokenCount` disappears from the response).
                 */
                thinkingConfig: { thinkingLevel: "LOW" },
                responseMimeType: "application/json",
              },
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          },
        );

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          const status = statusFor(response.status);
          console.warn(
            `[ai] ${model} HTTP ${response.status} (${status}): ${detail.slice(0, 300)}`,
          );
          return { reactions: [], status, detail: detail.slice(0, 300) };
        }

        const body = (await response.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
            finishReason?: string;
          }>;
        };

        const text = body.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (!text.trim()) {
          // A 2xx with no text: usually a safety block or a finishReason that
          // stopped before any content was produced.
          const finish = body.candidates?.[0]?.finishReason ?? "none";
          console.warn(`[ai] ${model} returned no text (finishReason ${finish})`);
          return { reactions: [], status: "empty", detail: `finishReason ${finish}` };
        }

        const reactions = parseReactions(text);
        if (reactions.length === 0) {
          console.warn(`[ai] ${model} output could not be parsed: ${text.slice(0, 200)}`);
          return { reactions, status: "bad-response", detail: text.slice(0, 200) };
        }
        return { reactions, status: "ok" };
      } catch (error) {
        // Timeout, DNS, connection reset. Logged with the reason, because a
        // silent empty batch looks identical to a refusal.
        const detail = String(error).slice(0, 200);
        console.warn(`[ai] ${model} request failed: ${detail}`);
        return { reactions: [], status: "network", detail };
      }
    },
  };
}

/**
 * Maps an HTTP status onto something the streamer can act on.
 *
 * 404 is separated out because Google retires models and returns 404 with a
 * "no longer available to new users" message — which reads as a broken app
 * unless it is named for what it is.
 */
function statusFor(httpStatus: number): ProviderStatus {
  if (httpStatus === 401 || httpStatus === 403) return "auth";
  if (httpStatus === 404) return "model-missing";
  if (httpStatus === 429) return "quota";
  if (httpStatus >= 500) return "network";
  return "bad-response";
}
