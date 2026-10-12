import { describe, expect, it, vi } from "vitest";
import { createCandidatesHandler, type BatchResponse } from "../../../app/api/chat-candidates/route";
import { AiRateLimiter, type AiConfig } from "../config";
import { RateLimiter } from "../../http/rate-limit";
import type { CandidateProvider, GenerationResult } from "../provider";
import { readBatch } from "../batch-stream";

/**
 * The route, driven end to end with a scripted provider.
 *
 * What these pin down: exactly one retry, an opaque body on every failure,
 * and the cause landing in the server log rather than the browser. Nothing
 * here touches the network.
 */

const config: AiConfig = {
  apiKey: "test-key",
  model: "gemini-3.5-flash-lite",
  maxCallsPerMinute: 100,
  maxCallsPerHour: 1000,
  maxOutputTokens: 2000,
  maxBatchSize: 40,
};

const body = {
  utterance: "we just won",
  history: [],
  classification: {
    intent: "achievement",
    sentiment: "positive",
    energy: 0.8,
    keywords: ["won"],
    confidence: 0.9,
  },
  emotes: [],
  recent: [],
  count: 8,
};

/** A provider that answers from a script, one result per call. */
function scripted(results: GenerationResult[]): CandidateProvider & { calls: number } {
  const provider = {
    name: "scripted",
    calls: 0,
    async generate() {
      provider.calls += 1;
      return results[Math.min(provider.calls, results.length) - 1];
    },
  };
  return provider;
}

const ok = (texts: string[]): GenerationResult => ({
  reactions: texts.map((text) => ({ text })),
  status: "ok",
});

function post(json: unknown = body): Request {
  return new Request("http://localhost/api/chat-candidates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof json === "string" ? json : JSON.stringify(json),
  });
}

function make(provider: CandidateProvider, overrides: Partial<AiConfig> = {}) {
  const log = { log: vi.fn(), warn: vi.fn() };
  const merged = { ...config, ...overrides };
  const handler = createCandidatesHandler({
    config: merged,
    provider,
    limiter: new AiRateLimiter(merged),
    httpLimiter: new RateLimiter({ windowMs: 60_000, maxRequests: 1000 }),
    log,
  });
  return { handler, log };
}

/** The whole batch, however it was sent: streamed lines and the final status. */
async function read(response: Response): Promise<BatchResponse & Record<string, unknown>> {
  const out: BatchResponse & Record<string, unknown> = { reactions: [], status: "unavailable" };
  await readBatch(response, (message) => {
    out.reactions.push(...(message.reactions ?? []));
    if (message.event) out.event = message.event;
    if (message.status) out.status = message.status;
  });
  return out;
}

