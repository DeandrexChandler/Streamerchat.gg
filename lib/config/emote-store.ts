import type { Emote } from "../engine/types";
import type { EmotePack } from "../emotes/seventv";

/**
 * Imported emote packs, persisted per browser.
 *
 * Kept out of SimulationSettings on purpose: a channel pack can be several
 * hundred emotes, and merging that into the settings blob would mean
 * revalidating the whole thing through zod on every read and rewriting it on
 * every slider nudge.
 */

const STORAGE_KEY = "streamerchat-gg:emote-packs:v1";

/** Rough ceiling so one enormous pack can't exhaust the storage quota. */
const MAX_EMOTES_PER_PACK = 1200;

export interface EmotePackStore {
  load(): EmotePack[];
  save(packs: EmotePack[]): void;
}

function isEmote(value: unknown): value is Emote {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Partial<Emote>;
  return (
    typeof e.id === "string" &&
    typeof e.name === "string" &&
    // url is required now. A blob written by an older build can still contain
    // url-less emotes; rejecting them here keeps the failure at the boundary
    // rather than at render time, on stream.
    typeof e.url === "string" &&
    e.url.length > 0 &&
    !!e.mood
  );
}

export const localEmotePackStore: EmotePackStore = {
  load() {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];

      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      // Hand-validated rather than schema-parsed: this runs on every session
      // start against data that may have been written by an older build.
      return parsed.flatMap((pack): EmotePack[] => {
        if (typeof pack !== "object" || pack === null) return [];
        const p = pack as Partial<EmotePack>;
        if (typeof p.id !== "string" || !Array.isArray(p.emotes)) return [];
        return [
          {
            id: p.id,
            name: typeof p.name === "string" ? p.name : p.id,
            source: typeof p.source === "string" ? p.source : "unknown",
            importedAt: typeof p.importedAt === "number" ? p.importedAt : 0,
            emotes: p.emotes.filter(isEmote).slice(0, MAX_EMOTES_PER_PACK),
          },
        ];
      });
    } catch {
      return [];
    }
  },

  save(packs) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(packs));
    } catch {
      // Quota exceeded or private mode — packs just won't persist.
    }
  },
};

/**
 * Flattens packs into one lookup list.
 *
 * Later packs win on name collisions, so a channel's own version of a shared
 * emote beats an earlier import — which is what a viewer of that channel
 * would actually see.
 */
export function mergeEmotes(packs: readonly EmotePack[]): Emote[] {
  const byName = new Map<string, Emote>();
  for (const pack of packs) {
    for (const emote of pack.emotes) byName.set(emote.name.toLowerCase(), emote);
  }
  return [...byName.values()];
}
