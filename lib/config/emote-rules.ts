import type { EmoteMeaning } from "../engine/types";
import { knownMeanings } from "./custom-tags";

/**
 * Where an emote must never go, per emote, set by the streamer.
 *
 * Tags say where an emote *belongs*. These say where it does not, which is a
 * different thing and not expressible with tags alone: KEKW is laughter and
 * belongs in a funny moment, and it must still never land straight after
 * the streamer dies, because there it reads as mockery.
 *
 * Two controls, and only two:
 *
 *  - `blocked`: never post it, anywhere. For the emote in an imported pack
 *    the streamer simply does not want on their stream.
 *  - `notFor`: never post it into a moment that wants any of these meanings,
 *    even when its name or the model points at it.
 *
 * Stored apart from tags and from the packs, for the same reason tags are:
 * a re-import replaces a pack wholesale, and keyed by name because that is
 * what survives a channel moving an emote between sets.
 */

const STORAGE_KEY = "streamerchat-gg:emote-rules:v1";

export interface EmoteRule {
  blocked?: boolean;
  notFor?: readonly EmoteMeaning[];
}

/** Lowercased emote name to its rule. Emotes without one are absent. */
export type EmoteRuleMap = Readonly<Record<string, EmoteRule>>;

/** Hand-validated: this reads storage, which an older build or a person may have edited. */
function sanitise(raw: unknown, known: ReadonlySet<string> = knownMeanings()): EmoteRuleMap {
  if (typeof raw !== "object" || raw === null) return {};
  const out: Record<string, EmoteRule> = {};

  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const { blocked, notFor } = value as { blocked?: unknown; notFor?: unknown };
    const rule: EmoteRule = {
      ...(blocked === true ? { blocked: true } : {}),
      ...(Array.isArray(notFor)
        ? {
            notFor: [
              ...new Set(
                notFor.filter((tag): tag is EmoteMeaning => typeof tag === "string" && known.has(tag)),
              ),
            ],
          }
        : {}),
    };
    if (rule.blocked || (rule.notFor && rule.notFor.length > 0)) out[name.toLowerCase()] = rule;
  }
  return out;
}

export const localEmoteRuleStore = {
  load(): EmoteRuleMap {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? sanitise(JSON.parse(raw)) : {};
    } catch {
      return {};
    }
  },

  save(rules: EmoteRuleMap): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitise(rules)));
    } catch {
      // Quota or private mode. Non-fatal; the rule just will not persist.
    }
  },
};

/**
 * Folds rules onto a merged emote list, after packs and tags.
 *
 * Applied last on purpose: a rule is the streamer saying "not this", and
 * nothing the pack or the tags say should be able to undo it.
 */
export function applyEmoteRules<T extends { name: string }>(
  emotes: readonly T[],
  rules: EmoteRuleMap,
): Array<T & EmoteRule> {
  if (Object.keys(rules).length === 0) return [...emotes];
  return emotes.map((emote) => {
    const rule = rules[emote.name.toLowerCase()];
    return rule ? { ...emote, ...rule } : emote;
  });
}
