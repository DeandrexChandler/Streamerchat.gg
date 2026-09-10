import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../engine";
import { createMockProvider } from "../../ai/mock";
import { FIXTURE_EMOTES } from "../../data/__fixtures__/emotes";
import type { CandidateProvider, CandidateRequest } from "../../ai/provider";
import type { ChatMessage } from "../types";
import type { SimulationSettings } from "../../config/settings";
import { IDLE_AFTER_MS } from "../generation";

/**
 * The engine, driven the way the app drives it.
 *
 * Every tick asks the engine what it needs and serves it from a scripted
 * provider on the spot. Nothing here touches the network; the mock is the
 * only provider these tests know about.
 */

interface Session {
  engine: SimulationEngine;
  messages: ChatMessage[];
  /** Every request the engine made, in order. */
  requests: CandidateRequest[];
}

interface DriveOptions {
  seed?: number;
  settings?: Partial<SimulationSettings>;
  emotes?: readonly typeof FIXTURE_EMOTES[number][];
  provider?: CandidateProvider;
  /** [ms, text] — what the streamer says and when. */
  script?: ReadonlyArray<readonly [number, string]>;
  /** Called on every tick, after the pump. */
  onTick?: (session: Session, now: number) => void;
}

/**
 * Runs a session over a virtual clock.
 *
 * The provider is awaited so a batch lands on the tick it was requested —
 * latency is a separate concern and not what these measure.
 */
async function drive(durationMs: number, options: DriveOptions = {}): Promise<Session> {
  const engine = new SimulationEngine({
    seed: options.seed ?? 1234,
    now: 0,
    emotes: options.emotes ?? FIXTURE_EMOTES,
    settings: options.settings,
  });
  const provider = options.provider ?? createMockProvider();
  const session: Session = { engine, messages: [], requests: [] };
  const script = [...(options.script ?? [])];

  engine.beginSession(0);
  for (let now = 0; now <= durationMs; now += 250) {
    while (script.length > 0 && script[0][0] <= now) {
      engine.handleTranscript(script.shift()![1], now, undefined, true);
    }
    const request = engine.nextGeneration(now);
    if (request) {
      session.requests.push(request);
      const result = await provider.generate(request);
      if (result.status === "ok" && result.reactions.length > 0) {
        engine.supplyReactions(result.reactions, now);
      } else {
        engine.generationFailed(now);
      }
    }
    session.messages.push(...engine.tick(now));
    options.onTick?.(session, now);
  }
  return session;
}

/** A provider that never answers. */
const dead: CandidateProvider = {
  name: "dead",
  async generate() {
    return { reactions: [], status: "network", detail: "ECONNREFUSED" };
  },
};

/** A provider that answers with exactly these lines, every time. */
function saying(texts: string[]): CandidateProvider {
  return {
    name: "saying",
    async generate() {
      return { reactions: texts.map((text) => ({ text })), status: "ok" };
    },
  };
}

function byUser(messages: ChatMessage[]): Map<string, ChatMessage[]> {
  const grouped = new Map<string, ChatMessage[]>();
  for (const message of messages) {
    grouped.set(message.username, [...(grouped.get(message.username) ?? []), message]);
  }
  return grouped;
}

// ---------------------------------------------------------------- invariants

