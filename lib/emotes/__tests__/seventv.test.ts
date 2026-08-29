import { describe, expect, it } from "vitest";
import { MOOD_FLOOR, mapPopularItem, selectEmotes, type EmoteCandidate } from "../seventv";
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

describe("mapPopularItem", () => {
  const item = {
    id: "01F61B1440000991F7SWQNMVX7",
    defaultName: "KEKW",
    flags: { animated: false },
    images: [
      { url: "https://cdn.7tv.app/emote/x/1x.webp", mime: "image/webp", width: 32, height: 32, frameCount: 1 },
      { url: "https://cdn.7tv.app/emote/x/2x.webp", mime: "image/webp", width: 64, height: 64, frameCount: 1 },
    ],
  };

  it("maps a v4 search item to a candidate", () => {
    const c = mapPopularItem(item)!;
    expect(c.emote.name).toBe("KEKW");
    expect(c.emote.mood).toBe("funny");
    expect(c.animated).toBe(false);
  });

  it("prefers the 2x image", () => {
    expect(mapPopularItem(item)!.emote.url).toContain("2x.webp");
  });

  it("returns null when there is no usable image", () => {
    expect(mapPopularItem({ ...item, images: [] })).toBeNull();
  });

  it("reports animated when the flag is set", () => {
    const c = mapPopularItem({ ...item, flags: { animated: true } })!;
    expect(c.animated).toBe(true);
  });
});
