import type { Emote } from "../engine/types";
import { classifyEmote } from "./classify";

/**
 * 7TV emote-set import.
 *
 * Animated emotes are always kept, because motion is most of what makes chat
 * feel alive rather than like a screenshot. Stills are admitted only where a
 * mood would otherwise be too thin to use — see MOOD_FLOOR below for why that
 * exception exists and what it costs.
 *
 * Format preference is GIF first, then animated WebP, then PNG for the
 * stills. WebP is smaller and animates identically in every browser this
 * targets, so it's the better file — but 7TV doesn't expose GIF for every
 * emote, and asking for GIF first keeps the result predictable when both
 * exist.
 */

/** Shape of the bits of the 7TV v3 response we actually read. */
interface SevenTvFile {
  name: string;
  format: string;
  width: number;
  height: number;
}

interface SevenTvEmote {
  id: string;
  name: string;
  data?: {
    animated?: boolean;
    host?: { url?: string; files?: SevenTvFile[] };
  };
}

interface SevenTvEmoteSet {
  id: string;
  name?: string;
  emotes?: SevenTvEmote[];
}

export interface EmotePack {
  id: string;
  name: string;
  /** Where it came from, for display. */
  source: string;
  emotes: Emote[];
  importedAt: number;
}

const API = "https://7tv.io/v3";

/**
 * Picks the file to render.
 *
 * 2x is the sweet spot: 1x is visibly soft once scaled to twice the font size,
 * and 4x is four times the bytes for detail nobody sees at 28px.
 */
function pickFile(files: SevenTvFile[]): SevenTvFile | null {
  // PNG is included because stills are now admitted to top up thin moods,
  // and most static emotes ship as PNG rather than WebP.
  const usable = files.filter(
    (f) => f.format === "GIF" || f.format === "WEBP" || f.format === "PNG",
  );
  if (usable.length === 0) return null;

  const byPreference = [
    "2x.gif", "2x.webp", "3x.gif", "3x.webp", "1x.gif", "1x.webp",
    "2x.png", "3x.png", "1x.png",
  ];
  for (const wanted of byPreference) {
    const match = usable.find((f) => f.name.toLowerCase() === wanted);
    if (match) return match;
  }
  return usable[0];
}

/**
 * Minimum emotes per known mood before stills stop being admitted.
 *
 * The animated-only rule exists because a wall of stills reads as a
 * screenshot. Measured against the top 150 it also removed KEKW, Pog, Sadge
 * and the rest of the recognisable vocabulary, leaving two funny emotes out
 * of 108 — and laughter is the most common thing real chat does.
 *
 * So: keep every animated emote, then admit stills only where a mood is thin.
 * Against the live top 150 that adds fifteen stills and leaves the pack 88%
 * animated, which keeps motion dominant while giving every mood a real
 * vocabulary.
 */
export const MOOD_FLOOR = 10;

export interface EmoteCandidate {
  emote: Emote;
  animated: boolean;
}

/**
 * Applies the animated-first, mood-floor selection rule.
 * Input order is significance order — for the popular pack that is ranking.
 */
export function selectEmotes(candidates: readonly EmoteCandidate[]): Emote[] {
  const kept: Emote[] = [];
  const perMood = new Map<string, number>();

  const bump = (mood: string) => perMood.set(mood, (perMood.get(mood) ?? 0) + 1);

  for (const c of candidates) {
    if (!c.animated) continue;
    kept.push(c.emote);
    bump(c.emote.mood);
  }

  for (const c of candidates) {
    if (c.animated) continue;
    // "unknown" is a wildcard usable in any mood and is already abundant in
    // every real pack. Topping it up would add stills for no coverage gain.
    if (c.emote.mood === "unknown") continue;
    if ((perMood.get(c.emote.mood) ?? 0) >= MOOD_FLOOR) continue;
    kept.push(c.emote);
    bump(c.emote.mood);
  }

  return kept;
}

