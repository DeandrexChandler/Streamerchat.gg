import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../engine";
import { FIXTURE_EMOTES } from "../../data/__fixtures__/emotes";
import type { ChatMessage } from "../types";

/**
 * The room at the slow tiers.
 *
 * At 0.2/sec chat is three regulars the streamer talks to by name, not a
 * crowd. That only works if the model knows who is in the room, writes each
 * line as one of them, and the engine puts those words in that person's
 * mouth — which is what these pin down.
 */

function engineAt(rate: number) {
  const engine = new SimulationEngine({
    seed: 11,
    now: 0,
    emotes: FIXTURE_EMOTES,
    settings: { messagesPerSecond: rate },
  });
  engine.beginSession(0);
  return engine;
}

/** Runs a batch through and collects what was actually said. */
function say(
  engine: SimulationEngine,
  lines: ReadonlyArray<{ text: string; from?: string }>,
  from = 1_000,
): ChatMessage[] {
  engine.nextGeneration(from);
  engine.supplyReactions(lines, from, engine.generationTicket!);
  const out: ChatMessage[] = [];
  for (let now = from; now < from + 120_000; now += 250) out.push(...engine.tick(now));
  return out;
}

describe("the room at slow tiers", () => {
  it("tells the model who is in the room, with their names", () => {
    const engine = engineAt(0.2);
    engine.handleTranscript("okay chat what should i build", 0, undefined, true);
    const request = engine.nextGeneration(0);

    const names = engine.exportRoster().map((viewer) => viewer.name);
    expect(names.length).toBeGreaterThan(0);
    expect(request?.roster?.map((entry) => entry.name)).toEqual(names);
    // Each one comes with a voice, or the model has nothing to write in.
    for (const entry of request!.roster!) expect(entry.persona.length).toBeGreaterThan(0);
  });

  it("does not send the room at fast tiers, where names scroll past unread", () => {
    const engine = engineAt(4);
    engine.handleTranscript("okay chat what should i build", 0, undefined, true);
    expect(engine.nextGeneration(0)?.roster).toBeUndefined();
  });

  it("gives a line to the viewer the model wrote it for", () => {
    const engine = engineAt(0.2);
    engine.handleTranscript("what do you think", 0, undefined, true);
    const roster = engine.exportRoster();
    const chosen = roster[roster.length - 1].name;

    const messages = say(engine, [{ text: "i think the roof needs work", from: chosen }]);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].username).toBe(chosen);
  });

  it("ignores a name that is not in the room rather than dropping the line", () => {
    const engine = engineAt(0.2);
    engine.handleTranscript("what do you think", 0, undefined, true);
    const names = new Set(engine.exportRoster().map((viewer) => viewer.name));

    const messages = say(engine, [{ text: "no shot that worked", from: "someone_invented" }]);
    expect(messages.length).toBeGreaterThan(0);
    expect(names.has(messages[0].username)).toBe(true);
  });

  it("hears a regular's name through speech recognition spacing", () => {
    // "hazelirl" is transcribed "hazel irl"; the match ignores spacing.
    const engine = engineAt(0.2);
    const target = engine.exportRoster()[0].name;
    const spaced = `${target.slice(0, 3)} ${target.slice(3)}`;

    engine.handleTranscript(`hi ${spaced} how was work`, 0, undefined, true);
    expect(engine.nextGeneration(0)?.addressed).toBe(target);
  });

  it("names nobody when the streamer named nobody", () => {
    const engine = engineAt(0.2);
    engine.handleTranscript("right lets get into it", 0, undefined, true);
    expect(engine.nextGeneration(0)?.addressed).toBeUndefined();
  });

  it("remembers what a regular has talked about, and tells the model next time", () => {
    const engine = engineAt(0.2);
    engine.handleTranscript("so the roof is leaking again", 0, undefined, true);
    const roster = engine.exportRoster();
    const chosen = roster[0].name;

    say(engine, [{ text: "the roof has been cursed all stream", from: chosen }]);

    const remembered = engine.exportRoster().find((viewer) => viewer.name === chosen)!;
    expect(remembered.memory.lines).toContain("the roof has been cursed all stream");
    expect(remembered.memory.topics.length).toBeGreaterThan(0);

    engine.handleTranscript("anyway", 200_000, undefined, true);
    const entry = engine.nextGeneration(200_000)?.roster?.find((r) => r.name === chosen);
    expect(entry?.notes ?? "").toContain("cursed all stream");
  });

  it("brings the same people back next session, with what they remember", () => {
    const engine = engineAt(0.2);
    engine.handleTranscript("hey", 0, undefined, true);
    const chosen = engine.exportRoster()[0].name;
    say(engine, [{ text: "that texture pack carries honestly", from: chosen }]);
    const saved = engine.exportRoster();

    const tomorrow = new SimulationEngine({
      seed: 99,
      now: 0,
      emotes: FIXTURE_EMOTES,
      settings: { messagesPerSecond: 0.2 },
      roster: saved,
    });
    tomorrow.beginSession(0);

    const names = tomorrow.exportRoster().map((viewer) => viewer.name);
    expect(names).toContain(chosen);
    const back = tomorrow.exportRoster().find((viewer) => viewer.name === chosen)!;
    expect(back.memory.lines).toContain("that texture pack carries honestly");
    // A new session, so nothing about what was said *this* session carries.
    expect(back.seenAt).toBe(0);
  });

  it("keeps the room moving when the model gives one person every line", () => {
    // Four lines for one viewer against a cap of three in ten seconds: the
    // rest of the batch must not wait behind them.
    const engine = engineAt(0.5);
    engine.handleTranscript("okay so what do we reckon", 0, undefined, true);
    const roster = engine.exportRoster();
    const hog = roster[0].name;
    const other = roster[1].name;

    const messages = say(engine, [
      { text: "first thought about that", from: hog },
      { text: "second thought about that", from: hog },
      { text: "third thought about that", from: hog },
      { text: "fourth thought about that", from: hog },
      { text: "honestly i disagree with all of that", from: other },
    ]);

    // Every line is said, and the other viewer is not stuck behind the hog.
    expect(messages).toHaveLength(5);
    expect(messages.filter((message) => message.username === hog)).toHaveLength(4);
    const otherAt = messages.findIndex((message) => message.username === other);
    expect(otherAt).toBeGreaterThanOrEqual(0);
    expect(otherAt).toBeLessThan(3);
    let run = 0;
    let previous = "";
    for (const message of messages) {
      run = message.username === previous ? run + 1 : 1;
      previous = message.username;
      expect(run).toBeLessThanOrEqual(3);
    }
  });
});
