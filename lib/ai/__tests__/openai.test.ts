import { describe, expect, it, vi } from "vitest";
import { createOpenAiProvider } from "../openai";
import type { CandidateRequest } from "../provider";

/** Every case is driven through the injected fetch. Nothing reaches OpenAI. */

const request: CandidateRequest = {
  utterance: "hi",
  history: [],
  classification: {
    intent: "greeting",
    sentiment: "neutral",
    energy: 0.1,
    keywords: [],
    confidence: 1,
  },
  emotes: ["KEKW"],
  recent: [],
  count: 8,
};

function provider(fetchImpl: unknown, model?: string) {
  return createOpenAiProvider({
    apiKey: "test-key",
    model,
    fetchImpl: fetchImpl as typeof fetch,
  });
}

const reply = (content: string, finish = "stop") =>
  vi.fn(async () =>
    ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content }, finish_reason: finish }],
      }),
    }) as unknown as Response,
  );

const httpError = (status: number) =>
  vi.fn(async () =>
    ({ ok: false, status, text: async () => `{"error":{"code":${status}}}` }) as unknown as Response,
  );

describe("request shape", () => {
  it("posts to the chat completions endpoint", async () => {
    const impl = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => (await reply('[{"text":"hi"}]')()) as Response,
    );
    await provider(impl).generate(request);
    expect(String(impl.mock.calls[0][0])).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });

  it("sends the key as a bearer header, never in the url", async () => {
    const impl = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => (await reply('[{"text":"hi"}]')()) as Response,
    );
    await provider(impl).generate(request);
    const [url, init] = impl.mock.calls[0];
    expect(String(url)).not.toContain("test-key");
    expect((init!.headers as Record<string, string>).authorization).toBe(
      "Bearer test-key",
    );
  });

  it("carries the transcript into the prompt", async () => {
    const impl = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => (await reply('[{"text":"hi"}]')()) as Response,
    );
    await provider(impl).generate({ ...request, utterance: "lets play Valorant" });
    const body = JSON.parse(String(impl.mock.calls[0][1]!.body));
    expect(body.messages[0].content).toContain("lets play Valorant");
  });

  it("defaults to gpt-4o-mini and honours an override", async () => {
    const impl = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => (await reply('[{"text":"hi"}]')()) as Response,
    );
    await provider(impl).generate(request);
    expect(JSON.parse(String(impl.mock.calls[0][1]!.body)).model).toBe("gpt-4o-mini");

    const impl2 = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => (await reply('[{"text":"hi"}]')()) as Response,
    );
    await provider(impl2, "gpt-4.1-mini").generate(request);
    expect(JSON.parse(String(impl2.mock.calls[0][1]!.body)).model).toBe("gpt-4.1-mini");
  });
});

describe("parsing", () => {
  it("reads the assistant message", async () => {
    const out = await provider(reply('[{"text":"yooo","emotion":"hype"}]')).generate(request);
    expect(out.status).toBe("ok");
    expect(out.reactions[0].text).toBe("yooo");
    expect(out.reactions[0].emotion).toBe("hype");
  });

  it("accepts a wrapper object, which json_object mode encourages", async () => {
    // response_format json_object forbids a bare array, so the model wraps it.
    const out = await provider(reply('{"reactions":[{"text":"hi"},{"text":"hey"}]}'))
      .generate(request);
    expect(out.reactions.map((r) => r.text)).toEqual(["hi", "hey"]);
  });

  it("accepts bare strings inside a wrapper", async () => {
    const out = await provider(reply('{"messages":["hi","hey"]}')).generate(request);
    expect(out.reactions.map((r) => r.text)).toEqual(["hi", "hey"]);
  });
});

describe("failures are named, not merged", () => {
  it.each([
    [401, "auth"],
    [403, "auth"],
    [404, "model-missing"],
    [429, "quota"],
    [500, "network"],
    [400, "bad-response"],
  ])("reports HTTP %i as %s", async (code, expected) => {
    const out = await provider(httpError(code)).generate(request);
    expect(out.status).toBe(expected);
    expect(out.reactions).toEqual([]);
  });

  it("separates a timeout from a network failure", async () => {
    const impl = vi.fn(async () => {
      throw new Error("TimeoutError: signal timed out");
    });
    expect((await provider(impl).generate(request)).status).toBe("timeout");
  });

  it("reports a connection reset as a network failure", async () => {
    const impl = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    expect((await provider(impl).generate(request)).status).toBe("network");
  });

  it("reports an empty completion, carrying the finish reason", async () => {
    const out = await provider(reply("", "content_filter")).generate(request);
    expect(out.status).toBe("empty");
    expect(out.detail).toContain("content_filter");
  });

  it("reports prose as a bad response rather than as empty", async () => {
    const out = await provider(reply("Sure! Here are some chat messages.")).generate(request);
    expect(out.status).toBe("bad-response");
  });

  it("never throws, whatever happens", async () => {
    const impl = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(provider(impl).generate(request)).resolves.toBeDefined();
  });
});

describe("short inputs still work", () => {
  it.each(["hi", "hello", "spam W", "lets go"])(
    "produces reactions for %j",
    async (utterance) => {
      const out = await provider(reply('{"reactions":["yo","W","hey"]}')).generate({
        ...request,
        utterance,
      });
      expect(out.status).toBe("ok");
      expect(out.reactions.length).toBeGreaterThan(0);
    },
  );
});
