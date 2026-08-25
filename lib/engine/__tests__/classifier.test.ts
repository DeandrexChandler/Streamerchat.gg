import { describe, expect, it } from "vitest";
import { classify } from "../classifier";

describe("classify", () => {
  it("returns an empty classification for blank input", () => {
    const result = classify("   ");
    expect(result.intent).toBe("mundane");
    expect(result.confidence).toBe(0);
    expect(result.energy).toBe(0);
  });

  it.each([
    ["hey everyone, welcome in", "greeting"],
    ["alright, thanks for watching, good night", "farewell"],
    ["chat what do you think I should do", "question_to_chat"],
    ["let's go that was insane", "excitement"],
    ["come on, this is so annoying, not again", "struggle"],
    ["finally, we did it, got it", "achievement"],
    ["I have no idea how this works, I'm lost", "confusion"],
    ["look at this, check it out", "showing"],
    ["so yesterday this funny thing happened", "story"],
  ])("classifies %j as %s", (text, expected) => {
    expect(classify(text).intent).toBe(expected);
  });

  it("treats a trailing question mark as addressing chat", () => {
    expect(classify("is that a good colour?").intent).toBe("question_to_chat");
  });

  it("does not let a question mark override a stronger signal", () => {
    // "look at this" is a clearer signal than the bare punctuation.
    expect(classify("look at this, isn't it nice?").intent).toBe("showing");
  });

  it("does not match signal words inside longer words", () => {
    // "hi" must not fire inside "this"/"thing".
    expect(classify("this thing is a thing").intent).not.toBe("greeting");
  });

  it("infers sentiment from emotional vocabulary", () => {
    expect(classify("this is great, I love it").sentiment).toBe("positive");
    expect(classify("this is awful and broken").sentiment).toBe("negative");
  });

  it("scores shouting as higher energy than muttering", () => {
    const loud = classify("LET'S GO THAT WAS AMAZING!!!");
    const quiet = classify("let's go that was amazing");
    expect(loud.energy).toBeGreaterThan(quiet.energy);
  });

  it("folds mic loudness into the energy score", () => {
    const text = "okay we're doing this";
    expect(classify(text, { audioEnergy: 0.95 }).energy).toBeGreaterThan(
      classify(text, { audioEnergy: 0.05 }).energy,
    );
  });

  it("clamps energy to 0..1", () => {
    const result = classify("AMAZING GREAT PERFECT LOVE!!!", { audioEnergy: 1 });
    expect(result.energy).toBeGreaterThanOrEqual(0);
    expect(result.energy).toBeLessThanOrEqual(1);
  });

  it("extracts keywords and drops stopwords", () => {
    const { keywords } = classify(
      "I think the lantern placement really matters here",
    );
    expect(keywords).toContain("lantern");
    expect(keywords).not.toContain("think");
    expect(keywords).not.toContain("the");
  });

  it("ranks repeated words above passing mentions", () => {
    const { keywords } = classify(
      "the roof, honestly the roof, I keep thinking about the roof and windows",
    );
    expect(keywords[0]).toBe("roof");
  });

  it("inherits a sustained intent across an ambiguous utterance", () => {
    const result = classify("and then he walked right in", {
      previousIntent: "story",
      msSincePrevious: 4000,
    });
    expect(result.intent).toBe("story");
  });

  it("does NOT inherit punctual intents like greeting", () => {
    // Regression: chat used to say "good morning" in reply to unrelated
    // sentences because `greeting` leaked forward.
    const result = classify("okay so we're gonna do the base", {
      previousIntent: "greeting",
      msSincePrevious: 3000,
    });
    expect(result.intent).toBe("mundane");
  });

  it("stops inheriting once the streamer has moved on", () => {
    const result = classify("and then he walked right in", {
      previousIntent: "story",
      msSincePrevious: 90_000,
    });
    expect(result.intent).toBe("mundane");
  });

  it("reports low confidence when nothing matched", () => {
    expect(classify("okay so we're gonna do the base").confidence).toBeLessThan(
      0.3,
    );
  });

  it("reports high confidence on a clear signal", () => {
    expect(classify("chat what do you think").confidence).toBeGreaterThan(0.6);
  });
});