describe("SimulationEngine", () => {
  it("never emits messages out of order", async () => {
    const { messages } = await drive(60_000, { script: [[1000, "let's go"]] });
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].at).toBeGreaterThanOrEqual(messages[i - 1].at);
    }
  });

  it("keeps every message id unique", async () => {
    const { messages } = await drive(120_000, {
      script: [[1000, "hey chat"], [30_000, "what do you think"]],
    });
    expect(messages.length).toBeGreaterThan(20);
    expect(new Set(messages.map((m) => m.id)).size).toBe(messages.length);
  });

  it("ignores transcripts that are too short to be speech", () => {
    const engine = new SimulationEngine({ seed: 1, now: 0 });
    expect(engine.handleTranscript("a", 1000)).toBeNull();
    expect(engine.handleTranscript("  ", 1000)).toBeNull();
  });

  it("reuses viewers rather than inventing a name per message", async () => {
    const { messages } = await drive(180_000, {
      settings: { audienceSize: 12 },
      script: [[1000, "hey everyone"], [40_000, "chat what should i build"]],
    });
    const names = new Set(messages.map((m) => m.username));
    expect(messages.length).toBeGreaterThan(30);
    expect(names.size).toBeLessThan(messages.length / 2);
  });

  it("gives a viewer a stable colour across their messages", async () => {
    const { messages } = await drive(180_000, {
      settings: { audienceSize: 8 },
      script: [[1000, "hey everyone"], [40_000, "chat what should i build"]],
    });
    for (const [, lines] of byUser(messages)) {
      expect(new Set(lines.map((m) => m.color)).size).toBe(1);
    }
  });

  it("drops messages blocked by the profanity filter", async () => {
    const { messages } = await drive(30_000, {
      settings: { profanityMode: "filter" },
      provider: saying(["this is shit", "clean line"]),
    });
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.every((m) => !/shit/.test(m.text))).toBe(true);
  });

  it("applies updated settings without a restart", () => {
    const engine = new SimulationEngine({ seed: 1, now: 0 });
    engine.updateSettings({ messagesPerSecond: 4 });
    expect(() => engine.tick(1000)).not.toThrow();
  });

  it("survives a tick with no emotes configured", async () => {
    const { messages } = await drive(20_000, { emotes: [] });
    expect(messages.length).toBeGreaterThan(0);
  });

  it("reports coherent stats", async () => {
    const { engine, messages } = await drive(30_000, { script: [[1000, "hi chat"]] });
    const stats = engine.stats();
    expect(stats.released).toBe(messages.length);
    expect(stats.audience).toBeGreaterThan(0);
    expect(stats.phase).toBe("active");
  });
});

// ------------------------------------------------------------------ startup

describe("startup", () => {
  it("asks for an arrival batch as soon as the session begins", () => {
    const engine = new SimulationEngine({ seed: 5, now: 0 });
    engine.beginSession(0);
    const request = engine.nextGeneration(0);
    expect(request?.phase).toBe("startup");
    expect(request?.utterance).toBe("");
    expect(request?.continuation).toBe(false);
  });

  it("shows chat before the streamer has said anything", async () => {
    // The reported bug, twice over: Start used to leave the room silent.
    const { messages, requests } = await drive(20_000);
    expect(requests[0]?.phase).toBe("startup");
    expect(messages.length).toBeGreaterThan(5);
    expect(messages.every((m) => m.kind === "greeting")).toBe(true);
  });

  it("releases arrival over time rather than all at once", async () => {
    const { engine } = await drive(0);
    const firstTick = engine.tick(0).length;
    const { messages } = await drive(20_000);
    expect(firstTick).toBeLessThan(4);
    expect(messages.length).toBeGreaterThan(firstTick);
  });

  it("says nothing at all when the provider is down", async () => {
    // AI or nothing. There is no pool to fall back on, and that is the point.
    const { messages } = await drive(30_000, { provider: dead });
    expect(messages).toHaveLength(0);
  });

  it("greets once per viewer in the first wave", async () => {
    const { messages } = await drive(12_000, { settings: { audienceSize: 40 } });
    const names = messages.map((m) => m.username);
    expect(names.length).toBeGreaterThan(5);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps the room going after the first wave, as chatter", async () => {
    const { requests } = await drive(50_000, { settings: { messagesPerSecond: 2 } });
    const startup = requests.filter((r) => r.phase === "startup");
    expect(startup.length).toBeGreaterThan(1);
    expect(startup[0].continuation).toBe(false);
    expect(startup.slice(1).every((r) => r.continuation)).toBe(true);
  });

  it("ends the moment the streamer speaks, dropping what was queued", async () => {
    const { engine, requests } = await drive(3_000);
    expect(engine.currentPhase).toBe("startup");
    expect(engine.pendingReactions).toBeGreaterThan(0);

    engine.handleTranscript("okay hey chat", 3_000, undefined, true);
    expect(engine.currentPhase).toBe("active");
    expect(engine.pendingReactions).toBe(0);

    const next = engine.nextGeneration(3_250);
    expect(next?.phase).toBe("active");
    expect(next?.utterance).toBe("okay hey chat");
    expect(requests.every((r) => r.phase === "startup")).toBe(true);
  });

  it("ends by itself when the silence threshold is reached", async () => {
    const { engine, requests } = await drive(IDLE_AFTER_MS + 5_000);
    expect(engine.currentPhase).toBe("idle");
    expect(requests.some((r) => r.phase === "idle")).toBe(true);
  });

  it("starts fresh after a clear and restart", async () => {
    const { engine } = await drive(20_000);
    engine.beginSession(100_000);
    expect(engine.currentPhase).toBe("startup");
    expect(engine.pendingReactions).toBe(0);
    expect(engine.nextGeneration(100_000)?.phase).toBe("startup");
  });
});

