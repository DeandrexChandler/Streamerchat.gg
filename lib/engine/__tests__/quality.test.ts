import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../engine";
import { FIXTURE_EMOTES } from "../../data/__fixtures__/emotes";
import { createMockProvider } from "../../ai/mock";
import { validateReactions } from "../../ai/validate";
import { shapeOf } from "../../ai/diagnostics";
import type { CandidateProvider, CandidateRequest } from "../../ai/provider";
import type { ChatMessage } from "../types";

/**
 * Feeling heard.
 *
 * What the streamer sees when they say something: words that answer it,
 * from different people, promptly, with emotes decorating rather than
 * replacing them. Driven with scripted providers; nothing here reaches a
 * network.
 */

const EMOTE_NAMES = FIXTURE_EMOTES.map((e) => e.name);

async function session(
  provider: CandidateProvider,
  script: ReadonlyArray<readonly [number, string]>,
  durationMs: number,
  settings = {},
) {
  const engine = new SimulationEngine({ seed: 7, now: 0, emotes: FIXTURE_EMOTES, settings });
  const messages: ChatMessage[] = [];
  const requests: CandidateRequest[] = [];
  const queue = [...script];
  engine.beginSession(0);
  for (let now = 0; now <= durationMs; now += 250) {
    while (queue.length && queue[0][0] <= now) engine.handleTranscript(queue.shift()![1], now, undefined, true);
    const request = engine.nextGeneration(now);
    if (request) {
      requests.push(request);
      const result = await provider.generate(request);
      if (result.status === "ok" && result.reactions.length) engine.supplyReactions(result.reactions, now, engine.generationTicket!);
      else engine.generationFailed(now, engine.generationTicket!);
    }
    messages.push(...engine.tick(now));
  }
  return { engine, messages, requests };
}

/** A provider writing the way a well-prompted model does: words, a few emotes. */
const wordy: CandidateProvider = {
  name: "wordy",
  async generate(request) {
    const said = request.utterance || "the stream";
    const lines = [
      { text: `yeah we can hear you`, emotion: "chill" as const, kind: "answer" as const },
      { text: `loud and clear`, emotion: "chill" as const, kind: "answer" as const, emote: "NODDERS" },
      { text: `your mic is good actually`, emotion: "love" as const, kind: "answer" as const },
      { text: `wait did you change your mic setup?`, emotion: "confused" as const, kind: "question" as const },
      { text: `crystal clear big dawg`, emotion: "hype" as const, kind: "answer" as const },
      { text: `we hear u king`, emotion: "love" as const, kind: "answer" as const },
      { text: `KEKW`, emotion: "funny" as const, kind: "emote" as const },
      { text: `sounds fine to me tbh`, emotion: "chill" as const, kind: "opinion" as const },
      { text: `mic check passed`, emotion: "funny" as const, kind: "joke" as const },
      { text: `you sound great what about ${said.split(" ").slice(-2).join(" ")}`, emotion: "chill" as const, kind: "question" as const },
      { text: `can hear you perfectly`, emotion: "chill" as const, kind: "answer" as const },
      { text: `was worried for a sec ngl`, emotion: "sad" as const, kind: "reaction" as const },
    ];
    return { reactions: Array.from({ length: request.count }, (_, i) => ({ ...lines[i % lines.length], text: lines[i % lines.length].text + (i >= lines.length ? ` (${Math.floor(i / lines.length)})` : "") })), status: "ok" };
  },
};

describe("normal active batches", () => {
  it("are mostly meaningful text on screen, with bare emotes a small minority", async () => {
    const { messages } = await session(wordy, [[1000, "hello can yall hear me"]], 25_000);
    const replies = messages.filter((m) => m.at >= 1000);
    expect(replies.length).toBeGreaterThan(10);
    const names = new Set(EMOTE_NAMES);
    const bare = replies.filter((m) => m.text.split(" ").every((w) => names.has(w)));
    const worded = replies.length - bare.length;
    expect(worded / replies.length).toBeGreaterThan(0.6);
    expect(bare.length / replies.length).toBeLessThan(0.25);
  });

  it("answer the latest input rather than the previous emote-heavy mood", async () => {
    // A hype batch was queued; then the streamer asks a question. The
    // queue is flushed and the reply batch is about the question.
    const { messages, requests } = await session(
      wordy,
      [[1000, "LETS GO WE WON"], [6000, "hello can yall hear me"]],
      20_000,
    );
    const after = messages.filter((m) => m.at >= 6000);
    expect(after.length).toBeGreaterThan(5);
    const asked = requests.find((r) => r.utterance === "hello can yall hear me");
    expect(asked).toBeDefined();
    expect(after.some((m) => /hear|mic|clear/.test(m.text))).toBe(true);
  });

  it("gives every accepted input at least one candidate request", async () => {
    const { requests } = await session(wordy, [[1000, "hi"], [8000, "spam W"], [16000, "what should i play"]], 20_000);
    for (const said of ["hi", "spam W", "what should i play"]) {
      expect(requests.some((r) => r.utterance === said && !r.continuation)).toBe(true);
    }
  });

  it("has each viewer answer a given input once in the first wave", async () => {
    const { messages, requests } = await session(wordy, [[1000, "hello can yall hear me"]], 20_000);
    const first = requests.find((r) => r.utterance === "hello can yall hear me" && !r.continuation)!;
    const wave = messages.filter((m) => m.at >= 1000).slice(0, first.count).map((m) => m.username);
    expect(wave.length).toBeGreaterThan(5);
    expect(new Set(wave).size).toBe(wave.length);
  });
});

