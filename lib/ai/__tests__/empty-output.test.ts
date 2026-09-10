import { describe, expect, it, vi } from "vitest";
import { createGeminiProvider } from "../gemini";
import { parseReactions } from "../parse";
import { validateReactions } from "../validate";
import type { CandidateRequest } from "../provider";

/**
 * Why a generation came back empty.
 *
 * The streamer used to be told the AI "returned nothing usable" and to try
 * saying something longer — for a rejected key, a spent quota, a retired
 * model, a parser that could not read a valid response, and a deduplicator
 * that had eaten a perfectly good batch. One message for six causes, and the
 * only one it named was the streamer's fault.
 *
 * Every case here is driven through the injected fetch. Nothing reaches a real
 * provider.
 */

const request: CandidateRequest = {
  phase: "active",
  continuation: false,
  silenceSeconds: 0,
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

function provider(fetchImpl: unknown) {
  return createGeminiProvider({
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: fetchImpl as typeof fetch,
  });
}

const httpError = (status: number) =>
  vi.fn(async () => ({
    ok: false,
    status,
    text: async () => `{"error":{"code":${status}}}`,
  }) as unknown as Response);

const replyText = (text: string, finishReason = "STOP") =>
  vi.fn(async () =>
    ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text }] }, finishReason }],
      }),
    }) as unknown as Response,
  );

describe("provider failures are named, not merged", () => {
  it.each([
    [401, "auth"],
    [403, "auth"],
    [404, "model-missing"],
    [429, "quota"],
    [500, "network"],
    [400, "bad-response"],
  ])("reports HTTP %i as %s", async (code, expected) => {
    const result = await provider(httpError(code)).generate(request);
    expect(result.status).toBe(expected);
    expect(result.reactions).toEqual([]);
  });

  it("reports a thrown request as a network failure", async () => {
    const impl = vi.fn(async () => {
      throw new Error("ETIMEDOUT");
    });
    const result = await provider(impl).generate(request);
    expect(result.status).toBe("network");
  });

  it("reports a 2xx with no text as empty, carrying the finish reason", async () => {
    const result = await provider(replyText("", "SAFETY")).generate(request);
    expect(result.status).toBe("empty");
    expect(result.detail).toContain("SAFETY");
  });

  it("reports unparseable output as a bad response, not as empty", async () => {
    const result = await provider(replyText("I'm sorry, I can't do that."))
      .generate(request);
    expect(result.status).toBe("bad-response");
  });
});

describe("shapes a model actually returns", () => {
  it("accepts the requested object array", () => {
    expect(parseReactions('[{"text":"hi"},{"text":"hey"}]').map((r) => r.text))
      .toEqual(["hi", "hey"]);
  });

  it("accepts a bare string array", () => {
    // The bug behind "nothing usable" on short inputs: a short prompt often
    // gets back plain strings, and only objects were accepted.
    expect(parseReactions('["hi","hey","yo"]').map((r) => r.text))
      .toEqual(["hi", "hey", "yo"]);
  });

  it("accepts a wrapper object the model added unprompted", () => {
    expect(parseReactions('{"reactions":[{"text":"hi"}]}').map((r) => r.text))
      .toEqual(["hi"]);
  });

  it("accepts a single object rather than an array of one", () => {
    expect(parseReactions('{"text":"hi"}').map((r) => r.text)).toEqual(["hi"]);
  });

  it("keeps emotion metadata when it is present", () => {
    const out = parseReactions('[{"text":"yooo","emotion":"hype"}]');
    expect(out[0].emotion).toBe("hype");
  });

  it("still returns nothing for prose", () => {
    expect(parseReactions("Sure, here are some ideas for chat!")).toEqual([]);
  });
});

describe("validation reports which rule emptied a batch", () => {
  it("counts over-length rejections", () => {
    const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ");
    const result = validateReactions([{ text: long }], []);
    expect(result.reactions).toEqual([]);
    expect(result.rejected.tooLong).toBe(1);
  });

  it("counts hostile rejections", () => {
    const result = validateReactions([{ text: "you suck at this" }], []);
    expect(result.reactions).toEqual([]);
    expect(result.rejected.hostile).toBe(1);
  });

  it("counts duplicates", () => {
    const result = validateReactions([{ text: "hi" }, { text: "hi" }], []);
    expect(result.reactions).toHaveLength(1);
    expect(result.rejected.duplicate).toBe(1);
  });
});

describe("a greeting batch is never emptied by dedup alone", () => {
  it("releases echoes rather than nothing when chat just said the same words", () => {
    /**
     * Reproduces the reported failure exactly. Chat's greeting vocabulary is
     * about six words wide, so after one round of hellos every subsequent
     * greeting batch deduplicated to zero and the streamer was told the AI had
     * produced nothing usable.
     */
    const batch = ["hi", "hey", "yo", "hi", "hello", "hey"].map((text) => ({ text }));
    const recent = ["hi", "hey", "yo", "hello", "sup", "hi there"];

    const result = validateReactions(batch, recent);

    expect(result.reactions.length).toBeGreaterThan(0);
    expect(result.echoed).toBe(true);
  });

  it("prefers genuinely new lines over echoes when any exist", () => {
    const batch = [{ text: "hi" }, { text: "first time here" }];
    const result = validateReactions(batch, ["hi"]);
    expect(result.reactions.map((r) => r.text)).toEqual(["first time here"]);
    expect(result.echoed).toBe(false);
  });

  it("only compares against recent chat, not the whole session", () => {
    // Real chat repeats itself constantly; the point is stopping an immediate
    // echo, not enforcing novelty across a three hour stream.
    const older = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    const result = validateReactions([{ text: "line 0" }], [...older, "unrelated"]);
    expect(result.reactions).toHaveLength(1);
  });
});
