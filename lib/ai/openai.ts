import { buildPrompt } from "./prompt";
import type { CandidateProvider, CandidateRequest, GenerateOptions, GenerationResult } from "./provider";
import { generateStreamed } from "./streamed";

/**
 * OpenAI, for the model comparison only.
 *
 * DEV-MODEL-TOGGLE: exists so the owner can run the same session against
 * both models and keep one. Whichever loses is deleted with the toggle.
 *
 * gpt-6-luna is OpenAI's cheapest current model: $0.10 / $0.50 per million
 * tokens against Gemini Flash-Lite's $0.30 / $2.50, with image input and
 * reasoning that can be switched off. Same prompt, same streaming, same
 * deadlines as Gemini, so the comparison is the model and nothing else.
 */

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

export const OPENAI_MODEL = "gpt-6-luna";

export interface OpenAiOptions {
  apiKey: string;
  maxOutputTokens?: number;
  fetchImpl?: typeof fetch;
}

export function createOpenAiProvider(options: OpenAiOptions): CandidateProvider {
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  return {
    name: `openai:${OPENAI_MODEL}`,

    generate(request: CandidateRequest, generateOptions?: GenerateOptions): Promise<GenerationResult> {
      const prompt = buildPrompt(request);
      return generateStreamed({
        model: OPENAI_MODEL,
        options: generateOptions,
        open: (signal) =>
          doFetch(ENDPOINT, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${options.apiKey}`,
            },
            body: JSON.stringify({
              model: OPENAI_MODEL,
              stream: true,
              stream_options: { include_usage: true },
              // Chat lines need no deliberation, and reasoning bills as output.
              reasoning_effort: "none",
              max_completion_tokens: options.maxOutputTokens ?? 2000,
              response_format: { type: "json_object" },
              messages: [
                {
                  role: "user",
                  content: request.frame
                    ? [
                        { type: "text", text: prompt },
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${request.frame}` } },
                      ]
                    : prompt,
                },
              ],
            }),
            signal,
          }),
        read: (event) => {
          const chunk = event as {
            choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
          };
          const choice = chunk.choices?.[0];
          return {
            text: choice?.delta?.content ?? "",
            finish: choice?.finish_reason ?? undefined,
            usage: chunk.usage
              ? { input: chunk.usage.prompt_tokens ?? 0, output: chunk.usage.completion_tokens ?? 0 }
              : undefined,
          };
        },
      });
    },
  };
}
