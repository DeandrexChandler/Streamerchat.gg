import { describe, expect, it, vi } from "vitest";
import { createGeminiProvider, parseLines } from "../gemini";
import type { CandidateRequest } from "../provider";

const request: CandidateRequest = {
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
    model: "gemini-3.6-flash",
    fetchImpl: fetchImpl as typeof fetch,
  });
}

describe("gemini provider", () => {
  it("maps a well-formed JSON array to lines", async () => {
    const p = provider(vi.fn(async () => reply('["no shot", "actual cinema"]')));
    expect(await p.generate(request)).toEqual(["no shot", "actual cinema"]);
  });

  it("tolerates a fenced code block, which models add unprompted", async () => {
    const p = provider(
      vi.fn(async () => reply('```json\n["w", "gg"]\n```')),
    );
    expect(await p.generate(request)).toEqual(["w", "gg"]);
  });

  it("tolerates prose wrapped around the array", async () => {
    const p = provider(
      vi.fn(async () => reply('Sure! Here you go:\n["one", "two"]\nHope that helps.')),
    );
    expect(await p.generate(request)).toEqual(["one", "two"]);
  });

  it("falls back to newline splitting when there is no array", async () => {
    const p = provider(vi.fn(async () => reply("no shot\nactual cinema")));
    expect(await p.generate(request)).toEqual(["no shot", "actual cinema"]);
  });

  it("returns [] on malformed output rather than throwing", async () => {
    const p = provider(vi.fn(async () => reply("")));
    expect(await p.generate(request)).toEqual([]);
  });

  it("returns [] on an HTTP error", async () => {
    const p = provider(vi.fn(async () => ({ ok: false, status: 429 }) as Response));
    await expect(p.generate(request)).resolves.toEqual([]);
  });

  it("returns [] when the request throws", async () => {
    const p = provider(
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(p.generate(request)).resolves.toEqual([]);
  });

  it("drops non-string entries in the array", async () => {
    const p = provider(vi.fn(async () => reply('["ok", 5, null, "fine"]')));
    expect(await p.generate(request)).toEqual(["ok", "fine"]);
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
      model: "gemini-3.7-flash",
      fetchImpl: impl as unknown as typeof fetch,
    }).generate(request);
    expect(String(impl.mock.calls[0][0])).toContain("gemini-3.7-flash");
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
describe("parseLines on truncated output", () => {
  it("salvages the complete strings from a cut-off array", () => {
    expect(parseLines('[\n  "no shot",\n  "actual cinema",\n  "wait is th')).toEqual([
      "no shot",
      "actual cinema",
    ]);
  });

  it("never emits bare JSON punctuation as a message", () => {
    const lines = parseLines('[\n  "gg",\n  "holy roof Pog",\n  "wait is');
    expect(lines).not.toContain("[");
    expect(lines.some((l) => l.includes('",'))).toBe(false);
  });

  it("returns nothing when a truncated array has no complete string", () => {
    expect(parseLines('[\n  "wait is th')).toEqual([]);
  });

  it("handles escaped quotes inside a salvaged string", () => {
    expect(parseLines('[\n  "he said \\"what\\"",\n  "lol",')).toEqual([
      'he said "what"',
      "lol",
    ]);
  });

  it("still newline-splits plain prose with no array at all", () => {
    expect(parseLines("no shot\nactual cinema")).toEqual([
      "no shot",
      "actual cinema",
    ]);
  });
});
