import type { Emote } from "../engine/types";
import { classifyEmote } from "./classify";

/**
 * 7TV emote-set import.
 *
 * Only animated emotes are kept. A chat full of still images reads as a
 * screenshot; the motion is most of what makes real chat feel alive, and it's
 * what the owner asked for explicitly.
 *
 * Format preference is GIF first, then animated WebP. WebP is smaller and
 * animates identically in every browser this targets, so it's the better file
 * — but 7TV doesn't expose GIF for every emote, and asking for GIF first keeps
 * the result predictable when both exist.
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
  const animated = files.filter(
    (f) => f.format === "GIF" || f.format === "WEBP",
  );
  if (animated.length === 0) return null;

  const byPreference = ["2x.gif", "2x.webp", "3x.gif", "3x.webp", "1x.gif", "1x.webp"];
  for (const wanted of byPreference) {
    const match = animated.find((f) => f.name.toLowerCase() === wanted);
    if (match) return match;
  }
  return animated[0];
}

function toEmote(raw: SevenTvEmote): Emote | null {
  // Stills are dropped entirely — see the note at the top of this file.
  if (!raw.data?.animated) return null;

  const host = raw.data.host;
  if (!host?.url || !host.files?.length) return null;

  const file = pickFile(host.files);
  if (!file) return null;

  // 7TV returns protocol-relative hosts ("//cdn.7tv.app/emote/<id>").
  const base = host.url.startsWith("//") ? `https:${host.url}` : host.url;

  return {
    id: raw.id,
    name: raw.name,
    mood: classifyEmote(raw.name),
    url: `${base}/${file.name}`,
    width: file.width,
    height: file.height,
  };
}

function normalize(set: SevenTvEmoteSet, source: string): EmotePack {
  const emotes: Emote[] = [];
  const seen = new Set<string>();

  for (const raw of set.emotes ?? []) {
    const emote = toEmote(raw);
    if (!emote) continue;
    // Packs can contain aliases of the same name; the renderer looks up by
    // lowercased name, so a duplicate would be unreachable anyway.
    const key = emote.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    emotes.push(emote);
  }

  return {
    id: set.id,
    name: set.name?.trim() || source,
    source,
    emotes,
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
