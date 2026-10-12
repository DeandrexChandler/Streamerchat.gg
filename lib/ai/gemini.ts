import { buildPrompt } from "./prompt";
import type { CandidateProvider, CandidateRequest, GenerateOptions, GenerationResult } from "./provider";
import { generateStreamed } from "./streamed";

/**
 * Gemini implementation of the candidate provider.
 *
 * Chosen over Flash-Lite because the failure this project is most exposed to
 * is output that reads as a corporate mascot, and over the 3.x Flash models
 * because they cost five to twenty times as much to write six-word chat lines
 * and skew more polite, which is the wrong direction for this register.
 * Streaming, deadlines and failure handling live in `streamed.ts`.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

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

    generate(request: CandidateRequest, generateOptions?: GenerateOptions): Promise<GenerationResult> {
      return generateStreamed({
        model,
        options: generateOptions,
        open: (signal) =>
          doFetch(
          `${ENDPOINT}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
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
                {
                  role: "user",
                  parts: request.frame
                    ? [
                        { text: buildPrompt(request) },
                        { inlineData: { mimeType: "image/jpeg", data: request.frame } },
                      ]
                    : [{ text: buildPrompt(request) }],
                },
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
            signal,
          },
        ),
        read: (event) => {
          const chunk = event as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
            usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
          };
          const candidate = chunk.candidates?.[0];
          return {
            text: (candidate?.content?.parts ?? []).map((part) => part.text ?? "").join(""),
            finish: candidate?.finishReason,
            usage: chunk.usageMetadata
              ? {
                  input: chunk.usageMetadata.promptTokenCount ?? 0,
                  output: chunk.usageMetadata.candidatesTokenCount ?? 0,
                }
              : undefined,
          };
        },
      });
    },
  };
}
