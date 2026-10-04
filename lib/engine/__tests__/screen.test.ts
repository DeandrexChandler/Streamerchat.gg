import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../engine";
import { FIXTURE_EMOTES } from "../../data/__fixtures__/emotes";
import { directOne } from "../director";
import { Population } from "../population";
import { createRng } from "../rng";
import { DEFAULT_SETTINGS } from "../../config/settings";
import { profileFor, GAME_EVENTS } from "../../ai/moment";
import type { GameEvent } from "../../ai/moment";
import type { Emote } from "../types";

/**
 * Chat reacting to what is on screen.
 *
 * The engine never sees pixels: the browser hands it "something moved" and
 * the model hands it back a label. These cover both halves plus what the
 * label does to the room.
 */

const EMOTES: Emote[] = [
  { id: "1", name: "peepoHi", mood: "chill", url: "u", tags: ["greeting"] },
  { id: "2", name: "PogChamp", mood: "hype", url: "u", tags: ["hype"] },
  { id: "3", name: "Sadge", mood: "sad", url: "u" },
];

function started(rate = 1) {
  const engine = new SimulationEngine({
    seed: 3,
    now: 0,
    emotes: FIXTURE_EMOTES,
    settings: { messagesPerSecond: rate },
  });
  engine.beginSession(0);
  return engine;
}