function toCandidate(raw: SevenTvEmote): EmoteCandidate | null {
  const host = raw.data?.host;
  if (!host?.url || !host.files?.length) return null;

  const file = pickFile(host.files);
  if (!file) return null;

  // 7TV returns protocol-relative hosts ("//cdn.7tv.app/emote/<id>").
  const base = host.url.startsWith("//") ? `https:${host.url}` : host.url;

  return {
    animated: raw.data?.animated === true,
    emote: {
      id: raw.id,
      name: raw.name,
      mood: classifyEmote(raw.name),
      url: `${base}/${file.name}`,
      width: file.width,
      height: file.height,
    },
  };
}

function normalize(set: SevenTvEmoteSet, source: string): EmotePack {
  const candidates: EmoteCandidate[] = [];
  const seen = new Set<string>();

  for (const raw of set.emotes ?? []) {
    const candidate = toCandidate(raw);
    if (!candidate) continue;
    // Packs can contain aliases of the same name; the renderer looks up by
    // lowercased name, so a duplicate would be unreachable anyway.
    const key = candidate.emote.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }

  return {
    id: set.id,
    name: set.name?.trim() || source,
    source,
    emotes: selectEmotes(candidates),
    importedAt: Date.now(),
  };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? "Not found on 7TV."
        : `7TV returned ${res.status}.`,
    );
  }
  return (await res.json()) as T;
}

/** Imports 7TV's global set — the emotes almost every chat has. */
export async function fetchGlobalPack(): Promise<EmotePack> {
  const set = await getJson<SevenTvEmoteSet>(`${API}/emote-sets/global`);
  return normalize({ ...set, name: set.name ?? "7TV Global" }, "7TV Global");
}

const GQL = "https://7tv.io/v4/gql";

/**
 * Resolves a Twitch login to its numeric Twitch ID.
 *
 * `/v3/users/twitch/{id}` takes the *numeric* Twitch ID, not the login, so a
 * plain username 404s. Twitch's own API would need OAuth, so this goes through
 * 7TV's GraphQL search instead, which needs no credentials.
 */
async function resolveTwitchId(handle: string): Promise<string> {
  const query = `query($q:String!){ users { search(query:$q, page:1, perPage:10) {
    items { mainConnection { platformId platformUsername platform } } } } }`;

  const res = await fetch(GQL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ query, variables: { q: handle } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`7TV search returned ${res.status}.`);

  const body = (await res.json()) as {
    data?: {
      users?: {
        search?: {
          items?: Array<{
            mainConnection?: {
              platformId?: string;
              platformUsername?: string;
              platform?: string;
            };
          }>;
        };
      };
    };
  };

  const items = body.data?.users?.search?.items ?? [];
  // Search is fuzzy and returns Kick accounts and partial matches, so take an
  // exact Twitch username match rather than the first result.
  const exact = items.find(
    (item) =>
      item.mainConnection?.platform === "TWITCH" &&
      item.mainConnection.platformUsername?.toLowerCase() === handle,
  );

  const id = exact?.mainConnection?.platformId;
  if (!id) throw new Error(`No 7TV account found for "${handle}".`);
  return id;
}

/** Imports the set attached to a Twitch channel. */
export async function fetchChannelPack(login: string): Promise<EmotePack> {
  const handle = login.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{2,25}$/.test(handle)) {
    throw new Error("That doesn't look like a Twitch username.");
  }

  const twitchId = await resolveTwitchId(handle);

  const user = await getJson<{ emote_set?: SevenTvEmoteSet }>(
    `${API}/users/twitch/${twitchId}`,
  );

  if (!user.emote_set) throw new Error(`${handle} has no 7TV emote set.`);

  // Some accounts return the set without its emotes populated.
  const set = user.emote_set.emotes?.length
    ? user.emote_set
    : await getJson<SevenTvEmoteSet>(`${API}/emote-sets/${user.emote_set.id}`);

  return normalize(set, handle);
}

/** Imports a set by its 7TV id, for sets not tied to a Twitch account. */
export async function fetchSetPack(setId: string): Promise<EmotePack> {
  const id = setId.trim();
  if (!/^[0-9a-zA-Z]{20,32}$/.test(id)) {
    throw new Error("That doesn't look like a 7TV emote set ID.");
  }
  const set = await getJson<SevenTvEmoteSet>(`${API}/emote-sets/${id}`);
  return normalize(set, `set ${id.slice(0, 8)}`);
}
