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
  /** Simulated provider latency. Replies land this long after the request. */
  latencyMs?: number;
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

  const landing: Array<{ at: number; ticket: number; request: CandidateRequest }> = [];

  engine.beginSession(0);
  for (let now = 0; now <= durationMs; now += 250) {
    while (script.length > 0 && script[0][0] <= now) {
      engine.handleTranscript(script.shift()![1], now, undefined, true);
    }
    const deliver = async () => {
      while (landing.length > 0 && landing[0].at <= now) {
        const { ticket, request } = landing.shift()!;
        const result = await provider.generate(request);
        if (result.status === "ok" && result.reactions.length > 0) {
          engine.supplyReactions(result.reactions, now, ticket);
        } else {
          engine.generationFailed(now, ticket);
        }
      }
    };
    await deliver();
    const request = engine.nextGeneration(now);
    if (request) {
      session.requests.push(request);
      landing.push({ at: now + (options.latencyMs ?? 0), ticket: engine.generationTicket!, request });
      await deliver();
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
      settings: { messagesPerSecond: 0.5 },
      script: [[1000, "hey everyone"], [40_000, "chat what should i build"]],
    });
    const names = new Set(messages.map((m) => m.username));
    expect(messages.length).toBeGreaterThan(30);
    expect(names.size).toBeLessThan(messages.length / 2);
  });

  it("gives a viewer a stable colour across their messages", async () => {
    const { messages } = await drive(180_000, {
      settings: { messagesPerSecond: 0.5 },
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

  it("greets once per viewer in the first wave, and sizes the wave to the room", async () => {
    const { messages, requests } = await drive(12_000, {});
    expect(requests[0].count).toBeLessThanOrEqual(10);
    // The first wave is consumed first; the chatter that follows may reuse names.
    const wave = messages.slice(0, requests[0].count).map((m) => m.username);
    expect(wave.length).toBeGreaterThan(5);
    expect(new Set(wave).size).toBe(wave.length);
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

  it("stays continuous on a slow provider by sizing against measured latency", async () => {
    // Twelve-second replies, the way Gemini answered on a bad day. After the
    // first batches have measured it, the queue must not run dry.
    let dry = 0;
    let ticks = 0;
    const { engine } = await drive(240_000, {
      latencyMs: 12_000,
      script: [[1000, "hey chat"]],
      onTick: ({ engine }, now) => {
        if (now < 60_000) return;
        ticks += 1;
        if (engine.pendingReactions === 0) dry += 1;
      },
    });
    expect(engine.stats().latencyMs).toBeGreaterThan(8_000);
    expect(dry / ticks).toBeLessThan(0.05);
  });

  it("learns the provider's latency even from a reply it abandoned", () => {
    // On a slow day the arrival batch is the first thing abandoned — the
    // streamer speaks before it lands — and it is also the first measurement.
    const engine = new SimulationEngine({ seed: 1, now: 0 });
    engine.beginSession(0);
    engine.nextGeneration(0);
    const arrival = engine.generationTicket!;
    engine.handleTranscript("hey chat", 2_000, undefined, true);
    engine.nextGeneration(2_000);
    engine.supplyReactions([{ text: "hi" }], 15_000, arrival);
    expect(engine.stats().latencyMs).toBeGreaterThan(8_000);
  });

  it("asks for bigger batches, earlier, when the provider is slow", () => {
    const at = (latency: number) => {
      const engine = new SimulationEngine({ seed: 1, now: 0, settings: { messagesPerSecond: 1 } });
      engine.beginSession(0);
      engine.nextGeneration(0);
      engine.supplyReactions([{ text: "hi" }], latency);
      engine.handleTranscript("look at this roof", latency, undefined, true);
      engine.nextGeneration(latency);
      engine.supplyReactions([{ text: "nice" }], latency * 2);
      return engine.nextGeneration(latency * 2 + 250)!.count;
    };
    expect(at(12_000)).toBeGreaterThan(at(1_000));
  });

  it("continues the conversation when a batch drains and nobody spoke", async () => {
    const { requests } = await drive(50_000, { script: [[1000, "look at this roof"]] });
    const continuations = requests.filter((r) => r.phase === "active" && r.continuation);
    expect(continuations.length).toBeGreaterThan(0);
    expect(continuations[0].utterance).toBe("look at this roof");
    // Requested once the first reply has started draining, not before.
    expect(continuations[0].silenceSeconds).toBeGreaterThanOrEqual(1);
    expect(requests.indexOf(continuations[0])).toBeGreaterThan(
      requests.findIndex((r) => r.phase === "active" && !r.continuation),
    );
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

  it("keeps the previous sentence's lines flowing and answers the new one at once", async () => {
    // Chrome finalises a phrase at every pause, so one thought lands as two
    // or three transcripts. Flushing on each one left chat silent for a
    // round trip every few seconds while the streamer was talking.
    const { engine } = await drive(5_000, { script: [[1000, "i'll play minecraft"]] });
    const before = engine.pendingReactions;
    expect(before).toBeGreaterThan(0);

    engine.handleTranscript("actually valorant", 5_000, undefined, true);
    // Old lines stay queued...
    expect(engine.pendingReactions).toBe(before);
    // ...and the reply to the new line goes out immediately, however full
    // the queue is, and will replace them when it lands.
    const next = engine.nextGeneration(5_000);
    expect(next?.utterance).toBe("actually valorant");
    expect(next?.continuation).toBe(false);
    engine.supplyReactions([{ text: "valorant lets go" }, { text: "finally" }], 5_500, engine.generationTicket!);
    expect(engine.pendingReactions).toBe(2);
  });

  it("does not go quiet between two sentences said a few seconds apart", async () => {
    // Reply to sentence one lands at 3s; sentence two at 6s; its reply at 8s.
    // Between 6s and 8s the room used to be empty.
    let dry = 0;
    let ticks = 0;
    await drive(12_000, {
      latencyMs: 2_000,
      script: [[1000, "so today we're playing sims"], [6000, "and i think we build a house first"]],
      onTick: ({ engine }, now) => {
        if (now < 6_000 || now > 8_000) return;
        ticks += 1;
        if (engine.pendingReactions === 0) dry += 1;
      },
    });
    expect(ticks).toBeGreaterThan(0);
    expect(dry).toBe(0);
  });

  it("still flushes arrival and idle lines when the streamer first speaks", async () => {
    // A phase change is a different room. "im early" landing after the
    // streamer's first sentence reads as chat a message behind.
    const { engine } = await drive(3_000);
    expect(engine.currentPhase).toBe("startup");
    expect(engine.pendingReactions).toBeGreaterThan(0);
    engine.handleTranscript("okay hey chat", 3_000, undefined, true);
    expect(engine.pendingReactions).toBe(0);
  });

  it("keeps what was already released", async () => {
    const { messages } = await drive(20_000, {
      script: [[1000, "i'll play minecraft"], [8_000, "actually valorant"]],
    });
    const before = messages.filter((m) => m.at < 8_000);
    expect(before.length).toBeGreaterThan(0);
  });

  it("lets a reply to the previous sentence land, then answers the newest", () => {
    const engine = new SimulationEngine({ seed: 3, now: 0 });
    engine.beginSession(0);
    engine.handleTranscript("first thing", 0, undefined, true);
    const request = engine.nextGeneration(0);
    expect(request?.utterance).toBe("first thing");

    // The streamer moves on while the request is in flight. The reply is
    // about something said one round trip ago — chat always is — so it is
    // kept, and the reply to the newer line follows at once.
    engine.handleTranscript("second thing", 500, undefined, true);
    expect(engine.nextGeneration(750)).toBeNull(); // still waiting on the first
    engine.supplyReactions([{ text: "about the first thing" }], 1_000, engine.generationTicket!);
    expect(engine.pendingReactions).toBe(1);

    const next = engine.nextGeneration(1_250);
    expect(next?.utterance).toBe("second thing");
    expect(next?.continuation).toBe(false);
  });

  it("discards an arrival batch that lands after the streamer has spoken", () => {
    const engine = new SimulationEngine({ seed: 3, now: 0 });
    engine.beginSession(0);
    engine.nextGeneration(0);
    const ticket = engine.generationTicket!;
    engine.handleTranscript("hey chat", 500, undefined, true);
    engine.supplyReactions([{ text: "im early" }], 1_000, ticket);
    expect(engine.pendingReactions).toBe(0);
  });

  it("is not starved by sentences arriving faster than the provider answers", async () => {
    // Three sentences in eight seconds against an eight-second reply. Each
    // new sentence used to abandon the reply on the wire, so nothing landed
    // until the last one's reply at 17s — sixteen seconds of silence while
    // the streamer was talking.
    const { messages } = await drive(20_000, {
      latencyMs: 8_000,
      script: [[1000, "so today we play sims"], [5000, "gonna build a house"], [9000, "maybe a pool too"]],
    });
    expect(messages.filter((m) => m.at >= 9_000 && m.at < 16_000).length).toBeGreaterThan(3);
  });

  it("keeps up with a streamer who talks for a minute without stopping", async () => {
    // What the recogniser now hands over when nobody pauses: a chunk every
    // five seconds. Chat has to keep talking throughout and keep answering
    // the latest chunk, not fall a minute behind.
    const script: Array<[number, string]> = [];
    for (let at = 1_000; at <= 61_000; at += 5_000) script.push([at, `and then chunk ${at / 1000} of the story`]);
    const { messages, requests } = await drive(70_000, { latencyMs: 3_000, script });

    for (let from = 5_000; from < 65_000; from += 10_000) {
      expect(messages.filter((m) => m.at >= from && m.at < from + 10_000).length).toBeGreaterThan(2);
    }
    const answered = requests.filter((r) => r.phase === "active" && !r.continuation).map((r) => r.utterance);
    expect(answered).toContain("and then chunk 61 of the story");
  });

  it("ignores a reply carrying an abandoned ticket", () => {
    // The streamer spoke during a slow arrival call. The arrival reply lands
    // after the reaction request went out; it must not be mistaken for the
    // reaction, and its failure must not back off the reaction either.
    const engine = new SimulationEngine({ seed: 3, now: 0 });
    engine.beginSession(0);
    engine.nextGeneration(0);
    const arrival = engine.generationTicket!;

    engine.handleTranscript("hey chat", 6_000, undefined, true);
    const reaction = engine.nextGeneration(6_000);
    const ticket = engine.generationTicket!;
    expect(reaction?.phase).toBe("active");
    expect(ticket).not.toBe(arrival);

    engine.supplyReactions([{ text: "hi" }], 8_000, arrival);
    expect(engine.pendingReactions).toBe(0);
    engine.generationFailed(8_000, arrival);
    expect(engine.generationTicket).toBe(ticket);

    engine.supplyReactions([{ text: "hey!" }], 9_000, ticket);
    expect(engine.pendingReactions).toBe(1);
  });

  it("asks for a full batch on the first reply, so the refill is off the critical path", () => {
    // Ten lines drained in seven seconds; any refill slower than that was a
    // visible gap. One round trip now covers the whole moment.
    const engine = new SimulationEngine({ seed: 1, now: 0, settings: { messagesPerSecond: 4 } });
    engine.beginSession(0);
    engine.handleTranscript("look at this roof", 0, undefined, true);
    const first = engine.nextGeneration(0)!;
    expect(first.count).toBeGreaterThan(30);
    engine.supplyReactions([{ text: "nice" }], 100, engine.generationTicket!);
    const next = engine.nextGeneration(200)!;
    expect(next.continuation).toBe(true);
    expect(next.count).toBe(first.count);
  });

  it("still sizes a greeting wave to the room", () => {
    // One hello per person is a hard rule; asking for more leaves the rest unsayable.
    const engine = new SimulationEngine({ seed: 1, now: 0, settings: { messagesPerSecond: 4 } });
    engine.beginSession(0);
    engine.handleTranscript("hey everyone", 0, undefined, true);
    expect(engine.nextGeneration(0)!.count).toBe(engine.stats().simulated);
  });

  it("goes quiet, not canned, when the provider fails", async () => {
    const { messages } = await drive(40_000, { provider: dead, script: [[1000, "hey chat"]] });
    expect(messages).toHaveLength(0);
  });

  it("backs off after a failure rather than hammering", async () => {
    const { requests } = await drive(60_000, { provider: dead, script: [[1000, "hey chat"]] });
    // 60s at a 3s backoff is about twenty attempts — trying, not spinning.
    expect(requests.length).toBeLessThan(25);
    expect(requests.length).toBeGreaterThan(10);
  });

  it("answers the first thing said even while the arrival batch is still in flight", () => {
    // The reported freeze: a slow arrival call, the streamer says hello
    // during it, and the late batch must be discarded while the reaction
    // request goes out at once.
    const engine = new SimulationEngine({ seed: 3, now: 0 });
    engine.beginSession(0);
    const arrival = engine.nextGeneration(0);
    expect(arrival?.phase).toBe("startup");

    engine.handleTranscript("hey chat", 6_000, undefined, true);
    // The arrival answer lands after the streamer spoke.
    engine.supplyReactions([{ text: "hi" }, { text: "im early" }], 8_000);
    expect(engine.pendingReactions).toBe(0);

    const reaction = engine.nextGeneration(8_000);
    expect(reaction?.phase).toBe("active");
    expect(reaction?.utterance).toBe("hey chat");
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
    // Sixty seconds of idle at one a second, averaged over seeds: one seed's
    // gap draws say nothing about the rate, and anything that changes how
    // many random numbers are drawn upstream reshuffles them.
    const counts: number[] = [];
    for (const seed of [1, 2, 3, 4, 5]) {
      const { messages } = await drive(lastWord + IDLE_AFTER_MS + 60_000, {
        seed,
        settings: { messagesPerSecond: 1 },
        script: [[lastWord, "okay building now"]],
      });
      counts.push(messages.filter((m) => m.kind === "idle").length);
    }
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    expect(mean).toBeGreaterThan(35);
    expect(mean).toBeLessThan(95);
  });

  it("escalates through the stages as silence continues", async () => {
    const { requests } = await drive(lastWord + 1_220_000, {
      script: [[lastWord, "okay building now"]],
    });
    const stages = [...new Set(requests.filter((r) => r.phase === "idle").map((r) => r.idleStage))];
    expect(stages).toEqual([1, 2, 3, 4]);
  });

  it("replaces the old stage's lines when the new stage's batch lands", async () => {
    // With an instant provider the stage-2 batch lands on the boundary tick
    // and takes the queue over; nothing from stage 1 is spoken after it.
    const { messages, requests } = await drive(lastWord + 480_000 + 30_000, {
      script: [[lastWord, "okay building now"]],
    });
    const boundary = lastWord + 480_000;
    expect(requests.some((r) => r.phase === "idle" && r.idleStage === 2)).toBe(true);
    const after = messages.filter((m) => m.at > boundary + 1_000);
    expect(after.length).toBeGreaterThan(10);
  });

  it("keeps the old lines flowing across a transition while the provider is slow", async () => {
    // A 12s provider used to mean 12s of silence at every phase or stage
    // change: the queue was dropped first and refilled second.
    let dry = 0;
    let ticks = 0;
    await drive(lastWord + 480_000 + 40_000, {
      latencyMs: 12_000,
      script: [[lastWord, "okay building now"]],
      onTick: ({ engine }, now) => {
        // Around the idle threshold and the stage-2 boundary.
        const nearIdle = now > lastWord + IDLE_AFTER_MS - 5_000 && now < lastWord + IDLE_AFTER_MS + 20_000;
        const nearStage2 = now > lastWord + 475_000 && now < lastWord + 500_000;
        if (!nearIdle && !nearStage2) return;
        ticks += 1;
        if (engine.pendingReactions === 0) dry += 1;
      },
    });
    expect(dry / ticks).toBeLessThan(0.05);
  });

  it("holds off while the game is doing things on screen", async () => {
    // Playing without narrating is still streaming. Idle is for when the
    // screen has gone quiet too.
    const screenUntil = lastWord + IDLE_AFTER_MS + 120_000;
    let idleEarly = 0;
    const { engine } = await drive(screenUntil + IDLE_AFTER_MS + 10_000, {
      script: [[lastWord, "okay building now"]],
      onTick: ({ engine }, now) => {
        if (now < screenUntil && now % 30_000 === 0) engine.screenEvent(now);
        if (now < screenUntil + IDLE_AFTER_MS - 30_000 && engine.currentPhase === "idle") idleEarly += 1;
      },
    });
    expect(idleEarly).toBe(0);
    // And once the screen goes quiet as well, idle arrives on schedule.
    expect(engine.currentPhase).toBe("idle");
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
      // Not a greeting: a wave of hellos is sized to the room, not the tier.
      engine.handleTranscript("look at this roof", 0, undefined, true);
      engine.nextGeneration(0);
      engine.supplyReactions([{ text: "nice" }], 100);
      // The continuation carries the tier's full batch size.
      return engine.nextGeneration(200)!.count;
    };
    expect(at(0.2)).toBeLessThan(at(1));
    expect(at(1)).toBeLessThan(at(4));
    expect(at(4)).toBeLessThanOrEqual(70);
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
      settings: { messagesPerSecond: 0.2 },
      provider: saying(["same", "fair", "true", "yeah", "real", "facts", "valid", "bet", "word", "sure", "right", "ok"]),
      script: [[1000, "hey"], [60_000, "hmm"], [120_000, "ok"], [180_000, "well"], [240_000, "so"]],
    });
    // Three regulars at this tier, each never repeating a line all session.
    expect(messages.length).toBeGreaterThan(10);
    for (const [, lines] of byUser(messages)) {
      const texts = lines.map((m) => m.text);
      expect(new Set(texts).size).toBe(texts.length);
    }
  });

  it("treats hii, heyyy and hey!! as the same thing from one person", async () => {
    const { messages } = await drive(120_000, {
      settings: { messagesPerSecond: 0.2 },
      provider: saying(["hey", "heyyy", "hey!!", "hii", "hi"]),
      script: [[1000, "hey chat"], [40_000, "hi again"], [80_000, "hello hello"]],
    });
    for (const [, lines] of byUser(messages)) {
      const collapsed = lines.map((m) => m.text.toLowerCase().replace(/(.)\1+/g, "$1").replace(/[^a-z]/g, ""));
      expect(new Set(collapsed).size).toBe(collapsed.length);
    }
  });

  it("never lets one viewer post the same emote block twice within a minute", async () => {
    const { messages } = await drive(120_000, {
      settings: { messagesPerSecond: 0.2 },
      provider: saying(["KEKW", "KEKW KEKW", "KEKW KEKW KEKW"]),
      script: [[1000, "lmao"], [40_000, "lol"], [80_000, "haha"]],
    });
    for (const [, lines] of byUser(messages)) {
      for (let i = 0; i < lines.length; i += 1) {
        for (let j = i + 1; j < lines.length; j += 1) {
          if (lines[i].text.split(" ")[0] !== lines[j].text.split(" ")[0]) continue;
          expect(lines[j].at - lines[i].at).toBeGreaterThanOrEqual(60_000);
        }
      }
    }
  });

  it("lets a viewer post the same emote again later in the stream", async () => {
    // People post KEKW more than once a stream. A lifetime ban ran viewers
    // out of emotes mid-session and left slots unfilled.
    const { messages } = await drive(300_000, {
      settings: { messagesPerSecond: 0.2 },
      provider: saying(["KEKW"]),
      script: [[1000, "lmao"], [100_000, "lol"], [200_000, "haha"]],
    });
    const again = [...byUser(messages).values()].some(
      (lines) => lines.filter((m) => m.text === "KEKW").length > 1,
    );
    expect(again).toBe(true);
  });

  it("still never repeats a worded line from the same viewer all session", async () => {
    const { messages } = await drive(300_000, {
      settings: { messagesPerSecond: 0.2 },
      provider: saying(["that was insane", "no way"]),
      script: [[1000, "lmao"], [100_000, "lol"], [200_000, "haha"]],
    });
    for (const [, lines] of byUser(messages)) {
      const worded = lines.map((m) => m.text).filter((t) => /insane|no way/.test(t));
      const base = worded.map((t) => (t.includes("insane") ? "insane" : "no way"));
      expect(new Set(base).size).toBe(base.length);
    }
  });

  it("never lets one viewer greet twice in the same moment", async () => {
    // "quinn: sup" then "quinn: heyyyy" four lines later. Arriving and then
    // answering the streamer's hello half a minute on are two moments and
    // the same person may do both; two hellos inside fifteen seconds is one
    // person greeting twice.
    const { messages } = await drive(140_000, {
      settings: { messagesPerSecond: 0.2 },
      provider: saying(["yo", "hey", "sup", "hii", "hello", "wassup", "heya", "ello", "hai", "yoo"]),
      script: [[1000, "hey everyone"], [90_000, "hi again chat"]],
    });
    const greetings = messages.filter((m) => m.kind === "greeting");
    // Two waves in a three-person room.
    expect(greetings.length).toBeGreaterThan(3);
    for (const [, lines] of byUser(greetings)) {
      for (let i = 1; i < lines.length; i++) {
        expect(lines[i].at - lines[i - 1].at).toBeGreaterThan(15_000);
      }
    }
  });

  it("answers the streamer's hello even though everyone just said hello arriving", async () => {
    // The freeze: ten arrivals, ten viewers marked as having greeted, and a
    // session-long ban meant nobody could reply to "hi". The room went quiet
    // until idle changed the subject a minute later.
    const { messages } = await drive(45_000, { script: [[15_000, "hi chat"]] });
    const arrivals = messages.filter((m) => m.at < 15_000);
    const replies = messages.filter((m) => m.at >= 15_000 && m.at < 30_000);
    expect(new Set(arrivals.map((m) => m.username)).size).toBeGreaterThanOrEqual(8);
    expect(replies.length).toBeGreaterThan(8);
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
      settings: { messagesPerSecond: 0.2 },
      script: [[1000, "hey"], [100_000, "what do you all think"], [200_000, "okay moving on"]],
    });
    const most = Math.max(...[...byUser(messages).values()].map((lines) => lines.length));
    expect(most).toBeGreaterThan(5);
  });

  it("delays rather than violates when nobody eligible is left", async () => {
    // Five viewers, one line. Five say it, then the room waits for a new
    // line rather than letting anyone say it twice.
    const { messages } = await drive(60_000, {
      settings: { messagesPerSecond: 0.2 },
      provider: saying(["insane"]),
      script: [[1000, "we just won"]],
    });
    expect(messages.filter((m) => m.text.includes("insane")).length).toBeLessThanOrEqual(5);
  });
});

// -------------------------------------------------------------- identity

describe("viewer identity", () => {
  it.each([
    [0.2, 3],
    [0.5, 4],
    [1, 6],
    [1.5, 8],
    [2, 10],
    [4, 12],
  ])("keeps %s/sec to %i regulars", async (rate, size) => {
    const { engine } = await drive(5_000, { settings: { messagesPerSecond: rate } });
    expect(engine.stats().simulated).toBe(size);
  });

  it("shows only regulars at the slowest tier", async () => {
    // Three viewers who each turn up once are not a chat. The slowest tier
    // has no stranger tail at all, so every name is one he will see again.
    const { messages, engine } = await drive(300_000, {
      settings: { messagesPerSecond: 0.2 },
      script: [[1000, "hey"], [100_000, "what do you think"], [200_000, "let's go"]],
    });
    expect(messages.length).toBeGreaterThan(20);
    expect(new Set(messages.map((m) => m.username)).size).toBe(engine.stats().simulated);
  });

  it("lets a long tail of one-off names through at a busy tier", async () => {
    // Real mid-size chats show dozens of distinct names a minute. A flat
    // roster cannot.
    const { messages } = await drive(240_000, {
      settings: { messagesPerSecond: 1 },
      script: [[1000, "hey"], [60_000, "what do you think"], [120_000, "let's go"]],
    });
    const names = [...new Set(messages.map((m) => m.username))];
    expect(names.length).toBeGreaterThan(30);
  });

  it("does not let the same few names spam chat at the busier tiers", async () => {
    /**
     * From a live session: "the same couple of names spamming chat". Ten
     * regulars were each posting about ten lines a minute. The busiest real
     * chatter in four sampled channels (1.2 to 3.2 messages a second) posted
     * three to five, so nobody here may run far beyond that.
     */
    for (const [rate, ceiling] of [[1, 9], [2, 5], [4, 4]] as const) {
      const minutes = 4;
      const { messages } = await drive(minutes * 60_000, {
        settings: { messagesPerSecond: rate },
        script: [[1000, "hey"], [60_000, "what do you think"], [120_000, "let's go"]],
      });
      const counts = new Map<string, number>();
      for (const m of messages) counts.set(m.username, (counts.get(m.username) ?? 0) + 1);
      const busiest = Math.max(...counts.values());
      expect(busiest / minutes).toBeLessThanOrEqual(ceiling);
    }
  });

  it("blends the regulars into the crowd at CHAOS", async () => {
    // The owner's call: at the top tier a regular is no more present than
    // anyone else, so the room reads as a crowd rather than a cast.
    const { messages, engine } = await drive(240_000, {
      settings: { messagesPerSecond: 4 },
      script: [[1000, "hey"], [60_000, "what do you think"], [120_000, "let's go"]],
    });
    const regulars = new Set(engine.exportRoster().map((viewer) => viewer.name));
    const fromRegulars = messages.filter((m) => regulars.has(m.username)).length;
    expect(fromRegulars / messages.length).toBeLessThan(0.15);
  });

  it("keeps a name's colour and identity for the whole session", async () => {
    const { messages } = await drive(300_000, {
      settings: { messagesPerSecond: 2 },
      script: [[1000, "hey"], [100_000, "what do you think"], [200_000, "let's go"]],
    });
    for (const [, lines] of byUser(messages)) {
      expect(new Set(lines.map((m) => m.color)).size).toBe(1);
      expect(new Set(lines.map((m) => m.viewerId)).size).toBe(1);
    }
  });

  it("uses only the fixed Twitch palette", async () => {
    const { messages } = await drive(60_000, { settings: { messagesPerSecond: 4 } });
    for (const message of messages) expect(message.color).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("keeps the regular roster fixed while strangers churn past", async () => {
    const { messages, engine } = await drive(300_000, {
      settings: { messagesPerSecond: 4 },
      script: [[1000, "hey"], [100_000, "what do you think"], [200_000, "let's go"]],
    });
    // Most names at CHAOS are strangers; the regular roster does not grow.
    expect(new Set(messages.map((m) => m.username)).size).toBeGreaterThan(50);
    expect(engine.stats().simulated).toBe(12);
  });

  it("never turns over a slow room", async () => {
    const { messages } = await drive(300_000, {
      settings: { messagesPerSecond: 0.2 },
      script: [[1000, "hey"], [100_000, "what do you think"], [200_000, "let's go"]],
    });
    expect(new Set(messages.map((m) => m.username)).size).toBeLessThanOrEqual(5);
  });

  it("never reissues a departed name", async () => {
    const { messages } = await drive(300_000, {
      settings: { messagesPerSecond: 4 },
      script: [[1000, "hey"], [100_000, "what do you think"], [200_000, "let's go"]],
    });
    // One id per name and one name per id, across the whole session.
    const byName = new Map<string, Set<string>>();
    for (const m of messages) byName.set(m.username, (byName.get(m.username) ?? new Set()).add(m.viewerId));
    for (const ids of byName.values()) expect(ids.size).toBe(1);
  });

  it("caps consecutive messages from one viewer at three", async () => {
    const { messages } = await drive(120_000, {
      settings: { messagesPerSecond: 4 },
      script: [[1000, "LET'S GO WE WON"], [30_000, "INSANE"], [60_000, "NO WAY"]],
    });
    let run = 0;
    let previous = "";
    for (const m of messages) {
      run = m.username === previous ? run + 1 : 1;
      previous = m.username;
      expect(run).toBeLessThanOrEqual(3);
    }
  });

  it("lets nobody post more than three lines in ten seconds, in a row or not", async () => {
    // A B A B A gets past the consecutive cap and is still two people holding
    // the room. Hype moments are where the cooldown is waived, so test there.
    const { messages } = await drive(120_000, {
      settings: { messagesPerSecond: 4 },
      script: [[1000, "LET'S GO WE WON"], [30_000, "INSANE"], [60_000, "NO WAY"]],
    });
    expect(messages.length).toBeGreaterThan(200);
    const times = new Map<string, number[]>();
    for (const m of messages) {
      const mine = [...(times.get(m.viewerId) ?? []), m.at].filter((t) => m.at - t < 10_000);
      times.set(m.viewerId, mine);
      expect(mine.length).toBeLessThanOrEqual(3);
    }
  });

  it("lets one viewer fire off consecutive lines in a hype moment", async () => {
    const { messages } = await drive(60_000, {
      settings: { messagesPerSecond: 4 },
      script: [[1000, "LET'S GO WE WON"], [20_000, "THAT WAS INSANE"], [40_000, "NO WAY"]],
    });
    let longest = 0;
    let run = 0;
    let previous = "";
    for (const m of messages) {
      run = m.username === previous ? run + 1 : 1;
      previous = m.username;
      longest = Math.max(longest, run);
    }
    expect(longest).toBeGreaterThan(1);
  });

  it("makes people take turns outside a hype moment", async () => {
    // Four regulars at this tier, so somebody following themselves now and
    // then is what a small room does. It is the wall of one name that is
    // the tell, and the consecutive cap covers that.
    const { messages } = await drive(120_000, {
      settings: { messagesPerSecond: 0.5 },
      script: [[1000, "so yesterday something happened at work"]],
    });
    let backToBack = 0;
    for (let i = 1; i < messages.length; i++) {
      if (messages[i].username === messages[i - 1].username) backToBack += 1;
    }
    expect(backToBack / Math.max(1, messages.length)).toBeLessThan(0.2);
  });

  it("gives strangers no history to run out of", async () => {
    // A regular never repeats a line all session. A stranger has no session:
    // two different one-off names may well say the same thing.
    const { messages } = await drive(120_000, {
      settings: { messagesPerSecond: 4 },
      provider: saying(["W", "insane", "no way"]),
      script: [[1000, "we just won"]],
    });
    expect(messages.length).toBeGreaterThan(50);
    for (const [, lines] of byUser(messages)) {
      const texts = lines.map((m) => m.text);
      expect(new Set(texts).size).toBe(texts.length);
    }
  });
});