describe("screen events", () => {
  /** Fills the queue so a refill is not due; only an event can trigger one. */
  const stock = (engine: SimulationEngine, at: number) => {
    engine.nextGeneration(at);
    engine.supplyReactions(
      Array.from({ length: 40 }, (_, i) => ({ text: `line ${i}` })),
      at,
      engine.generationTicket!,
    );
  };

  it("pulls a batch forward when the screen moves during silence", () => {
    const engine = started();
    engine.handleTranscript("okay lets go", 0, undefined, true);
    stock(engine, 0);

    // Queue is full and nothing was said: no request is due.
    expect(engine.nextGeneration(1_000)).toBeNull();

    engine.screenEvent(1_000);
    expect(engine.nextGeneration(1_250)?.phase).toBe("active");
  });

  it("reacts to a death in silence instead of asking if he is still there", () => {
    const engine = started();
    engine.handleTranscript("okay lets go", 0, undefined, true);
    engine.nextGeneration(0);
    engine.supplyReactions([{ text: "lets go" }], 500, engine.generationTicket!);

    // Well past the idle threshold, so without this the room goes idle.
    const late = 200_000;
    engine.screenEvent(late);
    expect(engine.nextGeneration(late)?.phase).toBe("active");
    expect(engine.currentPhase).toBe("active");
  });

  it("rate-limits a flickering screen", () => {
    // Every tick reports motion and the queue is kept full, so any request
    // that goes out was pulled forward by the screen and nothing else.
    const engine = started();
    engine.handleTranscript("hey", 0, undefined, true);
    stock(engine, 0);

    let triggers = 0;
    for (let now = 250; now < 60_000; now += 250) {
      engine.screenEvent(now);
      if (engine.nextGeneration(now)) {
        triggers += 1;
        engine.supplyReactions(
          Array.from({ length: 40 }, (_, i) => ({ text: `${now}-${i}` })),
          now,
          engine.generationTicket!,
        );
      }
    }
    // A minute of constant motion against an eight second cooldown.
    expect(triggers).toBeLessThanOrEqual(8);
    expect(triggers).toBeGreaterThan(4);
  });

  it("lets the arrival wave go first", () => {
    const engine = started();
    engine.screenEvent(1_000);
    // Superseding the hellos with a screen batch would wipe them.
    expect(engine.nextGeneration(1_000)?.phase).toBe("startup");
  });

  it("reacts to the screen after arrival even if the streamer never speaks", () => {
    // Playing without narrating from the moment Play is pressed.
    const engine = started();
    // The greeting wave and the chatter after it, each small enough that
    // the next is due at once.
    for (let at = 0; at < 2; at += 1) {
      expect(engine.nextGeneration(at * 1_000)?.phase).toBe("startup");
      engine.supplyReactions([{ text: `arrival ${at}` }], at * 1_000, engine.generationTicket!);
    }
    engine.screenEvent(20_000);
    const request = engine.nextGeneration(20_000);
    expect(request?.screen).toBe("changed");
  });

  it("asks for a small batch that goes to the front of the queue", () => {
    // Latency grows with output, and lines appended behind a full queue
    // waited out every one of them: most of the lag after a death.
    const engine = started(2);
    engine.handleTranscript("okay lets go", 0, undefined, true);
    stock(engine, 0);
    expect(engine.pendingReactions).toBe(40);

    engine.screenEvent(1_000);
    const request = engine.nextGeneration(1_000);
    expect(request?.screen).toBe("changed");
    expect(request!.count).toBeLessThanOrEqual(12);

    engine.supplyReactions(
      Array.from({ length: request!.count }, (_, i) => ({ text: `he died ${i}` })),
      3_000,
      engine.generationTicket!,
    );
    expect(engine.pendingReactions).toBe(request!.count);
  });

  it("does not wait behind a routine refill", () => {
    const engine = started();
    engine.handleTranscript("okay lets go", 0, undefined, true);
    engine.nextGeneration(0);
    engine.supplyReactions([{ text: "a" }], 500, engine.generationTicket!);

    // Queue nearly empty: a continuation goes out and is still on the wire.
    const refill = engine.nextGeneration(1_000);
    expect(refill?.continuation).toBe(true);
    const staleTicket = engine.generationTicket!;

    engine.screenEvent(2_000);
    const screen = engine.nextGeneration(2_000);
    expect(screen?.screen).toBe("changed");
    expect(engine.generationTicket).not.toBe(staleTicket);

    // The abandoned refill landing late changes nothing.
    engine.supplyReactions([{ text: "late" }], 4_000, staleTicket);
    expect(engine.generationTicket).not.toBeNull();
  });

  it("waits for a reply to something the streamer just said", () => {
    const engine = started();
    engine.handleTranscript("okay lets go", 0, undefined, true);
    expect(engine.nextGeneration(0)?.continuation).toBe(false);
    engine.screenEvent(1_000);
    // The streamer is waiting on that reply; it is not routine.
    expect(engine.nextGeneration(1_000)).toBeNull();
  });

  it("carries the event the model reported into stats", () => {
    const engine = started();
    engine.handleTranscript("hey", 0, undefined, true);
    engine.nextGeneration(0);
    engine.supplyReactions([{ text: "x" }], 100, engine.generationTicket!, "death");
    expect(engine.stats().event).toBe("death");
  });

  it("runs the room louder for a death than for downtime", () => {
    // Summed over seeds, for the same reason as any rate comparison: ten
    // seconds of one seed is a handful of exponential gaps.
    const rateFor = (event: GameEvent) => {
      let total = 0;
      for (const seed of [1, 2, 3, 4, 5, 6]) total += rateForSeed(event, seed);
      return total;
    };
    const rateForSeed = (event: GameEvent, seed: number) => {
      const engine = new SimulationEngine({
        seed,
        now: 0,
        emotes: FIXTURE_EMOTES,
        settings: { messagesPerSecond: 1 },
      });
      engine.beginSession(0);
      engine.handleTranscript("hey", 0, undefined, true);
      engine.nextGeneration(0);
      engine.supplyReactions(
        Array.from({ length: 40 }, (_, i) => ({ text: `line ${i}` })),
        100,
        engine.generationTicket!,
        event,
      );
      let count = 0;
      for (let now = 100; now < 10_000; now += 250) count += engine.tick(now).length;
      return count;
    };
    expect(rateFor("death")).toBeGreaterThan(rateFor("downtime"));
  });
});

