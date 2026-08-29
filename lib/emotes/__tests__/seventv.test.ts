import { describe, expect, it } from "vitest";
import { MOOD_FLOOR, selectEmotes, type EmoteCandidate } from "../seventv";
import type { Emote } from "../../engine/types";

function make(name: string, mood: Emote["mood"], animated: boolean): EmoteCandidate {
  return {
    emote: { id: name, name, mood, url: `https://cdn.test/${name}.webp` },
    animated,
  };
}

describe("selectEmotes", () => {
  it("keeps every animated emote", () => {
    const input = [make("a", "funny", true), make("b", "chill", true)];
    expect(selectEmotes(input).map((e) => e.name)).toEqual(["a", "b"]);
  });

  it("admits stills for a mood below the floor", () => {
    const input = [make("anim", "funny", true), make("KEKW", "funny", false)];
    expect(selectEmotes(input).map((e) => e.name)).toContain("KEKW");
  });

  it("refuses stills once a mood has reached the floor", () => {
    const input = [
      ...Array.from({ length: MOOD_FLOOR }, (_, i) => make(`anim${i}`, "funny", true)),
      make("KEKW", "funny", false),
    ];
    expect(selectEmotes(input).map((e) => e.name)).not.toContain("KEKW");
  });

  it("never tops up unknown", () => {
    const input = [make("mystery", "unknown", false)];
    expect(selectEmotes(input)).toHaveLength(0);
  });

  it("admits stills in input order, so popularity wins", () => {
    const input = [
      make("popular", "sad", false),
      ...Array.from({ length: MOOD_FLOOR - 1 }, (_, i) => make(`x${i}`, "sad", false)),
    ];
    const names = selectEmotes(input).map((e) => e.name);
    expect(names[0]).toBe("popular");
    expect(names).toHaveLength(MOOD_FLOOR);
  });

  it("keeps animated emotes even when their mood is over the floor", () => {
    const input = Array.from({ length: MOOD_FLOOR + 5 }, (_, i) =>
      make(`anim${i}`, "hype", true),
    );
    expect(selectEmotes(input)).toHaveLength(MOOD_FLOOR + 5);
  });

  it("keeps animated unknown emotes, it just never tops them up", () => {
    const input = [make("anim", "unknown", true), make("still", "unknown", false)];
    expect(selectEmotes(input).map((e) => e.name)).toEqual(["anim"]);
  });
});