// ------------------------------------------------------------------- active

describe("active generation", () => {
  it("requests a reaction batch carrying what the streamer said", async () => {
    const { requests } = await drive(5_000, { script: [[1000, "look at this roof"]] });
    const active = requests.find((r) => r.phase === "active");
    expect(active?.utterance).toBe("look at this roof");
    expect(active?.continuation).toBe(false);
    expect(active?.classification.intent).toBeDefined();
  });

  it("carries recent streamer inputs as compact history", async () => {
    const { requests } = await drive(30_000, {
      script: [[1000, "i think i'll play minecraft"], [10_000, "actually valorant"]],
    });
    const second = requests.filter((r) => r.utterance === "actually valorant")[0];
    expect(second?.history).toEqual(["i think i'll play minecraft"]);
  });

  it("carries recent chat lines so a refill does not echo them", async () => {
    const { requests } = await drive(40_000, { script: [[1000, "hey chat"]] });
    const later = requests[requests.length - 1];
    expect(later.recent.length).toBeGreaterThan(0);
    expect(later.recent.length).toBeLessThanOrEqual(20);
  });

  it("refills before the queue runs dry", async () => {
    let dry = 0;
    let ticks = 0;
    await drive(60_000, {
      script: [[1000, "hey chat"]],
      onTick: ({ engine }, now) => {
        if (now < 2000) return;
        ticks += 1;
        if (engine.pendingReactions === 0) dry += 1;
      },
    });
    // Momentary, at most: the tick the last line is consumed.
    expect(dry / ticks).toBeLessThan(0.05);
  });

  it("continues the conversation when a batch drains and nobody spoke", async () => {
    const { requests } = await drive(50_000, { script: [[1000, "look at this roof"]] });
    const continuations = requests.filter((r) => r.phase === "active" && r.continuation);
    expect(continuations.length).toBeGreaterThan(0);
    expect(continuations[0].utterance).toBe("look at this roof");
    expect(continuations[0].silenceSeconds).toBeGreaterThan(5);
  });

  it("never asks twice while a request is unresolved", () => {
    const engine = new SimulationEngine({ seed: 3, now: 0 });
    engine.beginSession(0);
    expect(engine.nextGeneration(0)).not.toBeNull();
    expect(engine.nextGeneration(250)).toBeNull();
    expect(engine.nextGeneration(5_000)).toBeNull();
    engine.generationFailed(5_000);
    expect(engine.nextGeneration(20_000)).not.toBeNull();
  });

  it("flushes the previous moment when the streamer says something new", async () => {
    const { engine } = await drive(5_000, { script: [[1000, "i'll play minecraft"]] });
    const before = engine.pendingReactions;
    expect(before).toBeGreaterThan(0);
    engine.handleTranscript("actually valorant", 5_000, undefined, true);
    expect(engine.pendingReactions).toBe(0);
  });

  it("keeps what was already released", async () => {
    const { messages } = await drive(20_000, {
      script: [[1000, "i'll play minecraft"], [8_000, "actually valorant"]],
    });
    const before = messages.filter((m) => m.at < 8_000);
    expect(before.length).toBeGreaterThan(0);
  });

  it("discards a batch that arrives for a moment that has passed", () => {
    const engine = new SimulationEngine({ seed: 3, now: 0 });
    engine.beginSession(0);
    engine.handleTranscript("first thing", 0, undefined, true);
    const request = engine.nextGeneration(0);
    expect(request?.utterance).toBe("first thing");

    // The streamer moves on while the request is in flight.
    engine.handleTranscript("second thing", 500, undefined, true);
    engine.supplyReactions([{ text: "about the first thing" }], 1_000);
    expect(engine.pendingReactions).toBe(0);

    expect(engine.nextGeneration(1_250)?.utterance).toBe("second thing");
  });

  it("goes quiet, not canned, when the provider fails", async () => {
    const { messages } = await drive(40_000, { provider: dead, script: [[1000, "hey chat"]] });
    expect(messages).toHaveLength(0);
  });

  it("backs off after a failure rather than hammering", async () => {
    const { requests } = await drive(60_000, { provider: dead, script: [[1000, "hey chat"]] });
    // 60s at an 8s backoff is at most about eight attempts.
    expect(requests.length).toBeLessThan(10);
    expect(requests.length).toBeGreaterThan(2);
  });

  it("recovers on its own once the provider is back", async () => {
    let calls = 0;
    const flaky: CandidateProvider = {
      name: "flaky",
      async generate(request) {
        calls += 1;
        if (calls <= 2) return { reactions: [], status: "timeout" };
        return createMockProvider().generate(request);
      },
    };
    const { messages } = await drive(60_000, { provider: flaky, script: [[1000, "hey chat"]] });
    expect(messages.length).toBeGreaterThan(5);
  });
});

