import { beforeEach, describe, expect, it } from "vitest";

/** Same stand-in as emote-store.test.ts: the suite runs on `environment: node`. */
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

import {
  applyEmoteTags,
  localEmoteTagStore,
} from "../emote-tags";
import { mergeEmotes } from "../emote-store";
import type { Emote } from "../../engine/types";
import type { EmotePack } from "../../emotes/seventv";

function emote(name: string, mood: Emote["mood"] = "unknown"): Emote {
  return { id: `id-${name}`, name, mood, url: `https://cdn/${name}.webp` };
}

function pack(id: string, emotes: Emote[]): EmotePack {
  return { id, name: id, source: "7tv", emotes, importedAt: 0 };
}

beforeEach(() => storage.clear());

describe("localEmoteTagStore", () => {
  it("round-trips assignments", () => {
    localEmoteTagStore.save({ peepohi: ["greeting"] });
    expect(localEmoteTagStore.load()).toEqual({ peepohi: ["greeting"] });
  });

  it("returns nothing when the browser has never stored anything", () => {
    expect(localEmoteTagStore.load()).toEqual({});
  });

  it("survives a corrupt blob rather than throwing", () => {
    window.localStorage.setItem("streamerchat-gg:emote-tags:v1", "{not json");
    expect(localEmoteTagStore.load()).toEqual({});
  });

  it("drops tags an older or newer build wrote that this one does not know", () => {
    localEmoteTagStore.save({ x: ["greeting", "banana" as never] });
    expect(localEmoteTagStore.load()).toEqual({ x: ["greeting"] });
  });

  it("drops an entry whose tags are all unrecognised", () => {
    window.localStorage.setItem(
      "streamerchat-gg:emote-tags:v1",
      JSON.stringify({ x: ["nonsense"], y: "greeting" }),
    );
    expect(localEmoteTagStore.load()).toEqual({});
  });

  it("keys on the lowercased name, so casing in the pack cannot miss", () => {
    localEmoteTagStore.save({ PeepoHi: ["greeting"] } as never);
    expect(localEmoteTagStore.load()).toEqual({ peepohi: ["greeting"] });
  });
});

describe("applyEmoteTags", () => {
  it("attaches tags to the matching emote and leaves the rest alone", () => {
    const [tagged, untagged] = applyEmoteTags(
      [emote("peepoHi"), emote("KEKW")],
      { peepohi: ["greeting"] },
    );
    expect(tagged.tags).toEqual(["greeting"]);
    expect(untagged.tags).toBeUndefined();
  });

  it("is a no-op when nothing has been tagged", () => {
    const emotes = [emote("KEKW")];
    expect(applyEmoteTags(emotes, {})).toEqual(emotes);
  });
});

describe("mergeEmotes", () => {
  it("keeps manual tags when a pack is re-imported", () => {
    localEmoteTagStore.save({ peepohi: ["greeting"] });

    const first = mergeEmotes([pack("chan", [emote("peepoHi")])]);
    expect(first[0].tags).toEqual(["greeting"]);

    // The channel updates its set: same emote, new id, new pack object.
    const reimported = mergeEmotes([
      pack("chan", [{ ...emote("peepoHi"), id: "new-id" }]),
    ]);
    expect(reimported[0].tags).toEqual(["greeting"]);
  });

  it("carries tags across a name collision between packs", () => {
    localEmoteTagStore.save({ peepohi: ["greeting"] });
    const merged = mergeEmotes([
      pack("global", [emote("peepoHi")]),
      pack("channel", [{ ...emote("peepoHi"), url: "https://cdn/mine.webp" }]),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].url).toBe("https://cdn/mine.webp");
    expect(merged[0].tags).toEqual(["greeting"]);
  });

  it("works on packs stored before tagging existed", () => {
    const merged = mergeEmotes([pack("old", [emote("KEKW", "funny")])]);
    expect(merged[0].tags).toBeUndefined();
    expect(merged[0].mood).toBe("funny");
  });
});
