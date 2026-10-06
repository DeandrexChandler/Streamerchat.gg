import { EMOTE_TAGS, type EmoteTag } from "../engine/types";

/**
 * User-assigned emote tags, stored apart from the packs themselves.
 *
 * Separate on purpose. Packs are replaced wholesale when re-imported — a
 * channel updates its set and the old array is thrown away — so any edit
 * living inside a pack would vanish with it. Keyed by emote name rather than
 * id because 7TV ids change between a channel set and the global one while the
 * name a viewer types stays the same.
 */

const STORAGE_KEY = "streamerchat-gg:emote-tags:v1";

/** Lowercased emote name to the tags assigned to it. */
export type EmoteTagMap = Readonly<Record<string, readonly EmoteTag[]>>;

export interface EmoteTagStore {
  load(): EmoteTagMap;
  save(tags: EmoteTagMap): void;
}

const VALID = new Set<string>(EMOTE_TAGS);

/**
 * Tags an older build wrote, in the vocabulary it had.
 *
 * Thrown-away tags are tags the streamer typed by hand, so these are
 * translated rather than dropped. The two that have no equivalent — a
 * "showing" or "story" emote — become `general`, which still means "usable",
 * just not "usable here specifically".
 */
const RENAMED: Readonly<Record<string, EmoteTag>> = {
  achievement: "victory",
  struggle: "frustrated",
  confusion: "confused",
  showing: "general",
  story: "general",
};

/** Hand-validated: this reads data an older build may have written. */
function sanitise(raw: unknown): EmoteTagMap {
  if (typeof raw !== "object" || raw === null) return {};
  const out: Record<string, EmoteTag[]> = {};

  for (const [name, tags] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(tags)) continue;
    const kept = tags
      .map((tag) => (typeof tag === "string" ? (RENAMED[tag] ?? tag) : tag))
      .filter((tag): tag is EmoteTag => typeof tag === "string" && VALID.has(tag));
    if (kept.length > 0) out[name.toLowerCase()] = [...new Set(kept)];
  }
  return out;
}

export const localEmoteTagStore: EmoteTagStore = {
  load() {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? sanitise(JSON.parse(raw)) : {};
    } catch {
      return {};
    }
  },

  save(tags) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
    } catch {
      // Quota or private mode. Non-fatal; the edit just will not persist.
    }
  },
};

/**
 * Folds saved tags onto a merged emote list.
 *
 * Applied after packs are merged, so a re-import cannot lose an assignment:
 * the pack supplies the emote, this supplies what the user said about it.
 */
export function applyEmoteTags<T extends { name: string }>(
  emotes: readonly T[],
  tags: EmoteTagMap,
): Array<T & { tags?: readonly EmoteTag[] }> {
  if (Object.keys(tags).length === 0) return [...emotes];
  return emotes.map((emote) => {
    const assigned = tags[emote.name.toLowerCase()];
    return assigned ? { ...emote, tags: assigned } : emote;
  });
}
