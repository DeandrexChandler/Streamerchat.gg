import { z } from "zod";
import { EMOTE_TAGS } from "../engine/types";

/**
 * Meanings the streamer writes for themselves.
 *
 * The built-in vocabulary covers what every chat feels. A channel also has
 * its own moments — the streamer's bald head, a running bit about a friend,
 * the noise the car makes — that no shared word can name. A custom tag is a
 * short name plus a sentence saying what it is for; the model is shown both
 * and can ask for it like any other meaning, and it only ever reaches the
 * emotes the streamer tagged with it.
 */

const STORAGE_KEY = "streamerchat-gg:custom-tags:v1";

/** Enough for a channel's in-jokes, small enough to ride in every prompt. */
export const MAX_CUSTOM_TAGS = 16;

/** Lowercase words joined by hyphens: `bald`, `car-noise`. */
export const CUSTOM_TAG_NAME = /^[a-z][a-z0-9-]{1,23}$/;

const BUILT_IN = new Set<string>(EMOTE_TAGS);

export const CustomTagSchema = z.object({
  name: z.string().regex(CUSTOM_TAG_NAME),
  description: z.string().trim().min(1).max(120),
});

export type CustomTag = z.infer<typeof CustomTagSchema>;

/** A name typed by a person, as the tag it would become, or why it cannot. */
export function customTagName(raw: string, existing: readonly CustomTag[]): string | { error: string } {
  const name = raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  if (!CUSTOM_TAG_NAME.test(name)) return { error: "Two to 24 letters, starting with a letter." };
  if (BUILT_IN.has(name)) return { error: `"${name}" is already a built-in meaning.` };
  if (existing.some((tag) => tag.name === name)) return { error: `You already have "${name}".` };
  return name;
}

/** Hand-validated: storage may hold anything an older build or a person wrote. */
function sanitise(raw: unknown): CustomTag[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomTag[] = [];
  for (const entry of raw) {
    const parsed = CustomTagSchema.safeParse(entry);
    if (!parsed.success || BUILT_IN.has(parsed.data.name)) continue;
    if (out.some((tag) => tag.name === parsed.data.name)) continue;
    out.push(parsed.data);
  }
  return out.slice(0, MAX_CUSTOM_TAGS);
}

/** Every meaning an emote may carry right now: the built-ins and the streamer's. */
export function knownMeanings(): Set<string> {
  return new Set<string>([...EMOTE_TAGS, ...localCustomTagStore.load().map((tag) => tag.name)]);
}

export const localCustomTagStore = {
  load(): CustomTag[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? sanitise(JSON.parse(raw)) : [];
    } catch {
      return [];
    }
  },

  save(tags: readonly CustomTag[]): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitise(tags)));
    } catch {
      // Quota or private mode. Non-fatal; the tag just will not persist.
    }
  },
};
