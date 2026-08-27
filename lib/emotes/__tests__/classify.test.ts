import { describe, expect, it } from "vitest";
import { classifyEmote } from "../classify";

describe("classifyEmote", () => {
  it.each([
    ["KEKW", "funny"], ["OMEGALUL", "funny"], ["ICANT", "funny"],
    ["Sadge", "sad"], ["PepeHands", "sad"], ["monkaS", "sad"],
    ["POGGERS", "hype"], ["GIGACHAD", "hype"], ["Clap", "hype"],
    ["peepoHappy", "love"], ["peepoLove", "love"], ["PETPET", "love"],
    ["peepoThink", "confused"], ["5Head", "confused"], ["Susge", "confused"],
    ["catJAM", "chill"], ["peepoSleep", "chill"], ["bedge", "chill"],
  ])("classifies %s as %s", (name, mood) => {
    expect(classifyEmote(name)).toBe(mood);
  });

  it("returns unknown for channel-specific names", () => {
    // A large channel pack is mostly names like these. Filing them under a
    // real mood would lock most of the pack to one kind of moment.
    for (const name of ["xqcWOT", "GAMBA", "zyzzBass", "WEEBSDETECTED"]) {
      expect(classifyEmote(name)).toBe("unknown");
    }
  });

  it("is case insensitive", () => {
    expect(classifyEmote("kekw")).toBe(classifyEmote("KEKW"));
  });

  it("prefers distress over laughter for monka emotes", () => {
    // monkaS is anxiety, and the rule order has to keep it out of "funny".
    expect(classifyEmote("monkaW")).toBe("sad");
  });

  it("never throws on odd input", () => {
    for (const name of ["", "   ", "123", "!!!", "a".repeat(200)]) {
      expect(() => classifyEmote(name)).not.toThrow();
    }
  });
});
