import { describe, expect, it, vi } from "vitest";
import { createGeminiProvider } from "../gemini";
import { parseReactions } from "../parse";
import type { CandidateRequest } from "../provider";

const request: CandidateRequest = {
  phase: "active",
  continuation: false,
  silenceSeconds: 0,
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

/** Gemini's streamed reply: the text in a few server-sent events. */
function reply(text: string) {
  return sse(text.match(/[\s\S]{1,7}/g) ?? [""]);
}

function sse(pieces: readonly string[], finishReason = "STOP") {
  const events = pieces.map((piece, i) =>
    `data: ${JSON.stringify({
      candidates: [
        { content: { parts: [{ text: piece }] }, ...(i === pieces.length - 1 ? { finishReason } : {}) },
      ],
    })}\n\n`,
  );
  return new Response(events.join(""));
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
 * A reply that arrives over time, honouring the abort signal the way a real
 * fetch does. `script` is pieces of model text and the gaps before them.
 */
function streamed(script: ReadonlyArray<readonly [number, string]>) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const fail = () => controller.error(init?.signal?.reason ?? new Error("aborted"));
        init?.signal?.addEventListener("abort", fail);
        for (const [gap, text] of script) {
          await new Promise((resolve) => setTimeout(resolve, gap));
          if (init?.signal?.aborted) return;
          const event = { candidates: [{ content: { parts: [{ text }] } }] };
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        if (!init?.signal?.aborted) controller.close();
      },
    });
    return new Response(body);
  });
}

describe("gemini provider, streamed", () => {
  it("hands lines on as they arrive, not when the batch is done", async () => {
    vi.useFakeTimers();
    try {
      const seen: Array<[number, string[]]> = [];
      const started = Date.now();
      const pending = provider(
        streamed([
          [800, '[{"text":"no shot"},{"te'],
          [800, 'xt":"actual cinema"},'],
          [2_000, '{"text":"clip it"}]'],
        ]),
      ).generate(request, {
        onLines: (lines) => seen.push([Date.now() - started, lines.map((l) => l.text)]),
      });
      await vi.advanceTimersByTimeAsync(4_000);
      const result = await pending;

      expect(seen).toEqual([
        [800, ["no shot"]],
        [1_600, ["actual cinema"]],
        [3_600, ["clip it"]],
      ]);
      expect(result.reactions.map((r) => r.text)).toEqual(["no shot", "actual cinema", "clip it"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("calls a reply with no first line inside five seconds a timeout, not 30", async () => {
    // A hang used to cost the full whole-batch timeout before the retry
    // could even go out. Streamed, a healthy reply shows itself at once.
    vi.useFakeTimers();
    try {
      const pending = provider(streamed([[30_000, '[{"text":"late"}]']])).generate(request);
      await vi.advanceTimersByTimeAsync(5_100);
      const result = await pending;
      expect(result.status).toBe("timeout");
      expect(result.reactions).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps what arrived when the stream stalls, rather than calling it a failure", async () => {
    vi.useFakeTimers();
    try {
      const pending = provider(
        streamed([
          [500, '[{"text":"no shot"},{"text":"actual cinema"},'],
          [30_000, '{"text":"never"}]'],
        ]),
      ).generate(request);
      await vi.advanceTimersByTimeAsync(6_000);
      const result = await pending;
      expect(result.status).toBe("ok");
      expect(result.reactions.map((r) => r.text)).toEqual(["no shot", "actual cinema"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads a brace inside a line as text, not the end of the line", async () => {
    const result = await provider(vi.fn(async () => reply('{"event":"win","reactions":[{"text":"hi :}"},{"text":"gg {"}]}'))).generate(request);
    expect(result.reactions.map((r) => r.text)).toEqual(["hi :}", "gg {"]);
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
