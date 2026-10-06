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

import { applyEmoteTags, localEmoteTagStore } from "../emote-tags";
import { mergeEmotes } from "../emote-store";
import { tagsFor } from "../../emotes/semantic";
import type { EmotePack } from "../../emotes/seventv";
import type { Emote } from "../../engine/types";

const KEY = "streamerchat-gg:emote-tags:v1";

function pack(names: string[]): EmotePack {
  return {
    id: "p",
    name: "p",
    source: "p",
    importedAt: 0,
    emotes: names.map((name, i) => ({
      id: `${i}`,
      name,
      mood: "unknown" as const,
      url: `u/${name}`,
    })),
  };
}

describe("hand-assigned emote meanings", () => {
  beforeEach(() => storage.clear());

  it("persists what the streamer assigned", () => {
    localEmoteTagStore.save({ forsencd: ["greeting"] });
    expect(localEmoteTagStore.load()).toEqual({ forsencd: ["greeting"] });
  });

  it("survives re-importing the pack the emote came from", () => {
    // Packs are replaced wholesale on re-import — a channel updates its set
    // and the old array is thrown away — so tags live outside them.
    localEmoteTagStore.save({ forsencd: ["greeting"] });

    const merged = mergeEmotes([pack(["forsenCD", "KEKW"])], localEmoteTagStore.load());
    const tagged = merged.find((emote) => emote.name === "forsenCD");
    expect(tagged?.tags).toEqual(["greeting"]);
  });

  it("survives merging a second pack over the first", () => {
    localEmoteTagStore.save({ kekw: ["laugh", "general"] });
    const merged = mergeEmotes(
      [pack(["KEKW"]), pack(["KEKW", "Pog"])],
      localEmoteTagStore.load(),
    );
    expect(merged.find((emote) => emote.name === "KEKW")?.tags).toEqual(["laugh", "general"]);
  });

  it("translates tags written by an older build rather than dropping them", () => {
    // These were typed by hand once. "achievement" became "victory" and
    // "struggle" became "frustrated"; the two with no equivalent become
    // "general", which still means usable.
    storage.setItem(
      KEY,
      JSON.stringify({ a: ["achievement"], b: ["struggle"], c: ["story"], d: ["nonsense"] }),
    );
    const loaded = localEmoteTagStore.load();
    expect(loaded.a).toEqual(["victory"]);
    expect(loaded.b).toEqual(["frustrated"]);
    expect(loaded.c).toEqual(["general"]);
    expect(loaded.d).toBeUndefined();
  });

  it("returns an emote to automatic classification when its tags are cleared", () => {
    const emote: Emote = { id: "1", name: "KEKW", mood: "funny", url: "u", tags: ["greeting"] };
    // While tagged, the hand tag is the whole answer.
    expect(tagsFor(emote)).toEqual(["greeting"]);

    const [reset] = applyEmoteTags([{ ...emote, tags: undefined }], {});
    // Cleared, the name speaks for itself again.
    expect(tagsFor(reset as Emote)).toEqual(["laugh"]);
  });
});