describe("event composition", () => {
  const share = (event: GameEvent | undefined) => {
    const names = new Set(EMOTES.map((e) => e.name));
    let emoteOnly = 0;
    let made = 0;
    for (let seed = 0; seed < 150; seed += 1) {
      const result = directOne({
        topic: null,
        stage: "developing",
        band: "low",
        population: new Population(createRng(seed + 500), 12),
        settings: DEFAULT_SETTINGS,
        emotes: EMOTES,
        reaction: {
          text: "that was actually wild",
          emotion: "hype",
          batchId: 1,
          createdAt: 0,
          intent: "mundane",
          phase: "active",
        },
        phase: "active",
        event,
        recentSpeakers: [],
        now: 1_000,
        sequence: seed,
        rng: createRng(seed),
      });
      if (!result) continue;
      made += 1;
      if (result.message.text.split(" ").every((w) => names.has(w))) emoteOnly += 1;
    }
    expect(made).toBeGreaterThan(80);
    return emoteOnly / made;
  };

  it("makes a death emote-heavy and a menu wordy", () => {
    // The whole reason for looking at the screen: a wall of emotes over a
    // menu is noise, the same wall over a death is chat.
    expect(share("death")).toBeGreaterThan(share("menu") + 0.1);
  });

  it("falls back to the intent when nothing is known about the screen", () => {
    const blind = share(undefined);
    expect(blind).toBeGreaterThan(0.03);
    expect(blind).toBeLessThan(0.3);
  });

  it("gives every event a profile", () => {
    for (const event of GAME_EVENTS) {
      const profile = profileFor(event);
      expect(profile.emoteShare).toBeGreaterThanOrEqual(0);
      expect(profile.emoteShare).toBeLessThanOrEqual(0.5);
      expect(profile.rate).toBeGreaterThan(0);
    }
  });
});

/**
 * "screen", said or typed.
 *
 * The streamer pointing chat at the picture, rather than the picture
 * moving on its own. Each one costs a call carrying an image, so the
 * cooldown and what the streamer is told about it are part of the feature,
 * not decoration.
 */
describe("the screen hot word", () => {
  const ready = (rate = 1) => {
    const engine = started(rate);
    engine.setCapturing(true);
    return engine;
  };

  it("points chat at the screen when the streamer says it", () => {
    const engine = ready();
    const outcome = engine.handleTranscript("chat look at my screen", 1_000, undefined, true);
    expect(outcome?.screen?.state).toBe("fired");
    expect(engine.nextGeneration(1_000)?.screen).toBe("asked");
  });

  it("works the same typed", () => {
    const engine = ready();
    const outcome = engine.handleTranscript("screen", 1_000, undefined, true);
    expect(outcome?.screen?.state).toBe("fired");
  });

  it("fires even when the attention gate would ignore the line", () => {
    // "screen" is an instruction, not chatter: a line that reads as bland
    // still points chat at the picture.
    const engine = ready();
    let fired = 0;
    for (let i = 0; i < 6; i += 1) {
      const at = i * 30_000;
      const outcome = engine.handleTranscript("look at the screen", at);
      if (outcome?.screen?.state === "fired") fired += 1;
    }
    expect(fired).toBe(6);
  });

  it("refuses a second one inside the cooldown, and says how long is left", () => {
    const engine = ready();
    engine.handleTranscript("screen", 0, undefined, true);
    const again = engine.handleTranscript("screen again", 5_000, undefined, true);
    expect(again?.screen?.state).toBe("cooldown");
    expect(again?.screen?.readyInMs).toBe(15_000);
  });

  it("works again once the cooldown has passed", () => {
    const engine = ready();
    engine.handleTranscript("screen", 0, undefined, true);
    expect(engine.handleTranscript("screen", 20_000, undefined, true)?.screen?.state).toBe("fired");
  });

  it("says so when capture is off instead of asking about an image that will not exist", () => {
    const engine = started();
    const outcome = engine.handleTranscript("look at my screen", 1_000, undefined, true);
    expect(outcome?.screen?.state).toBe("off");
    // And no screen batch: there is no frame to send.
    expect(engine.nextGeneration(1_000)?.screen).toBeUndefined();
  });

  it("leaves ordinary words alone", () => {
    const engine = ready();
    for (const line of ["i took a screenshot", "my screens are too bright", "scream"]) {
      expect(engine.handleTranscript(line, 0, undefined, true)?.screen).toBeUndefined();
    }
  });

  it("does not let the motion watcher fire a second batch for the same moment", () => {
    // The word already spent a call on this picture; a frame that also
    // moved must not spend another one two seconds later.
    const engine = ready();
    engine.handleTranscript("screen", 1_000, undefined, true);
    engine.nextGeneration(1_000);
    engine.supplyReactions([{ text: "oh that is grim" }], 2_000, engine.generationTicket!);

    engine.screenEvent(3_000);
    expect(engine.nextGeneration(3_000)?.screen).toBeUndefined();
  });
});
