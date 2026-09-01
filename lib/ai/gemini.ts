import { buildPrompt } from "./prompt";
import type { CandidateProvider, CandidateRequest } from "./provider";

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

/** Long enough for a batch, short enough that a hang doesn't stall a refill. */
const TIMEOUT_MS = 12_000;

export const DEFAULT_MODEL = "gemini-2.5-flash";

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Pulls a list of strings out of whatever the model actually returned.
 *
 * Asking for "a JSON array and nothing else" gets you a JSON array most of the
 * time. The rest of the time it arrives fenced in ```json, wrapped in a
 * sentence of preamble, or as plain newline-separated lines — so the parser
 * accepts all of those rather than discarding a usable batch on formatting.
 */
export function parseLines(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Widest bracketed span, which survives both fencing and surrounding prose.
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      const parsed: unknown = JSON.parse(trimmed.slice(start, end + 1));
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === "string");
      }
    } catch {
      // Fall through to newline splitting.
    }
  }

  return trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("```"));
}

export function createGeminiProvider(options: GeminiOptions): CandidateProvider {
  const model = options.model || DEFAULT_MODEL;
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  return {
    name: `gemini:${model}`,

    async generate(request: CandidateRequest): Promise<string[]> {
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
                maxOutputTokens: 400,
                responseMimeType: "application/json",
              },
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          },
        );

        if (!response.ok) return [];

        const body = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };

        const text = body.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        return parseLines(text);
      } catch {
        // Timeout, network failure, malformed JSON — all the same to callers.
        return [];
      }
    },
  };
}