// --------------------------------------------------------------------- idle

describe("idle", () => {
  const lastWord = 2_000;

  it("does not start before the threshold", async () => {
    const { requests } = await drive(lastWord + IDLE_AFTER_MS - 1_000, {
      script: [[lastWord, "okay building now"]],
    });
    expect(requests.every((r) => r.phase !== "idle")).toBe(true);
  });

  it("starts at the threshold with the silence in the request", async () => {
    const { requests, engine } = await drive(lastWord + IDLE_AFTER_MS + 2_000, {
      script: [[lastWord, "okay building now"]],
    });
    const idle = requests.find((r) => r.phase === "idle");
    expect(idle).toBeDefined();
    expect(idle?.idleStage).toBe(1);
    expect(idle?.silenceSeconds).toBeGreaterThanOrEqual(60);
    expect(engine.currentPhase).toBe("idle");
  });

  it("keeps flowing at the configured speed while idle", async () => {
    const { messages } = await drive(lastWord + IDLE_AFTER_MS + 60_000, {
      settings: { messagesPerSecond: 1 },
      script: [[lastWord, "okay building now"]],
    });
    const idle = messages.filter((m) => m.kind === "idle");
    // Sixty seconds of idle at one a second.
    expect(idle.length).toBeGreaterThan(35);
    expect(idle.length).toBeLessThan(95);
  });

  it("escalates through the stages as silence continues", async () => {
    const { requests } = await drive(lastWord + 620_000, {
      script: [[lastWord, "okay building now"]],
    });
    const stages = [...new Set(requests.filter((r) => r.phase === "idle").map((r) => r.idleStage))];
    expect(stages).toEqual([1, 2, 3, 4]);
  });

  it("drops the old stage's lines when the stage advances", async () => {
    let queuedAtBoundary = -1;
    await drive(lastWord + 150_000 + 500, {
      script: [[lastWord, "okay building now"]],
      onTick: ({ engine }, now) => {
        if (now === lastWord + 150_000) queuedAtBoundary = engine.pendingReactions;
      },
    });
    // At the exact boundary tick the stage-1 queue was dropped and the
    // stage-2 batch supplied in its place, so the queue holds only new lines.
    expect(queuedAtBoundary).toBeGreaterThan(0);
  });

  it("ends the instant the streamer speaks", async () => {
    const { engine } = await drive(lastWord + IDLE_AFTER_MS + 10_000, {
      script: [[lastWord, "okay building now"]],
    });
    expect(engine.currentPhase).toBe("idle");
    engine.handleTranscript("sorry chat i'm back", lastWord + IDLE_AFTER_MS + 10_000, undefined, true);
    expect(engine.currentPhase).toBe("active");
    expect(engine.pendingReactions).toBe(0);
    const next = engine.nextGeneration(lastWord + IDLE_AFTER_MS + 10_250);
    expect(next?.phase).toBe("active");
    expect(next?.continuation).toBe(false);
  });

  it("uses only the AI for idle lines", async () => {
    const { messages } = await drive(lastWord + IDLE_AFTER_MS + 30_000, {
      provider: dead,
      script: [[lastWord, "okay building now"]],
    });
    expect(messages.filter((m) => m.kind === "idle")).toHaveLength(0);
  });
});

