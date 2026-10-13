import { describe, expect, it, vi } from "vitest";
import { createOpenAiProvider } from "../openai";
import type { CandidateRequest } from "../provider";

/** DEV-MODEL-TOGGLE: deleted with the OpenAI provider if Gemini is kept. */

const request: CandidateRequest = {
  phase: "active",
  continuation: false,
  silenceSeconds: 0,
  utterance: "look at this roof",
  history: [],
  classification: { intent: "excitement", sentiment: "positive", energy: 0.8, keywords: [], confidence: 0.4 },
  emotes: [],
  recent: [],
  count: 2,
};

/** OpenAI's streamed shape: deltas, a usage-only chunk, then [DONE]. */
function stream(pieces: string[]) {
  const events = [
    ...pieces.map((content) => ({ choices: [{ delta: { content }, finish_reason: null }], usage: null })),
    { choices: [], usage: { prompt_tokens: 900, completion_tokens: 40 } },
  ];
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n",
  );
}

describe("openai provider", () => {
  it("reads streamed deltas into lines, with usage, and tolerates [DONE]", async () => {
    const seen: string[] = [];
    const result = await createOpenAiProvider({
      apiKey: "k",
      fetchImpl: vi.fn(async () => stream(['{"reactions":[{"text":"no ', 'shot"},{"text":"clip it"}]}'])) as unknown as typeof fetch,
    }).generate(request, { onLines: (lines) => seen.push(...lines.map((l) => l.text)) });

    expect(seen).toEqual(["no shot", "clip it"]);
    expect(result.status).toBe("ok");
    expect(result.usage).toEqual({ input: 900, output: 40 });
  });

  it("sends the key as a bearer token and reasoning switched off", async () => {
    const impl = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => stream(['["w"]']));
    await createOpenAiProvider({ apiKey: "secret", fetchImpl: impl as unknown as typeof fetch }).generate(request);
    const [url, init] = impl.mock.calls[0];
    expect(String(url)).not.toContain("secret");
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer secret");
    expect(JSON.parse(String(init!.body)).reasoning_effort).toBe("none");
  });
});