describe("chat-candidates route", () => {
  it("returns the batch when the provider answers", async () => {
    const provider = scripted([ok(["W", "no way", "clip it"])]);
    const { handler } = make(provider);
    const res = await read(await handler(post()));

    expect(res.status).toBe("ok");
    expect(res.reactions.map((r) => r.text)).toEqual(["W", "no way", "clip it"]);
    expect(provider.calls).toBe(1);
  });

  it("retries exactly once after a failure, then succeeds", async () => {
    const provider = scripted([
      { reactions: [], status: "timeout", detail: "AbortError" },
      ok(["W"]),
    ]);
    const { handler, log } = make(provider);
    const res = await read(await handler(post()));

    expect(res.status).toBe("ok");
    expect(provider.calls).toBe(2);
    expect(log.warn.mock.calls.some(([line]) => String(line).includes("attempt 1/2"))).toBe(true);
    expect(log.log.mock.calls.some(([line]) => String(line).includes("(retry)"))).toBe(true);
  });

  it("gives up after the second failure and does not try a third time", async () => {
    const provider = scripted([
      { reactions: [], status: "quota", detail: "429 RESOURCE_EXHAUSTED" },
      { reactions: [], status: "quota", detail: "429 RESOURCE_EXHAUSTED" },
      ok(["should never be reached"]),
    ]);
    const { handler } = make(provider);
    const res = await read(await handler(post()));

    expect(res).toEqual({ reactions: [], status: "unavailable" });
    expect(provider.calls).toBe(2);
  });

  it("retries when the provider answered but validation emptied the batch", async () => {
    const provider = scripted([
      ok(["you suck at this"]), // hostile → rejected
      ok(["gg"]),
    ]);
    const { handler } = make(provider);
    const res = await read(await handler(post()));

    expect(res.status).toBe("ok");
    expect(res.reactions.map((r) => r.text)).toEqual(["gg"]);
    expect(provider.calls).toBe(2);
  });

  it("never tells the browser why", async () => {
    // The person reading the browser is live on stream. Provider names, HTTP
    // codes, quota state and error text belong in the server log.
    const provider = scripted([
      { reactions: [], status: "auth", detail: "API key not valid. Please pass a valid API key." },
      { reactions: [], status: "auth", detail: "API key not valid. Please pass a valid API key." },
    ]);
    const { handler, log } = make(provider);
    const raw = await (await handler(post())).text();

    // The whole body: one closing line that says nothing but the outcome.
    expect(raw).toBe(`${JSON.stringify({ status: "unavailable" })}\n`);
    for (const word of ["auth", "API key", "gemini", "detail", "quota", "rejected", "usage"]) {
      expect(raw.toLowerCase()).not.toContain(word.toLowerCase());
    }
    // ...but the log has it.
    expect(log.warn.mock.calls.some(([line]) => String(line).includes("API key not valid"))).toBe(true);
  });

  it("is unavailable, not an error, with no key configured", async () => {
    const provider = scripted([ok(["never called"])]);
    const { handler, log } = make(provider, { apiKey: "" });
    const response = await handler(post());

    expect(response.status).toBe(200);
    expect(await read(response)).toEqual({ reactions: [], status: "unavailable" });
    expect(provider.calls).toBe(0);
    expect(log.warn.mock.calls.some(([line]) => String(line).includes("no-key"))).toBe(true);
  });

  it("rejects a malformed request with the same opaque body", async () => {
    const { handler } = make(scripted([ok(["x"])]));
    const response = await handler(post("{not json"));
    expect(response.status).toBe(400);
    expect(await read(response)).toEqual({ reactions: [], status: "unavailable" });
  });

  it("rejects a request that fails the schema without leaking the issues", async () => {
    const { handler, log } = make(scripted([ok(["x"])]));
    const response = await handler(post({ ...body, count: 9999 }));
    expect(response.status).toBe(400);
    const raw = await response.text();
    expect(raw).not.toContain("count");
    expect(log.warn.mock.calls.some(([line]) => String(line).includes("count"))).toBe(true);
  });

  it("trims an over-long transcript or memory rather than refusing the batch", async () => {
    // Two minutes of talking without a pause is one 1,500 character
    // transcript, and a regular addressed at length carries a long memory.
    // Refused, every later request carried the same text and failed the
    // same way: chat went silent with nothing anywhere but the server log.
    let received: Parameters<CandidateProvider["generate"]>[0] | null = null;
    const provider: CandidateProvider = {
      name: "spy",
      async generate(request) {
        received = request;
        return ok(["x"]);
      },
    };
    const { handler } = make(provider);
    const long = "and then ".repeat(200);
    const res = await read(
      await handler(
        post({
          ...body,
          utterance: long,
          history: [long],
          roster: [{ name: "hazelirl", persona: "p".repeat(300), notes: "n".repeat(700) }],
        }),
      ),
    );

    expect(res.status).toBe("ok");
    expect(received!.utterance.length).toBeLessThanOrEqual(1000);
    expect(received!.history[0].length).toBeLessThanOrEqual(1000);
    expect(received!.roster![0].notes!.length).toBeLessThanOrEqual(400);
    expect(received!.roster![0].persona.length).toBeLessThanOrEqual(200);
  });

  it("sends lines to the browser as the provider writes them", async () => {
    // The first lines reach chat while the rest of the batch is still being
    // written, which is what keeps a 70-line batch from being an 8s wait.
    let finishBatch!: () => void;
    const provider: CandidateProvider = {
      name: "slow",
      generate(_request, options) {
        options?.onLines?.([{ text: "first in" }, { text: "no shot" }]);
        return new Promise((resolve) => {
          finishBatch = () => {
            const rest = [{ text: "late one" }];
            options?.onLines?.(rest);
            resolve({ reactions: [{ text: "first in" }, { text: "no shot" }, ...rest], status: "ok" });
          };
        });
      },
    };
    const { handler } = make(provider);
    const reader = (await handler(post())).body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(JSON.parse(first.trim()).reactions.map((r: { text: string }) => r.text)).toEqual(["first in", "no shot"]);

    finishBatch();
    let rest = "";
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      rest += new TextDecoder().decode(chunk.value);
    }
    const messages = rest.trim().split("\n").map((line) => JSON.parse(line));
    expect(messages.flatMap((m) => m.reactions ?? []).map((r: { text: string }) => r.text)).toEqual(["late one"]);
    expect(messages.at(-1)).toEqual({ status: "ok" });
  });

  it("stops the provider writing when the browser hangs up", async () => {
    // The engine cuts off a reply about an older sentence. Output is most of
    // the bill, so the rest of that batch must not be written anyway.
    let sawAbort = false;
    const provider: CandidateProvider = {
      name: "slow",
      generate(_request, options) {
        options?.onLines?.([{ text: "first in" }]);
        return new Promise((resolve) => {
          options?.signal?.addEventListener("abort", () => {
            sawAbort = true;
            resolve({ reactions: [{ text: "first in" }], status: "timeout" });
          });
        });
      },
    };
    const { handler, log } = make(provider);
    const browser = new AbortController();
    const request = new Request("http://localhost/api/chat-candidates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: browser.signal,
    });
    const response = await handler(request);
    await response.body!.getReader().read();
    browser.abort();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sawAbort).toBe(true);
    expect(log.log.mock.calls.some(([line]) => String(line).includes("cut off"))).toBe(true);
  });

  it("does not ask again once lines have reached chat", async () => {
    // A stream that stalls after a few lines has worked: a retry would
    // repeat the moment, not rescue it.
    const provider = scripted([
      { reactions: [{ text: "got this far" }], status: "timeout" },
      ok(["second call"]),
    ]);
    const { handler } = make(provider);
    const res = await read(await handler(post()));
    expect(res.status).toBe("ok");
    expect(res.reactions.map((r) => r.text)).toEqual(["got this far"]);
    expect(provider.calls).toBe(1);
  });

  it("clamps the batch to the configured ceiling", async () => {
    let requested = 0;
    const provider: CandidateProvider = {
      name: "spy",
      async generate(request) {
        requested = request.count;
        return ok(["x"]);
      },
    };
    const { handler } = make(provider, { maxBatchSize: 5 });
    await handler(post({ ...body, count: 40 }));
    expect(requested).toBe(5);
  });

  it("never refuses a request for arriving right after another", async () => {
    // The first reaction of a session follows the arrival batch by however
    // long it takes the streamer to say hello. A gap between calls refused
    // exactly that request and left the room quiet for its whole backoff.
    const provider = scripted([ok(["hi"]), ok(["hey chat"]), ok(["W"])]);
    const { handler } = make(provider);
    for (let i = 0; i < 3; i += 1) {
      const res = await read(await handler(post()));
      expect(res.status).toBe("ok");
    }
    expect(provider.calls).toBe(3);
  });

  it("pauses briefly before the retry", async () => {
    const waits: number[] = [];
    const provider = scripted([{ reactions: [], status: "network" }, ok(["W"])]);
    const log = { log: vi.fn(), warn: vi.fn() };
    const handler = createCandidatesHandler({
      config,
      provider,
      limiter: new AiRateLimiter(config),
      httpLimiter: new RateLimiter({ windowMs: 60_000, maxRequests: 1000 }),
      log,
      pause: async (ms) => {
        waits.push(ms);
      },
    });
    const res = await read(await handler(post()));
    expect(res.status).toBe("ok");
    expect(waits).toEqual([750]);
  });

  it("reads the key per request, so one added later starts working", async () => {
    // Same limiter across both calls, as in the running server.
    const limiter = new AiRateLimiter(config);
    const provider = scripted([ok(["W"])]);
    const without = createCandidatesHandler({
      config: { ...config, apiKey: "" },
      provider,
      limiter,
      httpLimiter: new RateLimiter({ windowMs: 60_000, maxRequests: 1000 }),
      log: { log: vi.fn(), warn: vi.fn() },
    });
    expect((await read(await without(post()))).status).toBe("unavailable");

    const withKey = createCandidatesHandler({
      config,
      provider,
      limiter,
      httpLimiter: new RateLimiter({ windowMs: 60_000, maxRequests: 1000 }),
      log: { log: vi.fn(), warn: vi.fn() },
    });
    expect((await read(await withKey(post()))).status).toBe("ok");
  });
});