// -------------------------------------------------------------- lifecycle

describe("pause and resume", () => {
  it("drops the queue on pause and restarts the silence clock on resume", async () => {
    const { engine } = await drive(10_000, { script: [[1000, "hey chat"]] });
    expect(engine.pendingReactions).toBeGreaterThan(0);

    engine.pause();
    expect(engine.pendingReactions).toBe(0);
    expect(engine.nextGeneration(11_000)).toBeNull();

    engine.resume(500_000);
    const request = engine.nextGeneration(500_000);
    expect(request?.phase).toBe("active");
    expect(request?.silenceSeconds).toBe(0);
  });
});

// ----------------------------------------------------------------- pacing

describe("pacing", () => {
  async function gaps(seed: number, settings: Partial<SimulationSettings> = {}): Promise<number[]> {
    const { messages } = await drive(300_000, {
      seed,
      settings,
      script: [
        [1000, "hey everyone welcome in"],
        [40_000, "chat what do you think about the roof"],
        [80_000, "LET'S GO that was insane!"],
        [140_000, "look at this, check it out"],
        [200_000, "come on, this is so annoying"],
      ],
    });
    const out: number[] = [];
    for (let i = 1; i < messages.length; i++) out.push(messages[i].at - messages[i - 1].at);
    return out;
  }

  it("produces tight clusters of near-simultaneous messages", async () => {
    expect((await gaps(4242)).filter((g) => g <= 500).length).toBeGreaterThan(0);
  });

  it("produces long pauses as well as clusters", async () => {
    expect((await gaps(4242)).filter((g) => g >= 3000).length).toBeGreaterThan(0);
  });

  it("is not metronomic — gaps spread across multiple buckets", async () => {
    const all = await gaps(4242);
    const buckets = [
      all.filter((g) => g < 500).length,
      all.filter((g) => g >= 500 && g < 1500).length,
      all.filter((g) => g >= 1500 && g < 3000).length,
      all.filter((g) => g >= 3000).length,
    ];
    expect(buckets.filter((n) => n > 0).length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...buckets) / all.length).toBeLessThan(0.7);
  });

  it.each([0.2, 0.5, 1, 1.5, 2, 4])("tracks the %s/sec tier", async (rate) => {
    const all = await gaps(99, { messagesPerSecond: rate });
    const seconds = 300;
    const measured = (all.length + 1) / seconds;
    // Momentum lifts a talkative script above the setting; the long-run
    // average must still be recognisably the tier.
    expect(measured).toBeGreaterThan(rate * 0.7);
    expect(measured).toBeLessThan(rate * 1.9);
  });

  it("asks for bigger batches at faster tiers", () => {
    const at = (rate: number) => {
      const engine = new SimulationEngine({ seed: 1, now: 0, settings: { messagesPerSecond: rate } });
      engine.beginSession(0);
      return engine.nextGeneration(0)!.count;
    };
    expect(at(0.2)).toBeLessThan(at(1));
    expect(at(1)).toBeLessThan(at(4));
    expect(at(4)).toBeLessThanOrEqual(60);
  });

  it("stays inside a sane call budget at every tier", async () => {
    for (const rate of [0.2, 1, 4]) {
      const { requests } = await drive(300_000, {
        settings: { messagesPerSecond: rate },
        script: [[1000, "hey chat"], [60_000, "what do you think"], [120_000, "let's go"]],
      });
      expect(requests.length / 5).toBeLessThan(8); // per minute
    }
  });
});

// ------------------------------------------------------------ viewer count

