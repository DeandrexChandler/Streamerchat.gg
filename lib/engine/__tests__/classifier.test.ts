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

/**
 * The vocabulary was entirely formal English, so most of how people actually
 * talk scored zero and fell through to `mundane` with a 0.15 confidence. That
 * was the upstream half of chat ignoring almost everything: the gate never got
 * a chance, because the intent was already wrong.
 */
describe("understands how people actually talk", () => {
  it.each([
    ["this is kinda sick actually", "excitement"],
    ["yo that was clutch", "excitement"],
    ["that goes hard", "excitement"],
    ["okay that's actually fire", "excitement"],
    ["nah that's crazy", "excitement"],
    ["bro we are so cooked", "struggle"],
    ["man this is taking forever", "struggle"],
    ["I'm washed at this game", "struggle"],
    ["that was rough ngl", "struggle"],
    ["wait huh", "confusion"],
    ["yeah I dunno man", "confusion"],
    ["ayo what", "confusion"],
  ])("classifies %j as %s", (text, intent) => {
    expect(classify(text, {}).intent).toBe(intent);
  });

  it.each([
    ["that was so clean", "positive"],
    ["absolute banger", "positive"],
    ["this is mid", "negative"],
    ["we got clapped", "negative"],
  ])("reads %j as %s", (text, sentiment) => {
    expect(classify(text, {}).sentiment).toBe(sentiment);
  });

  it("is more confident about slang than it was about nothing", () => {
    // A zero-signal utterance sits at 0.15. Recognising slang has to beat it,
    // or the attention gate treats a clear reaction as background noise.
    expect(classify("that was clutch", {}).confidence).toBeGreaterThan(0.3);
  });

  it("does not mistake plain difficulty for praise", () => {
    // "hard" alone is struggle; only "goes hard" is a compliment.
    expect(classify("this part is really hard", {}).intent).not.toBe("excitement");
  });
});

/**
 * Directives and direct questions were the biggest hole in the classifier.
 * "spam W", "chat can you hear me" and "everyone say pog" all scored zero,
 * landed in `mundane`, and produced byte-identical filler — chat could not
 * tell the difference between being given an instruction and background talk.
 */
describe("directives to chat", () => {
  it.each([
    ["spam W", "W"],
    ["spam w in chat", "w"],
    ["everyone say pog", "pog"],
    ["chat say hello", "hello"],
    ["type KEKW", "KEKW"],
    ["post F in the chat", "F"],
    ["let me hear it chat", undefined],
  ])("reads %j as a directive", (text, target) => {
    const c = classify(text, {});
    expect(c.intent).toBe("directive");
    if (target !== undefined) expect(c.directiveTarget).toBe(target);
  });

  it("is confident about an explicit instruction", () => {
    expect(classify("spam W", {}).confidence).toBeGreaterThan(0.6);
  });

  it("does not mistake ordinary talk for an instruction", () => {
    expect(classify("there was so much spam in my inbox", {}).intent).not.toBe(
      "directive",
    );
  });
});

describe("questions chat can actually answer", () => {
  it.each([
    ["chat can you hear me", "audio"],
    ["can you guys hear me", "audio"],
    ["am I loud enough", "audio"],
    ["is my mic working", "audio"],
    ["how do I sound", "audio"],
    ["can you see my screen", "visual"],
    ["does this look okay", "visual"],
    ["is anyone here", "presence"],
    ["chat you still there", "presence"],
  ])("routes %j to the %s answers", (text, subject) => {
    const c = classify(text, {});
    expect(c.intent).toBe("question_to_chat");
    expect(c.subject).toBe(subject);
  });

  it("leaves an open question without a subject", () => {
    const c = classify("chat what do you think, roof or walls", {});
    expect(c.intent).toBe("question_to_chat");
    expect(c.subject).toBeUndefined();
  });
});
