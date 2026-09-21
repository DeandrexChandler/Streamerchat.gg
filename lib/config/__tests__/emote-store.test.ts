import { describe, expect, it } from "vitest";
import { mergeEmotes } from "../emote-store";

/**
 * Minimal localStorage stand-in.
 *
 * A stub rather than jsdom: the store touches exactly three methods, the
 * suite runs on `environment: node`, and pulling in a DOM implementation to
 * test a key-value read would be a dependency for nothing.
 */
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
import { FIXTURE_EMOTES } from "../../data/__fixtures__/emotes";
import type { EmotePack } from "../../emotes/seventv";

function pack(id: string, emotes: unknown[]): EmotePack {
  return { id, name: id, source: id, importedAt: 0, emotes: emotes as never };
}

describe("mergeEmotes", () => {
  it("flattens packs into one list", () => {
    const merged = mergeEmotes([pack("a", [...FIXTURE_EMOTES])]);
    expect(merged).toHaveLength(FIXTURE_EMOTES.length);
  });

  it("lets a later pack win a name collision", () => {
    const mine = { ...FIXTURE_EMOTES[0], id: "mine", url: "https://example.test/x.webp" };
    const merged = mergeEmotes([pack("a", [FIXTURE_EMOTES[0]]), pack("b", [mine])]);
    expect(merged.find((e) => e.name === "KEKW")!.id).toBe("mine");
  });
});