describe("explicit emote events", () => {
  it("let spam W be mostly W and emotes", async () => {
    const { messages } = await session(wordy, [[1000, "spam W"]], 12_000);
    const replies = messages.filter((m) => m.at >= 1000);
    expect(replies.length).toBeGreaterThan(5);
    const names = new Set([...EMOTE_NAMES, "W"]);
    // The wall of W while the moment is hot; people start talking about it
    // after — so measure the first wave, not the whole minute.
    const wave = replies.slice(0, 10);
    const emoteish = wave.filter((m) => m.text.split(" ").every((w) => names.has(w)));
    expect(emoteish.length / wave.length).toBeGreaterThan(0.7);
  });
});

describe("bare-emote cap in validation", () => {
  const emotes = ["KEKW", "Pog", "Sadge"];
  const line = (text: string) => ({ text });

  it("drops surplus bare-emote lines from a normal batch, keeping the words", () => {
    const batch = [line("KEKW"), line("we can hear you"), line("Pog"), line("Sadge"), line("mic is fine"), line("KEKW KEKW")];
    const { reactions, rejected } = validateReactions(batch, [], { emotes });
    const bare = reactions.filter((r) => r.text.split(" ").every((w) => emotes.includes(w)));
    expect(reactions.map((r) => r.text)).toContain("we can hear you");
    expect(reactions.map((r) => r.text)).toContain("mic is fine");
    expect(bare.length).toBeLessThanOrEqual(1);
    expect(rejected.emoteSurplus).toBeGreaterThan(0);
  });

  it("does not reject the batch, and never invents replacements", () => {
    const batch = [line("KEKW"), line("Pog"), line("Sadge")];
    const { reactions } = validateReactions(batch, [], { emotes });
    expect(reactions.length).toBeGreaterThanOrEqual(1);
    expect(reactions.every((r) => batch.some((b) => b.text === r.text))).toBe(true);
  });

  it("lets a spam event be mostly emotes", () => {
    const batch = [line("KEKW"), line("Pog"), line("Sadge"), line("W W W")];
    const { reactions } = validateReactions(batch, [], { emotes, emoteEvent: true });
    expect(reactions).toHaveLength(4);
  });
});

describe("diagnostics", () => {
  it("measures a batch's shape", () => {
    const shape = shapeOf(
      [{ text: "we can hear you" }, { text: "KEKW" }, { text: "mic good Pog", emote: "Pog" }, { text: "what game today?" }],
      { emotes: ["KEKW", "Pog"], utterance: "can yall hear me" },
    );
    expect(shape).toMatchObject({ lines: 4, textOnly: 2, textWithEmote: 1, emoteOnly: 1, questions: 1 });
    expect(shape.onTopic).toBeGreaterThanOrEqual(1);
  });
});

describe("events and pace", () => {
  it("lifts activity during a hype moment and settles back after", async () => {
    const provider = createMockProvider();
    const { messages } = await session(provider, [[30_000, "LETS GO WE FINALLY DID IT"]], 120_000, { messagesPerSecond: 1 });
    const rate = (from: number, to: number) => messages.filter((m) => m.at >= from && m.at < to).length / ((to - from) / 1000);
    const before = rate(5_000, 30_000);
    const burst = rate(30_000, 45_000);
    const after = rate(80_000, 120_000);
    expect(burst).toBeGreaterThan(before * 1.3);
    expect(after).toBeLessThan(burst);
  });

  it("keeps viewer-to-viewer replies rare", async () => {
    const { messages } = await session(wordy, [[1000, "hello can yall hear me"]], 60_000);
    const atSomeone = messages.filter((m) => m.replyTo || /^@\w+/.test(m.text));
    expect(atSomeone.length / Math.max(1, messages.length)).toBeLessThan(0.02);
  });

  it("uses one generation path for typed and microphone input", () => {
    const typed = new SimulationEngine({ seed: 1, now: 0 });
    const mic = new SimulationEngine({ seed: 1, now: 0 });
    typed.beginSession(0);
    mic.beginSession(0);
    typed.handleTranscript("chat what do you think", 1000, undefined, true);
    mic.handleTranscript("chat what do you think", 1000, 0.4, false);
    const a = typed.nextGeneration(1000)!;
    const b = mic.nextGeneration(1000)!;
    expect(a.phase).toBe("active");
    expect(b.phase).toBe("active");
    expect(a.utterance).toBe(b.utterance);
    expect(a.classification.intent).toBe(b.classification.intent);
  });
});
