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
    // A minute of constant motion against a twelve second cooldown.
    expect(triggers).toBeLessThanOrEqual(5);
    expect(triggers).toBeGreaterThan(2);
  });

  it("does nothing before the streamer has said anything", () => {
    const engine = started();
    engine.screenEvent(1_000);
    // Startup still owns the room; a screen event cannot skip arrival.
    expect(engine.nextGeneration(1_000)?.phase).toBe("startup");
  });

  it("carries the event the model reported into stats", () => {
    const engine = started();
    engine.handleTranscript("hey", 0, undefined, true);
    engine.nextGeneration(0);
    engine.supplyReactions([{ text: "x" }], 100, engine.generationTicket!, "death");
    expect(engine.stats().event).toBe("death");
  });

  it("runs the room louder for a death than for downtime", () => {
    const rateFor = (event: GameEvent) => {
      const engine = started();
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
