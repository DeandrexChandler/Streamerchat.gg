import { beforeEach, describe, expect, it } from "vitest";

/** Minimal localStorage stand-in; the suite runs on `environment: node`. */
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "window", {
  value: { localStorage: storage },
  writable: true,
  configurable: true,
});

import { customTagName, localCustomTagStore } from "../custom-tags";
import { localEmoteTagStore } from "../emote-tags";
import { localEmoteRuleStore } from "../emote-rules";
import { pickSemanticEmote } from "../../emotes/semantic";
import { createRng } from "../../engine/rng";
import { SimulationEngine } from "../../engine/engine";
import { buildPrompt } from "../../ai/prompt";
import { ReactionSchema } from "../../ai/reaction";
import type { Emote } from "../../engine/types";

const emote = (name: string, tags?: string[]): Emote => ({ id: name, name, mood: "unknown", url: "u", ...(tags ? { tags } : {}) });

describe("custom emote meanings", () => {
  beforeEach(() => storage.clear());

  it("turns what a person typed into a tag name, or says why not", () => {
    expect(customTagName("Car Noise", [])).toBe("car-noise");
    expect(customTagName("laugh", [])).toEqual({ error: expect.stringContaining("built-in") });
    expect(customTagName("bald", [{ name: "bald", description: "x" }])).toEqual({ error: expect.stringContaining("already") });
    expect(customTagName("!", [])).toEqual({ error: expect.any(String) });
  });

  it("keeps a custom tag on an emote and in a never-rule across a reload, while it exists", () => {
    localCustomTagStore.save([{ name: "bald", description: "his head" }]);
    localEmoteTagStore.save({ shinehead: ["bald", "laugh"] });
    localEmoteRuleStore.save({ kekw: { notFor: ["bald"] } });
    expect(localEmoteTagStore.load().shinehead).toEqual(["bald", "laugh"]);
    expect(localEmoteRuleStore.load().kekw?.notFor).toEqual(["bald"]);

    // Gone from the list, it is gone from the emotes.
    localCustomTagStore.save([]);
    expect(localEmoteTagStore.load().shinehead).toEqual(["laugh"]);
    expect(localEmoteRuleStore.load().kekw).toBeUndefined();
  });

  it("drops a stored tag that collides with a built-in or is malformed", () => {
    storage.setItem(
      "streamerchat-gg:custom-tags:v1",
      JSON.stringify([{ name: "laugh", description: "x" }, { name: "Bad Name", description: "x" }, { name: "bald", description: "his head" }]),
    );
    expect(localCustomTagStore.load()).toEqual([{ name: "bald", description: "his head" }]);
  });

  it("lets the model ask for one, and reaches only emotes tagged with it", () => {
    const emotes = [emote("ShineHead", ["bald"]), emote("KEKW"), emote("peepoHappy")];
    for (const seed of [1, 2, 3, 4, 5]) {
      const picked = pickSemanticEmote({ emotes, intent: "mundane", emoteIntent: "bald", rng: createRng(seed) });
      expect(picked?.name).toBe("ShineHead");
    }
  });

  it("keeps the model's word for it rather than dropping an unknown meaning", () => {
    expect(ReactionSchema.parse({ text: "the dome", emoteIntent: "Bald" }).emoteIntent).toBe("bald");
  });

  it("tells the model only the meanings some emote actually carries, with what each is for", () => {
    const engine = new SimulationEngine({ seed: 1, now: 0, emotes: [emote("ShineHead", ["bald"]), emote("KEKW")] });
    engine.setCustomTags([
      { name: "bald", description: "anything about the streamer's bald head" },
      { name: "car-noise", description: "the noise his car makes" },
    ]);
    engine.beginSession(0);
    const request = engine.nextGeneration(0)!;
    expect(request.customTags).toEqual([{ name: "bald", description: "anything about the streamer's bald head" }]);

    const prompt = buildPrompt(request);
    expect(prompt).toContain("bald = anything about the streamer's bald head");
    expect(prompt).not.toContain("car-noise");
  });
});
