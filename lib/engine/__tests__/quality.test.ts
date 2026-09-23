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
  seed = 7,
) {
  const engine = new SimulationEngine({ seed, now: 0, emotes: FIXTURE_EMOTES, settings });
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

  it("has each viewer answer a given input once before anyone answers twice", async () => {
    const { engine, messages } = await session(wordy, [[1000, "hello can yall hear me"]], 20_000);
    const room = engine.stats().simulated;
    const wave = messages.filter((m) => m.at >= 1000).slice(0, room).map((m) => m.username);
    expect(wave.length).toBe(room);
    expect(new Set(wave).size).toBe(wave.length);
  });
});

describe("explicit emote events", () => {
  it("make spam W about half W and emotes, with people talking around it", async () => {
    // Was a wall: 84% token-or-emote in the first ten seconds, nothing
    // readable in it. Target is about half. Averaged over seeds.
    const names = new Set([...EMOTE_NAMES, "W"]);
    let spam = 0;
    let total = 0;
    for (let seed = 1; seed <= 10; seed += 1) {
      const { messages } = await session(wordy, [[1000, "spam W"]], 11_000, {}, seed);
      const replies = messages.filter((m) => m.at >= 1000);
      total += replies.length;
      spam += replies.filter((m) => m.text.split(" ").every((w) => names.has(w))).length;
    }
    expect(total).toBeGreaterThan(50);
    expect(spam / total).toBeGreaterThan(0.35);
    expect(spam / total).toBeLessThan(0.65);
  });

  it("taper after the first ten seconds", async () => {
    const names = new Set([...EMOTE_NAMES, "W"]);
    let spam = 0;
    let total = 0;
    for (let seed = 1; seed <= 10; seed += 1) {
      const { messages } = await session(wordy, [[1000, "spam W"]], 26_000, {}, seed);
      const later = messages.filter((m) => m.at >= 11_000);
      total += later.length;
      spam += later.filter((m) => m.text.split(" ").every((w) => names.has(w))).length;
    }
    expect(spam / total).toBeLessThan(0.3);
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

  it("caps bare-token lines harder in a directive batch, keeping the talk", () => {
    // The engine posts the token itself from about half the room. The
    // model's own "W", "WWWWW", "hiiiii" lines stacked on that into a wall.
    const batch = [
      line("W"), line("WWWWW"), line("W W W"), line("hiiiii"), line("KEKW"),
      line("we are so spamming it"), line("my keyboard is smoking rn"),
      line("anything for you dre"), line("W for the stream fr"), line("consider it spammed"),
    ];
    const { reactions } = validateReactions(batch, [], { emotes, directive: true });
    const texts = reactions.map((r) => r.text);
    expect(texts.filter((t) => ["W", "WWWWW", "W W W", "hiiiii", "KEKW"].includes(t))).toHaveLength(1);
    for (const talk of ["we are so spamming it", "my keyboard is smoking rn", "anything for you dre", "W for the stream fr", "consider it spammed"]) {
      expect(texts).toContain(talk);
    }
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
    // Averaged over seeds: gaps are Poisson, so any one 15s window is noisy.
    // A single seed missed the bar on 3 of 20 even when the lift was real.
    let before = 0;
    let burst = 0;
    let after = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const { messages } = await session(
        createMockProvider(),
        [[30_000, "LETS GO WE FINALLY DID IT"]],
        120_000,
        { messagesPerSecond: 1 },
        seed,
      );
      const rate = (from: number, to: number) =>
        messages.filter((m) => m.at >= from && m.at < to).length / ((to - from) / 1000);
      before += rate(5_000, 30_000);
      burst += rate(30_000, 45_000);
      after += rate(80_000, 120_000);
    }
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

describe("normal talk", () => {
  it("carries some emote-only lines, not a wall of full sentences", async () => {
    // "look at this roof" is `showing`, which had no emote-only share at all:
    // only five intents were listed. Target is about 15%.
    const names = new Set(EMOTE_NAMES);
    let bare = 0;
    let total = 0;
    for (let seed = 1; seed <= 10; seed += 1) {
      const { messages } = await session(wordy, [[1000, "look at this roof I just built"]], 21_000, {}, seed);
      const replies = messages.filter((m) => m.at >= 1000);
      total += replies.length;
      bare += replies.filter((m) => m.text.split(" ").every((w) => names.has(w))).length;
    }
    expect(bare / total).toBeGreaterThan(0.08);
    expect(bare / total).toBeLessThan(0.25);
  });
});

describe("emotes and words interleave", () => {
  /**
   * The reported symptom: "chat would spew out word chats and switch to
   * emotes for 5-6 messages before returning to words."
   *
   * The cause was the batch being sorted strictly by eagerness. The model
   * gives a bare emote eagerness 1 and a written sentence 0.2, so every
   * emote in a batch arrived together.
   */
  const EAGER_EMOTES: CandidateProvider = {
    name: "eager-emotes",
    async generate(request) {
      const lines: Array<[string, number]> = [
        ["KEKW", 1], ["Pog", 1], ["Sadge", 0.95], ["NODDERS", 0.95],
        ["W take", 0.9], ["Ayo????", 0.9], ["mhmm", 0.85],
        ["is it stable tho", 0.5], ["wait that looks so sick dre", 0.4],
        ["bro spent four hours on the rafters", 0.35],
        ["i think you need a chimney", 0.3], ["does it leak in game", 0.25],
      ];
      return {
        status: "ok",
        reactions: Array.from({ length: request.count }, (_, i) => {
          const [text, eagerness] = lines[i % lines.length];
          return {
            text: i >= lines.length ? `${text} ${Math.floor(i / lines.length)}` : text,
            emotion: "hype" as const,
            eagerness,
          };
        }),
      };
    },
  };

  const shapes = async (seed: number) => {
    const names = new Set(EMOTE_NAMES);
    const { messages } = await session(
      EAGER_EMOTES,
      [[1000, "look at this roof I just built"]],
      90_000,
      {},
      seed,
    );
    return messages
      .filter((m) => m.at >= 1000)
      .map((m) => m.text.split(" ").every((w) => names.has(w)));
  };

  it("never lets either kind run away", async () => {
    // Not a cap on emotes: a rule that forbids two in a row is itself a
    // tell. The share is steered against what just went out, so three
    // together can happen and five cannot — and the same correction is what
    // stops a long block of sentences.
    for (let seed = 1; seed <= 6; seed += 1) {
      let emotes = 0;
      let words = 0;
      for (const isEmote of await shapes(seed)) {
        emotes = isEmote ? emotes + 1 : 0;
        words = isEmote ? 0 : words + 1;
        expect(emotes).toBeLessThanOrEqual(4);
        expect(words).toBeLessThanOrEqual(22);
      }
    }
  });

  it("allows a couple of emotes together rather than strictly alternating", async () => {
    // The other failure: perfectly alternating shapes reads as a machine.
    let pairs = 0;
    for (let seed = 1; seed <= 6; seed += 1) {
      const all = await shapes(seed);
      for (let i = 1; i < all.length; i += 1) if (all[i] && all[i - 1]) pairs += 1;
    }
    expect(pairs).toBeGreaterThan(0);
  });

  it("still hits the emote share while interleaving it", async () => {
    let emotes = 0;
    let total = 0;
    for (let seed = 1; seed <= 6; seed += 1) {
      const all = await shapes(seed);
      total += all.length;
      emotes += all.filter(Boolean).length;
    }
    expect(total).toBeGreaterThan(200);
    expect(emotes / total).toBeGreaterThan(0.12);
    expect(emotes / total).toBeLessThan(0.4);
  });

  it("spreads them through the stream rather than front-loading the batch", async () => {
    // Strict eagerness ordering put every emote in the first third.
    const all = await shapes(3);
    const third = Math.floor(all.length / 3);
    const first = all.slice(0, third).filter(Boolean).length;
    const last = all.slice(-third).filter(Boolean).length;
    expect(Math.abs(first - last)).toBeLessThan(Math.max(4, third * 0.3));
  });
});
