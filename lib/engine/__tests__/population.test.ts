import { describe, expect, it } from "vitest";
import { Population } from "../population";
import { createRng } from "../rng";

describe("Population", () => {
  it("creates the requested number of viewers", () => {
    expect(new Population(createRng(1), 40).size).toBe(40);
  });

  it("gives every viewer a unique name", () => {
    const population = new Population(createRng(2), 200);
    const names = population.all().map((v) => v.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every viewer traits inside 0..1", () => {
    for (const viewer of new Population(createRng(3), 100).all()) {
      for (const trait of [viewer.activity, viewer.verbosity, viewer.emoteAffinity]) {
        expect(trait).toBeGreaterThanOrEqual(0);
        expect(trait).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is lurker-heavy — most viewers rarely speak", () => {
    // Realism check: a flat activity distribution makes chat read as a bot
    // farm, because everyone contributes equally.
    const viewers = new Population(createRng(4), 300).all();
    const quiet = viewers.filter((v) => v.activity < 0.3).length;
    expect(quiet / viewers.length).toBeGreaterThan(0.25);
  });

  it("is deterministic for a given seed", () => {
    const namesFor = (seed: number) =>
      new Population(createRng(seed), 20).all().map((v) => v.name);
    expect(namesFor(99)).toEqual(namesFor(99));
    expect(namesFor(99)).not.toEqual(namesFor(100));
  });

  it("picks a speaker from the population", () => {
    const population = new Population(createRng(5), 20);
    const speaker = population.pickSpeaker(0);
    expect(speaker).toBeDefined();
    expect(population.get(speaker!.id)).toBe(speaker);
  });

  it("never picks an excluded viewer", () => {
    const population = new Population(createRng(6), 10);
    const excluded = new Set(population.all().slice(0, 9).map((v) => v.id));
    for (let i = 0; i < 50; i++) {
      expect(excluded.has(population.pickSpeaker(0, excluded)!.id)).toBe(false);
    }
  });

  it("returns undefined when everyone is excluded", () => {
    const population = new Population(createRng(7), 5);
    const all = new Set(population.all().map((v) => v.id));
    expect(population.pickSpeaker(0, all)).toBeUndefined();
  });

  it("damps a viewer who just spoke", () => {
    // Without recency damping the two most active viewers dominate every
    // burst, which is very visible in the rendered chat.
    const population = new Population(createRng(8), 12);
    const target = population.all()[0];
    population.markSpoke(target.id, 10_000);

    let picks = 0;
    for (let i = 0; i < 400; i++) {
      if (population.pickSpeaker(10_050)!.id === target.id) picks++;
    }
    expect(picks / 400).toBeLessThan(0.12);
  });

  it("restores a viewer's chances after enough silence", () => {
    const population = new Population(createRng(9), 6);
    const [target, ...others] = population.all();

    // Everyone else must be "long silent", otherwise the damping factor is
    // uniform across the population and cancels out entirely — an earlier
    // version of this test compared two identical distributions and only
    // passed by luck.
    for (const other of others) population.markSpoke(other.id, -600_000);
    population.markSpoke(target.id, 0);

    let justSpoke = 0;
    let longSilent = 0;
    for (let i = 0; i < 600; i++) {
      if (population.pickSpeaker(200)!.id === target.id) justSpoke++;
    }
    population.markSpoke(target.id, -600_000);
    for (let i = 0; i < 600; i++) {
      if (population.pickSpeaker(200)!.id === target.id) longSilent++;
    }
    expect(longSilent).toBeGreaterThan(justSpoke);
  });

  it("drifts toward a target audience size", () => {
    const population = new Population(createRng(10), 10);
    for (let i = 0; i < 20; i++) population.driftToward(20);
    expect(population.size).toBe(20);
    for (let i = 0; i < 30; i++) population.driftToward(5);
    expect(population.size).toBe(5);
  });

  it("frees a removed viewer's name for reuse", () => {
    const population = new Population(createRng(11), 3);
    const removed = population.remove();
    expect(removed).toBeDefined();
    expect(population.size).toBe(2);
    expect(population.get(removed!.id)).toBeUndefined();
  });

  it("handles remove() on an empty population", () => {
    const population = new Population(createRng(12), 1);
    population.remove();
    expect(population.remove()).toBeUndefined();
    expect(population.pickSpeaker(0)).toBeUndefined();
  });

  it("exposes tag bias for a viewer's archetype", () => {
    const population = new Population(createRng(13), 5);
    expect(population.tagBias(population.all()[0])).toBeTypeOf("object");
  });
});

describe("Population username vocabulary", () => {
  it("never gives two viewers the same name component", () => {
    // Regression: `bramble`, `littlebramble` and `wobbly_bramble` are distinct
    // strings but obviously generated when they share a chat. Substring
    // containment is the wrong check — "asha" and "sasha" are both legitimate
    // names — so this asserts on the vocabulary actually consumed.
    const population = new Population(createRng(31337), 40);
    const seen = new Set<string>();
    for (const viewer of population.all()) {
      for (const word of viewer.nameWords) {
        expect(seen.has(word)).toBe(false);
        seen.add(word);
      }
    }
  });

  it("still fills a large audience once vocabulary runs low", () => {
    // More viewers than distinct words: must not hang or produce duplicates.
    const population = new Population(createRng(4), 250);
    expect(population.size).toBe(250);
    const names = population.all().map((v) => v.name.toLowerCase());
    expect(new Set(names).size).toBe(250);
  });

  it("returns a departed viewer's vocabulary to the pool", () => {
    const population = new Population(createRng(15), 30);
    const victim = population.remove()!;
    const wordy = victim.nameWords.filter(Boolean);
    if (wordy.length === 0) return; // keyboard-mash name, consumed nothing

    // Refill until someone reuses a freed word; it must become available again.
    for (let i = 0; i < 200; i++) population.add();
    const inUse = new Set(population.all().flatMap((v) => v.nameWords));
    expect(inUse.size).toBeGreaterThan(0);
  });
});

describe("speakers do not answer themselves", () => {
  /**
   * Reported pattern, where one viewer held both sides of a greeting:
   *
   *   quinn: sup
   *   quinn: heyyyy
   *
   * Damping a recent speaker to 8% weight was not enough to stop it.
   */
  it("does not pick the same viewer twice in quick succession", () => {
    const population = new Population(createRng(4), 40);
    let now = 0;
    let immediateRepeats = 0;
    let previous: string | undefined;

    for (let i = 0; i < 200; i += 1) {
      const speaker = population.pickSpeaker(now);
      if (!speaker) continue;
      if (speaker.id === previous) immediateRepeats += 1;
      population.markSpoke(speaker.id, now);
      previous = speaker.id;
      now += 800; // a busy chat, well inside the cooldown
    }

    expect(immediateRepeats).toBe(0);
  });

  it("still finds someone when the whole room is tiny", () => {
    // The lowest speed tier is a three-viewer stream; a cooldown that starved
    // chat there would be worse than the repetition it prevents.
    const population = new Population(createRng(9), 3);
    let now = 0;
    for (let i = 0; i < 30; i += 1) {
      const speaker = population.pickSpeaker(now);
      expect(speaker).toBeDefined();
      population.markSpoke(speaker!.id, now);
      now += 500;
    }
  });

  it("lets a viewer speak again once the cooldown has passed", () => {
    const population = new Population(createRng(2), 4);
    const first = population.pickSpeaker(0)!;
    population.markSpoke(first.id, 0);

    const seen = new Set<string>();
    for (let t = 20_000; t < 40_000; t += 1_000) {
      const speaker = population.pickSpeaker(t);
      if (speaker) seen.add(speaker.id);
    }
    expect(seen.has(first.id)).toBe(true);
  });
});
