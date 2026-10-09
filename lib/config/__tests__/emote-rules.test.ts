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

import { localEmoteRuleStore } from "../emote-rules";
import { mergeEmotes } from "../emote-store";
import type { EmotePack } from "../../emotes/seventv";

function pack(names: string[]): EmotePack {
  return {
    id: "p",
    name: "p",
    source: "p",
    importedAt: 0,
    emotes: names.map((name, i) => ({ id: `${i}`, name, mood: "unknown" as const, url: `u/${name}` })),
  };
}

describe("emote rules", () => {
  beforeEach(() => storage.clear());

  it("persists a block and a barred moment", () => {
    localEmoteRuleStore.save({ booba: { blocked: true }, kekw: { notFor: ["sad"] } });
    expect(localEmoteRuleStore.load()).toEqual({
      booba: { blocked: true },
      kekw: { notFor: ["sad"] },
    });
  });

  it("survives re-importing the pack and keeps hand tags alongside", () => {
    localEmoteRuleStore.save({ kekw: { notFor: ["sad"] } });
    const merged = mergeEmotes([pack(["KEKW", "Pog"])], { kekw: ["laugh"] }, localEmoteRuleStore.load());
    const kekw = merged.find((emote) => emote.name === "KEKW");
    expect(kekw?.notFor).toEqual(["sad"]);
    expect(kekw?.tags).toEqual(["laugh"]);
  });

  it("drops rules that say nothing, and meanings it does not know", () => {
    storage.setItem(
      "streamerchat-gg:emote-rules:v1",
      JSON.stringify({ a: {}, b: { blocked: false, notFor: [] }, c: { notFor: ["sad", "nonsense"] } }),
    );
    expect(localEmoteRuleStore.load()).toEqual({ c: { notFor: ["sad"] } });
  });
});
