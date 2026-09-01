import { describe, expect, it, vi } from "vitest";
import { createGeminiProvider } from "../gemini";
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
    model: "gemini-2.5-flash",
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
      model: "gemini-2.5-flash-lite",
      fetchImpl: impl as unknown as typeof fetch,
    }).generate(request);
    expect(String(impl.mock.calls[0][0])).toContain("gemini-2.5-flash-lite");
  });
});
