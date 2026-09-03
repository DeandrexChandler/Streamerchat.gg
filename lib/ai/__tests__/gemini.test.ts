import { describe, expect, it, vi } from "vitest";
import { createGeminiProvider } from "../gemini";
import { parseReactions } from "../parse";
import type { CandidateRequest } from "../provider";

const request: CandidateRequest = {
  utterance: "look at this roof",
  history: [],
  classification: {
    intent: "excitement",
    sentiment: "positive",
    energy: 0.8,
    keywords: [],
    confidence: 0.4,
  },
  emotes: ["KEKW"],
  recent: [],
  count: 3,
};

function reply(text: string) {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  } as Response;
}

function provider(fetchImpl: unknown) {
  return createGeminiProvider({
    apiKey: "test-key",
    model: "gemini-3.5-flash-lite",
    fetchImpl: fetchImpl as typeof fetch,
  });
}

describe("gemini provider", () => {
  it("maps a well-formed batch to reactions", async () => {
    const p = provider(
      vi.fn(async () =>
        reply('[{"text":"no shot","emotion":"hype"},{"text":"actual cinema"}]'),
      ),
    );
    const out = (await p.generate(request)).reactions;
    expect(out.map((r) => r.text)).toEqual(["no shot", "actual cinema"]);
    expect(out[0].emotion).toBe("hype");
  });

  it("tolerates a fenced code block, which models add unprompted", async () => {
    const p = provider(
      vi.fn(async () => reply('```json\n[{"text":"w"},{"text":"gg"}]\n```')),
    );
    expect((await p.generate(request)).reactions.map((r) => r.text)).toEqual(["w", "gg"]);
  });

  it("tolerates prose wrapped around the array", async () => {
    const p = provider(
      vi.fn(async () => reply('Sure!\n[{"text":"one"},{"text":"two"}]\nHope that helps.')),
    );
    expect((await p.generate(request)).reactions.map((r) => r.text)).toEqual(["one", "two"]);
  });

  it("returns nothing when there is no JSON at all", async () => {
    const p = provider(vi.fn(async () => reply("no shot\nactual cinema")));
    expect((await p.generate(request)).reactions).toEqual([]);
  });

  it("returns [] on malformed output rather than throwing", async () => {
    const p = provider(vi.fn(async () => reply("")));
    expect((await p.generate(request)).reactions).toEqual([]);
  });

  it("returns [] on an HTTP error", async () => {
    const p = provider(vi.fn(async () => ({ ok: false, status: 429 }) as Response));
    expect((await p.generate(request)).reactions).toEqual([]);
  });

  it("returns [] when the request throws", async () => {
    const p = provider(
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    expect((await p.generate(request)).reactions).toEqual([]);
  });

  it("drops malformed entries", async () => {
    const p = provider(vi.fn(async () => reply('[{"text":"ok"},5,null,{"text":"fine"}]')));
    expect((await p.generate(request)).reactions.map((r) => r.text)).toEqual(["ok", "fine"]);
  });

  it("sends the key in a header, never in the url", async () => {
    const impl = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => reply('["w"]'),
    );
    await provider(impl).generate(request);
    const [url, init] = impl.mock.calls[0];
    expect(String(url)).not.toContain("test-key");
    expect(
      (init!.headers as Record<string, string>)["x-goog-api-key"],
    ).toBe("test-key");
  });

  it("targets the configured model", async () => {
    const impl = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => reply('["w"]'),
    );
    await createGeminiProvider({
      apiKey: "k",
      model: "gemini-3.6-flash",
      fetchImpl: impl as unknown as typeof fetch,
    }).generate(request);
    expect(String(impl.mock.calls[0][0])).toContain("gemini-3.6-flash");
  });
});

/**
 * Truncation regression.
 *
 * Gemini 3.x models spend output tokens on reasoning before answering, so a
 * 400-token cap was consumed almost entirely by thinking and the JSON array
 * came back cut off mid-string. The newline fallback then "salvaged" that into
 * fragments like `[` and `holy roof Pog",` — which are not chat messages, and
 * which sail past a validator looking for length and tone.
 */
describe("parseReactions on truncated output", () => {
  it("salvages the complete objects from a cut-off array", () => {
    const out = parseReactions('[{"text":"no shot"},{"text":"actual cinema"},{"text":"wait is th');
    expect(out.map((r) => r.text)).toEqual(["no shot", "actual cinema"]);
  });

  it("never emits bare JSON punctuation as a message", () => {
    const out = parseReactions('[{"text":"gg"},{"text":"holy roof"},{"text":"wait is');
    expect(out.map((r) => r.text)).not.toContain("[");
  });

  it("returns nothing when a truncated array has no complete object", () => {
    expect(parseReactions('[{"text":"wait is th')).toEqual([]);
  });

  it("handles escaped quotes inside a salvaged object", () => {
    const out = parseReactions(
      '[{"text":"he said \\"what\\""},{"text":"lol"},',
    );
    expect(out.map((r) => r.text)).toEqual(['he said "what"', "lol"]);
  });

  it("returns nothing for plain prose with no array at all", () => {
    expect(parseReactions("no shot\nactual cinema")).toEqual([]);
  });
});
