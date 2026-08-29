import { describe, expect, it } from "vitest";
import { mergeEmotes } from "../emote-store";
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