describe("viewer count", () => {
  async function samples(rate: number, seed: number): Promise<number[]> {
    const out: number[] = [];
    await drive(180_000, {
      seed,
      settings: { messagesPerSecond: rate },
      onTick: ({ engine }, now) => {
        if (now % 3000 === 0) out.push(engine.stats().audience);
      },
    });
    return out;
  }

  it("keeps moving rather than settling on a number", async () => {
    const values = await samples(2, 12);
    let unchanged = 0;
    for (let i = 1; i < values.length; i++) if (values[i] === values[i - 1]) unchanged++;
    expect(unchanged / values.length).toBeLessThan(0.15);
  });

  it("stays inside the tier's band", async () => {
    const values = await samples(0.2, 13);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...values)).toBeLessThanOrEqual(11);
  });

  it("scales its wobble with the tier", async () => {
    const spread = async (rate: number) => {
      const values = await samples(rate, 14);
      return Math.max(...values) - Math.min(...values);
    };
    expect(await spread(4)).toBeGreaterThan((await spread(0.2)) * 5);
  });

  it("never reports fewer than one viewer", async () => {
    const values = await samples(0.2, 16);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(1);
  });
});

// ------------------------------------------------------------- repetition

describe("viewers do not repeat themselves", () => {
  it("never lets one viewer post the same line twice in a session", async () => {
    const { messages } = await drive(300_000, {
      settings: { audienceSize: 6 },
      provider: saying(["same", "fair", "true", "yeah", "real", "facts"]),
      script: [[1000, "hey"], [60_000, "hmm"], [120_000, "ok"], [180_000, "well"], [240_000, "so"]],
    });
    expect(messages.length).toBeGreaterThan(15);
    for (const [, lines] of byUser(messages)) {
      const texts = lines.map((m) => m.text);
      expect(new Set(texts).size).toBe(texts.length);
    }
  });

  it("treats hii, heyyy and hey!! as the same thing from one person", async () => {
    const { messages } = await drive(120_000, {
      settings: { audienceSize: 4 },
      provider: saying(["hey", "heyyy", "hey!!", "hii", "hi"]),
      script: [[1000, "hey chat"], [40_000, "hi again"], [80_000, "hello hello"]],
    });
    for (const [, lines] of byUser(messages)) {
      const collapsed = lines.map((m) => m.text.toLowerCase().replace(/(.)\1+/g, "$1").replace(/[^a-z]/g, ""));
      expect(new Set(collapsed).size).toBe(collapsed.length);
    }
  });

  it("never lets one viewer post the same emote block twice", async () => {
    const { messages } = await drive(120_000, {
      settings: { audienceSize: 4 },
      provider: saying(["KEKW", "KEKW KEKW", "KEKW KEKW KEKW"]),
      script: [[1000, "lmao"], [40_000, "lol"], [80_000, "haha"]],
    });
    for (const [, lines] of byUser(messages)) {
      const blocks = lines.map((m) => m.text.split(" ")[0]);
      expect(new Set(blocks).size).toBe(blocks.length);
    }
  });

  it("never lets one viewer greet twice, even across separate greetings", async () => {
    const { messages } = await drive(140_000, {
      settings: { audienceSize: 4 },
      provider: saying(["yo", "hey", "sup", "hii", "hello", "wassup"]),
      script: [[1000, "hey everyone"], [90_000, "hi again chat"]],
    });
    const greeters = messages.filter((m) => m.kind === "greeting").map((m) => m.username);
    expect(greeters.length).toBeGreaterThan(2);
    expect(new Set(greeters).size).toBe(greeters.length);
  });

  it("still lets different viewers say the same thing", async () => {
    const { messages } = await drive(30_000, {
      provider: saying(["W"]),
      script: [[1000, "we just won"]],
    });
    // A pile-on is many people saying one word. That has to survive.
    expect(messages.filter((m) => m.text.includes("W")).length).toBeGreaterThan(3);
  });

  it("still lets a viewer come back later with something new", async () => {
    const { messages } = await drive(300_000, {
      settings: { audienceSize: 6 },
      script: [[1000, "hey"], [100_000, "what do you all think"], [200_000, "okay moving on"]],
    });
    const most = Math.max(...[...byUser(messages).values()].map((lines) => lines.length));
    expect(most).toBeGreaterThan(5);
  });

  it("delays rather than violates when nobody eligible is left", async () => {
    // Four viewers, one line. Four say it, then the room waits for a new
    // line rather than letting anyone say it twice.
    const { messages } = await drive(60_000, {
      settings: { audienceSize: 4 },
      provider: saying(["insane"]),
      script: [[1000, "we just won"]],
    });
    expect(messages.filter((m) => m.text.includes("insane")).length).toBeLessThanOrEqual(4);
  });
});
