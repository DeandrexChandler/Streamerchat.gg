import { beforeEach, describe, expect, it } from "vitest";

/**
 * Minimal localStorage stand-in, same trade as the emote store's tests: the
 * store touches three methods and the suite runs on `environment: node`.
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

import { localRosterStore, type SavedViewer } from "../roster-store";
import { makeRegular } from "../make-regular";

function viewer(patch: Partial<SavedViewer> = {}): SavedViewer {
  return {
    id: "v1",
    name: "hazelirl",
    nameWords: ["hazel", "irl"],
    color: "#FF7F50",
    personality: "chatty",
    activity: 0.6,
    verbosity: 0.4,
    emoteAffinity: 0.3,
    voice: { words: 6, caps: 0, punctuation: 0.2, questions: 0.2, stretch: 0, interests: ["their cat", "the gym"] },
    memory: { topics: [], lines: [], addressed: [] },
    seenAt: 0,
    ...patch,
  };
}

describe("the roster store", () => {
  beforeEach(() => storage.clear());

  it("keeps what the streamer edited when a session writes its roster back", () => {
    /**
     * A running session saves every twenty seconds from its own copy of the
     * room. Without the merge, editing someone while a session is open is
     * undone on the next write — which reads as the edit never having
     * worked at all.
     */
    localRosterStore.replace([
      viewer({ name: "hazel_edited", note: "streams at 3am", edited: true }),
    ]);

    localRosterStore.save([
      viewer({
        name: "hazelirl",
        memory: { topics: ["roof"], lines: ["does it leak"], addressed: [] },
        seenAt: 1_234,
      }),
    ]);

    const [saved] = localRosterStore.load();
    expect(saved.name).toBe("hazel_edited");
    expect(saved.note).toBe("streams at 3am");
    // Memory is the half the session owns, and it comes through.
    expect(saved.memory.topics).toEqual(["roof"]);
    expect(saved.seenAt).toBe(1_234);
  });

  it("never undoes an edit made after the session loaded the room", () => {
    // The session outlives a trip to settings. Its copy of the room was
    // loaded before the streamer added someone there; writing it back would
    // delete them.
    localRosterStore.replace([viewer()]);
    const basedOn = localRosterStore.revision();

    localRosterStore.replace([viewer(), viewer({ id: "v2", name: "newfriend", edited: true })]);
    localRosterStore.save([viewer({ seenAt: 9_999 })], basedOn);
    expect(localRosterStore.load().map((v) => v.name)).toEqual(["hazelirl", "newfriend"]);

    localRosterStore.clear();
    localRosterStore.save([viewer()], basedOn);
    expect(localRosterStore.load()).toEqual([]);

    // A session that loaded the current room writes as before.
    localRosterStore.save([viewer({ seenAt: 9_999 })], localRosterStore.revision());
    expect(localRosterStore.load()[0].seenAt).toBe(9_999);
  });

  it("lets a session update anyone the streamer has not touched", () => {
    localRosterStore.replace([viewer({ name: "original" })]);
    localRosterStore.save([viewer({ name: "renamed by the engine" })]);
    expect(localRosterStore.load()[0].name).toBe("renamed by the engine");
  });

  it("drops a saved shape it does not recognise rather than half-reading it", () => {
    storage.setItem("streamerchat-gg:roster:v1", JSON.stringify([{ id: "x" }]));
    expect(localRosterStore.load()).toEqual([]);
  });

  it("builds an addable regular that survives a round trip", () => {
    const made = makeRegular([], 42);
    localRosterStore.replace([made]);
    const [back] = localRosterStore.load();
    expect(back.name).toBe(made.name);
    // Anyone the streamer deliberately created is theirs from birth.
    expect(back.pinned).toBe(true);
    expect(back.voice?.words).toBeGreaterThan(0);
  });

  it("gives a new regular a name nobody in the room already has", () => {
    const first = makeRegular([], 7);
    const second = makeRegular([first], 7);
    expect(second.name).not.toBe(first.name);
  });

  it("protects a roster saved before pinning and editing were separate", () => {
    // Older saves only ever set `pinned`, which then meant "edited".
    localRosterStore.replace([viewer({ name: "from_an_old_build", pinned: true })]);
    localRosterStore.save([viewer({ name: "engine_copy" })]);
    expect(localRosterStore.load()[0].name).toBe("from_an_old_build");
  });

  it("still takes memory from the session for someone who is only pinned", () => {
    // Pinning says "keep them", not "freeze them". Their identity is held
    // (pinning is itself a change a session must not undo), but what they
    // have been talking about is the session's to write.
    localRosterStore.replace([viewer({ name: "kept", pinned: true, edited: false })]);
    localRosterStore.save([viewer({ name: "kept", pinned: true, memory: { topics: ["roof"], lines: [], addressed: [] } })]);
    expect(localRosterStore.load()[0].memory.topics).toEqual(["roof"]);
  });

  it("marks a regular the streamer added as theirs, and keeps them", () => {
    const made = makeRegular([], 3);
    expect(made.mine).toBe(true);
    expect(made.pinned).toBe(true);
  });
});
