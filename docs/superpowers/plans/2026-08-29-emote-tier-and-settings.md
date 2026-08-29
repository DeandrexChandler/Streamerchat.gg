# Emote Tier Removal and Settings IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the text-only emote placeholder tier, auto-import a real 7TV emote vocabulary on first run, and reorganise settings into `/settings` sub-pages so the simulator page keeps only live controls.

**Architecture:** `Emote.url` becomes required, which makes the compiler enumerate every caller that assumed a text-only emote could exist. Emotes then come exclusively from 7TV imports, with a popularity-ranked pack auto-imported once on first run. Settings move out of the simulator's control panel into `/settings/{chat,emotes,appearance,obs}`, leaving a live-tuning strip behind.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, zod 4, vitest 4, Tailwind 3, shadcn/Base UI.

**Spec:** `docs/superpowers/specs/2026-08-29-emote-tier-and-settings-ia-design.md`

## Global Constraints

- **Randomness goes through `lib/engine/rng.ts`, never `Math.random()`.**
- **The scheduler is the only thing that emits messages.** Nothing bypasses it.
- **The audio pipeline stays out of React.** No `setState` at animation-frame rate.
- **Chat never dunks on the streamer.** Viewers may be confused, derail, tease each other, and be self-deprecating. Never the broadcaster.
- **Never prefix a secret with `NEXT_PUBLIC_`.**
- Behaviour lives in data structures under `lib/data/`; logic lives in `lib/engine/`.
- `npm test` must pass before any task is called done. Also run `npm run typecheck`.
- Tests live in `lib/**/__tests__/**/*.test.ts` (vitest `environment: node`). React internals are not tested; engine seams are.
- Do not add documentation nobody asked for.
- `MOOD_FLOOR = 10` for the still-image top-up rule; `unknown` is never topped up.
- Auto-import target: top **150** popular emotes, expect ~123 after filtering.

---

### Task 1: Test fixture of real emotes

Replaces `DEFAULT_EMOTES` as the test corpus. Real 7TV IDs and URLs so the suite stays offline and deterministic while exercising url-bearing emotes.

**Files:**
- Create: `lib/data/__fixtures__/emotes.ts`
- Modify: `lib/engine/__tests__/pool.test.ts`, `lib/engine/__tests__/engine.test.ts`
- Test: existing suites, retargeted

**Interfaces:**
- Consumes: `Emote` from `lib/engine/types.ts`
- Produces: `FIXTURE_EMOTES: readonly Emote[]` — 12 emotes spanning all six known moods

- [ ] **Step 1: Create the fixture**

```ts
// lib/data/__fixtures__/emotes.ts
import type { Emote } from "../../engine/types";

/**
 * Emote corpus for tests.
 *
 * Real 7TV ids and CDN urls rather than invented ones, so a test that
 * accidentally depends on url shape fails here rather than in production.
 * Nothing is fetched — these are literals and the suite stays offline.
 *
 * Covers all six known moods so mood-sensitive selection can be tested
 * without importing a live pack.
 */
export const FIXTURE_EMOTES: readonly Emote[] = [
  { id: "01F61B1440000991F7SWQNMVX7", name: "KEKW", mood: "funny", url: "https://cdn.7tv.app/emote/01F61B1440000991F7SWQNMVX7/2x.webp", width: 64, height: 64 },
  { id: "01F00Z3A9G0007E4VV006YKSK9", name: "OMEGALUL", mood: "funny", url: "https://cdn.7tv.app/emote/01F00Z3A9G0007E4VV006YKSK9/2x.webp", width: 64, height: 64 },
  { id: "01EZPG1FN80001SNAW00ADK2DY", name: "Sadge", mood: "sad", url: "https://cdn.7tv.app/emote/01EZPG1FN80001SNAW00ADK2DY/2x.webp", width: 64, height: 64 },
  { id: "01F010G3WG0007E4VV006YKSKP", name: "PepeHands", mood: "sad", url: "https://cdn.7tv.app/emote/01F010G3WG0007E4VV006YKSKP/2x.webp", width: 64, height: 64 },
  { id: "01F6NPHCN0000BEKN8ZXWQNSDC", name: "monkaW", mood: "sad", url: "https://cdn.7tv.app/emote/01F6NPHCN0000BEKN8ZXWQNSDC/2x.webp", width: 64, height: 64 },
  { id: "01F6MZGCNG000255K4X1K7NTHR", name: "GIGACHAD", mood: "hype", url: "https://cdn.7tv.app/emote/01F6MZGCNG000255K4X1K7NTHR/2x.webp", width: 64, height: 64 },
  { id: "01F6P0803G000898NRWSAKGYXT", name: "POGGERS", mood: "hype", url: "https://cdn.7tv.app/emote/01F6P0803G000898NRWSAKGYXT/2x.webp", width: 64, height: 64 },
  { id: "01F6NPP6YG00013ACMMJP3W06V", name: "peepoLove", mood: "love", url: "https://cdn.7tv.app/emote/01F6NPP6YG00013ACMMJP3W06V/2x.webp", width: 64, height: 64 },
  { id: "01F6T8NM9R0007M5BTFWSP1YSJ", name: "Clueless", mood: "confused", url: "https://cdn.7tv.app/emote/01F6T8NM9R0007M5BTFWSP1YSJ/2x.webp", width: 64, height: 64 },
  { id: "01F6MA6Y100002B6P5MWZ5D916", name: "Hmm", mood: "confused", url: "https://cdn.7tv.app/emote/01F6MA6Y100002B6P5MWZ5D916/2x.webp", width: 64, height: 64 },
  { id: "01F6MQ33FG000FFJ97ZB8MWV52", name: "catJAM", mood: "chill", url: "https://cdn.7tv.app/emote/01F6MQ33FG000FFJ97ZB8MWV52/2x.webp", width: 64, height: 64 },
  { id: "01F6MXJD8R000F76KNAAV5HDGD", name: "Bedge", mood: "chill", url: "https://cdn.7tv.app/emote/01F6MXJD8R000F76KNAAV5HDGD/2x.webp", width: 64, height: 64 },
];
```

- [ ] **Step 2: Point the existing tests at the fixture**

In `lib/engine/__tests__/pool.test.ts` and `lib/engine/__tests__/engine.test.ts`, replace the `DEFAULT_EMOTES` import and every use:

```ts
// was: import { DEFAULT_EMOTES } from "../../data/emotes";
import { FIXTURE_EMOTES } from "../../data/__fixtures__/emotes";
```

Then substitute `FIXTURE_EMOTES` for `DEFAULT_EMOTES` at every call site. `engine.test.ts` also builds `buildEmoteIndex(DEFAULT_EMOTES)` — that becomes `buildEmoteIndex(FIXTURE_EMOTES)`.

- [ ] **Step 3: Run the suite — it must still be green**

Run: `npm test`
Expected: PASS, same count as before (304). This step changes the corpus, not behaviour; a failure here means a test was depending on a specific built-in emote name.

- [ ] **Step 4: Commit**

```bash
git add lib/data/__fixtures__/emotes.ts lib/engine/__tests__/
git commit -m "test: move engine tests onto a real-emote fixture"
```

---

### Task 2: Make `Emote.url` required and delete the text tier

The compile-breaking change. Everything in this task lands together because the type change is what finds the callers.

**Files:**
- Modify: `lib/engine/types.ts`, `lib/data/emotes.ts`, `lib/config/emote-store.ts`, `lib/config/settings.ts`, `app/components/chat/ChatLine.tsx`, `app/overlay/page.tsx`, `lib/react/use-simulator.ts`, `scripts/simulate.ts`
- Delete: `.emote_cache.json`
- Test: `lib/config/__tests__/emote-store.test.ts` (new)

**Interfaces:**
- Consumes: `FIXTURE_EMOTES` (Task 1)
- Produces: `mergeEmotes(packs: readonly EmotePack[]): Emote[]` — **one** parameter now, not two

- [ ] **Step 1: Write the failing test for `isEmote` url validation**

```ts
// lib/config/__tests__/emote-store.test.ts
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run lib/config/__tests__/emote-store.test.ts`
Expected: FAIL — `mergeEmotes` still takes two arguments.

- [ ] **Step 3: Make `url` required**

In `lib/engine/types.ts`, in `interface Emote`:

```ts
  /** Image URL. Required — there is no text-only emote tier. */
  url: string;
```

- [ ] **Step 4: Strip the built-ins from `lib/data/emotes.ts`**

Delete the `BUILT_IN` array and the `DEFAULT_EMOTES` export entirely, along with the file's leading comment paragraph about text-only emotes. Keep `buildEmoteIndex`, `MessageSegment`, `segmentMessage` and `isEmoteOnly` unchanged.

- [ ] **Step 5: Update `mergeEmotes` and `isEmote`**

In `lib/config/emote-store.ts`:

```ts
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
```

- [ ] **Step 6: Make `EmoteToken` image-only**

In `app/components/chat/ChatLine.tsx`, replace the whole `EmoteToken` function and its doc comment:

```tsx
/** Emotes are always images now — the text-token tier is gone. */
function EmoteToken({ emote, fontSize }: { emote: Emote; fontSize: number }) {
  return (
    <>
      {" "}
      <img
        src={emote.url}
        alt={emote.name}
        title={emote.name}
        className="inline-block align-middle"
        style={{ height: fontSize * 2, width: "auto" }}
        loading="lazy"
      />
    </>
  );
}
```

- [ ] **Step 7: Fix the three remaining callers**

`app/overlay/page.tsx` — replace the `DEFAULT_EMOTES` import and the `emotes={DEFAULT_EMOTES}` prop with an empty array plus a note. The appearance spec gives this real pack fetching:

```tsx
// Emotes reach the browser source in the appearance spec; until then it has
// no pack, so emote names render as plain text.
const OVERLAY_EMOTES: readonly Emote[] = [];
```

The file currently imports only `ChatMessage` from `@/lib/engine/types`; widen that to `import type { ChatMessage, Emote } from "@/lib/engine/types";`.

`lib/react/use-simulator.ts` — three changes:
```ts
// remove: import { DEFAULT_EMOTES } from "../data/emotes";
const [emotes, setEmotes] = useState<Emote[]>(() => []);
const emotesRef = useRef<Emote[]>([]);
// and in the mount effect:
const merged = mergeEmotes(localEmotePackStore.load());
```

`scripts/simulate.ts` — drop the `DEFAULT_EMOTES` import, pass `emotes: []` to `SimulationEngine` and `buildEmoteIndex([])`. Task 7 replaces this with a real fetch.

- [ ] **Step 8: Delete the dead cache file and the dead setting**

```bash
git rm .emote_cache.json
```

In `lib/config/settings.ts`, delete the `emoteChannel` field and its comment from `SimulationSettingsSchema`. Zod strips unknown keys, so a stored blob still containing it parses fine.

- [ ] **Step 9: Typecheck, then run the suite**

Run: `npm run typecheck && npm test`
Expected: both clean. The typecheck is the point of this task — if it passes, no caller assumes a url-less emote.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: require Emote.url and delete the text-only emote tier

The styled purple token was a placeholder from before 7TV import existed.
With real image emotes in it is not a fallback, it is wrong output going
out on a stream.

Making url required is the enforcing mechanism rather than a side effect:
the compiler enumerates every caller that assumed a text-only emote could
exist, and the branch cannot come back by accident."
```

---

### Task 3: Expand the emote mood classifier

60% of the top 150 classify as `unknown`. These rules capture the common misses and improve every channel import, not just the auto-imported pack.

**Files:**
- Modify: `lib/emotes/classify.ts`
- Test: `lib/emotes/__tests__/classify.test.ts`

**Interfaces:**
- Produces: no signature change. `classifyEmote(name: string): EmoteMood` behaves the same, matches more names.

- [ ] **Step 1: Write the failing test**

Append to `lib/emotes/__tests__/classify.test.ts`:

```ts
describe("expanded coverage of popular emotes", () => {
  it.each([
    ["COPIUM", "sad"],
    ["Madge", "sad"],
    ["RAGEY", "sad"],
    ["NOOOO", "sad"],
    ["Prayge", "love"],
    ["YEP", "hype"],
    ["LETHIMCOOK", "hype"],
    ["AINTNOWAY", "confused"],
    ["Aware", "confused"],
    ["Okayge", "chill"],
    ["DIESOFCRINGE", "funny"],
    ["Pepega", "funny"],
  ])("classifies %s as %s", (name, mood) => {
    expect(classifyEmote(name)).toBe(mood);
  });

  it("still returns unknown for a genuinely novel name", () => {
    expect(classifyEmote("xqcWOTBLUB")).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run lib/emotes/__tests__/classify.test.ts`
Expected: FAIL — most cases return `"unknown"`.

- [ ] **Step 3: Add the rules**

`RULES` is ordered and first-match-wins, so these go in the matching existing rule's `match` array rather than at the end. Add to the existing rules:

```ts
// sad rule (the second one, with "sad", "cry", …) — add:
  "copium", "madge", "rage", "nooo", "despair", "hopium",

// love rule — add:
  "pray", "praise", "wholesome",

// hype rule — add:
  "yep", "letscook", "lethimcook", "cook", "yesyes",

// confused rule — add:
  "aintnoway", "aware", "sus", "wut", "wat",

// chill rule — add:
  "okayge", "okay", "ok",

// funny rule — add:
  "cringe", "pepega", "bruh", "troll",
```

Placement matters: `"cook"` must not sit above the funny rule or `LETHIMCOOK` would need re-checking, and `"ok"` is broad enough that it belongs in the last (chill) rule where it cannot swallow more specific names.

- [ ] **Step 4: Run the test**

Run: `npx vitest run lib/emotes/__tests__/classify.test.ts`
Expected: PASS. If a case lands in the wrong mood, a rule was placed too high — move it down, do not add a special case.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS. Existing classifier tests must not regress; a broad needle like `"ok"` placed too high is the likely cause if they do.

- [ ] **Step 6: Commit**

```bash
git add lib/emotes/
git commit -m "feat: widen emote mood classification to common popular names"
```

---

### Task 4: Prefer animated, top up thin moods with stills

**Files:**
- Modify: `lib/emotes/seventv.ts`
- Test: `lib/emotes/__tests__/seventv.test.ts` (new)

**Interfaces:**
- Produces: `MOOD_FLOOR` (exported const, 10) and a changed `normalize()` internal. `toEmote` gains an `animated` field on its return so `normalize` can partition.

- [ ] **Step 1: Write the failing test**

```ts
// lib/emotes/__tests__/seventv.test.ts
import { describe, expect, it } from "vitest";
import { MOOD_FLOOR, selectEmotes } from "../seventv";
import type { Emote } from "../../engine/types";

type Candidate = { emote: Emote; animated: boolean };

function make(name: string, mood: Emote["mood"], animated: boolean): Candidate {
  return {
    emote: { id: name, name, mood, url: `https://cdn.test/${name}.webp` },
    animated,
  };
}

describe("selectEmotes", () => {
  it("keeps every animated emote", () => {
    const input = [make("a", "funny", true), make("b", "chill", true)];
    expect(selectEmotes(input).map((e) => e.name)).toEqual(["a", "b"]);
  });

  it("admits stills for a mood below the floor", () => {
    const input = [
      make("anim", "funny", true),
      make("KEKW", "funny", false),
    ];
    expect(selectEmotes(input).map((e) => e.name)).toContain("KEKW");
  });

  it("refuses stills once a mood has reached the floor", () => {
    const input = [
      ...Array.from({ length: MOOD_FLOOR }, (_, i) => make(`anim${i}`, "funny", true)),
      make("KEKW", "funny", false),
    ];
    expect(selectEmotes(input).map((e) => e.name)).not.toContain("KEKW");
  });

  it("never tops up unknown", () => {
    const input = [make("mystery", "unknown", false)];
    expect(selectEmotes(input)).toHaveLength(0);
  });

  it("admits stills in input order, so popularity wins", () => {
    const input = [
      make("popular", "sad", false),
      ...Array.from({ length: MOOD_FLOOR - 1 }, (_, i) => make(`x${i}`, "sad", false)),
    ];
    const names = selectEmotes(input).map((e) => e.name);
    expect(names[0]).toBe("popular");
    expect(names).toHaveLength(MOOD_FLOOR);
  });

  it("keeps animated emotes even when their mood is over the floor", () => {
    const input = Array.from({ length: MOOD_FLOOR + 5 }, (_, i) =>
      make(`anim${i}`, "hype", true),
    );
    expect(selectEmotes(input)).toHaveLength(MOOD_FLOOR + 5);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run lib/emotes/__tests__/seventv.test.ts`
Expected: FAIL — `selectEmotes` and `MOOD_FLOOR` are not exported.

- [ ] **Step 3: Implement `selectEmotes`**

Add to `lib/emotes/seventv.ts`:

```ts
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

/** Applies the animated-first, mood-floor selection rule. Input order is significance order. */
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
    // every real pack. Topping it up would just add stills for no coverage.
    if (c.emote.mood === "unknown") continue;
    if ((perMood.get(c.emote.mood) ?? 0) >= MOOD_FLOOR) continue;
    kept.push(c.emote);
    bump(c.emote.mood);
  }

  return kept;
}
```

- [ ] **Step 4: Rewire `toEmote` and `normalize` through it**

`toEmote` currently returns `null` for stills. Change it to return a candidate and let `selectEmotes` decide:

```ts
function toCandidate(raw: SevenTvEmote): EmoteCandidate | null {
  const host = raw.data?.host;
  if (!host?.url || !host.files?.length) return null;

  const file = pickFile(host.files);
  if (!file) return null;

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
```

`pickFile` currently filters to GIF/WEBP only, which excludes PNG stills. Widen it to accept `PNG`, keeping the GIF-then-WebP preference and appending PNG last:

```ts
function pickFile(files: SevenTvFile[]): SevenTvFile | null {
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
```

Then replace `normalize`'s loop body so it collects candidates and hands them to `selectEmotes`:

```ts
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
```

Delete the old `toEmote` function — `toCandidate` replaces it and nothing else calls it.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run lib/emotes/ && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/emotes/
git commit -m "feat: keep all animated emotes, top up thin moods with stills"
```

---

### Task 5: `fetchPopularPack` and the `popular` API parameter

**Files:**
- Modify: `lib/emotes/seventv.ts`, `app/api/emotes/route.ts`
- Test: `lib/emotes/__tests__/seventv.test.ts`

**Interfaces:**
- Consumes: `selectEmotes`, `EmoteCandidate` (Task 4)
- Produces: `fetchPopularPack(limit?: number): Promise<EmotePack>`; `mapPopularItem(item): EmoteCandidate | null` exported for testing

- [ ] **Step 1: Write the failing test for the GraphQL shape mapping**

Append to `lib/emotes/__tests__/seventv.test.ts`:

```ts
import { mapPopularItem } from "../seventv";

describe("mapPopularItem", () => {
  const item = {
    id: "01F61B1440000991F7SWQNMVX7",
    defaultName: "KEKW",
    flags: { animated: false },
    images: [
      { url: "https://cdn.7tv.app/emote/x/1x.webp", mime: "image/webp", width: 32, height: 32, frameCount: 1 },
      { url: "https://cdn.7tv.app/emote/x/2x.webp", mime: "image/webp", width: 64, height: 64, frameCount: 1 },
    ],
  };

  it("maps a v4 search item to a candidate", () => {
    const c = mapPopularItem(item)!;
    expect(c.emote.name).toBe("KEKW");
    expect(c.emote.mood).toBe("funny");
    expect(c.animated).toBe(false);
  });

  it("prefers the 2x image", () => {
    expect(mapPopularItem(item)!.emote.url).toContain("2x.webp");
  });

  it("returns null when there is no usable image", () => {
    expect(mapPopularItem({ ...item, images: [] })).toBeNull();
  });

  it("reports animated when the flag is set", () => {
    const c = mapPopularItem({ ...item, flags: { animated: true } })!;
    expect(c.animated).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run lib/emotes/__tests__/seventv.test.ts`
Expected: FAIL — `mapPopularItem` is not exported.

- [ ] **Step 3: Implement the mapper and the fetch**

```ts
interface PopularImage {
  url: string;
  mime: string;
  width: number;
  height: number;
  frameCount: number;
}

interface PopularItem {
  id: string;
  defaultName: string;
  flags?: { animated?: boolean };
  images?: PopularImage[];
}

/**
 * Maps one v4 search result to a candidate.
 *
 * 2x is the sweet spot for the same reason as pickFile: 1x is soft at twice
 * the font size and 4x is bytes nobody sees.
 */
export function mapPopularItem(item: PopularItem): EmoteCandidate | null {
  const images = item.images ?? [];
  const webp = images.filter((i) => i.mime === "image/webp");
  const gif = images.filter((i) => i.mime === "image/gif");
  const png = images.filter((i) => i.mime === "image/png");
  const pool = [...gif, ...webp, ...png];
  if (pool.length === 0) return null;

  const chosen = pool.find((i) => i.width === 64) ?? pool[0];

  return {
    animated: item.flags?.animated === true,
    emote: {
      id: item.id,
      name: item.defaultName,
      mood: classifyEmote(item.defaultName),
      url: chosen.url,
      width: chosen.width,
      height: chosen.height,
    },
  };
}

/**
 * The most-used emotes on 7TV, which is the vocabulary a real chat speaks.
 *
 * Not `/emote-sets/global` — that is 21 legacy entries with no laughter, no
 * sadness and no confusion, which leaves the director's mood matching nothing
 * to work with.
 */
export async function fetchPopularPack(limit = 150): Promise<EmotePack> {
  const perPage = Math.min(100, limit);
  const pages = Math.ceil(limit / perPage);
  const items: PopularItem[] = [];

  for (let page = 1; page <= pages; page += 1) {
    const query = `query{emotes{search(query:"",page:${page},perPage:${perPage},sort:{sortBy:TOP_ALL_TIME,order:DESCENDING}){items{id defaultName flags{animated} images{url mime width height frameCount}}}}}`;

    const res = await fetch(GQL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`7TV search returned ${res.status}.`);

    const body = (await res.json()) as {
      data?: { emotes?: { search?: { items?: PopularItem[] } } };
    };
    const page_items = body.data?.emotes?.search?.items ?? [];
    if (page_items.length === 0) break;
    items.push(...page_items);
  }

  const seen = new Set<string>();
  const candidates: EmoteCandidate[] = [];
  for (const item of items.slice(0, limit)) {
    const candidate = mapPopularItem(item);
    if (!candidate) continue;
    const key = candidate.emote.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }

  return {
    id: "7tv-popular",
    name: "Popular emotes",
    source: "7TV Popular",
    emotes: selectEmotes(candidates),
    importedAt: Date.now(),
  };
}
```

- [ ] **Step 4: Add the route parameter**

In `app/api/emotes/route.ts`, read `popular` alongside `channel` and `set`, and branch to `fetchPopularPack` first:

```ts
  const popular = searchParams.get("popular");
  // …
    const pack = popular
      ? await fetchPopularPack(Math.min(300, Math.max(1, Number(popular) || 150)))
      : channel
        ? await fetchChannelPack(channel)
        : set
          ? await fetchSetPack(set)
          : await fetchGlobalPack();
```

Import `fetchPopularPack` at the top of the route.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run lib/emotes/ && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Verify against the live API once, by hand**

Run: `npm run dev` in one shell, then:
```bash
curl -s "http://localhost:3000/api/emotes?popular=150" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const p=JSON.parse(d);const m={};for(const e of p.emotes)m[e.mood]=(m[e.mood]||0)+1;console.log(p.emotes.length,'emotes',m)})"
```
Expected: ~123 emotes, with `funny` at 6, `sad` 9, `confused` 10, `hype` 10, `love` 8, `chill` 15. Exact counts drift with 7TV's rankings; what must hold is that every known mood is non-zero and `funny` is above 2.

- [ ] **Step 7: Commit**

```bash
git add lib/emotes/ app/api/emotes/
git commit -m "feat: fetch the most popular 7TV emotes as an importable pack"
```

---

### Task 6: Auto-import on first run

**Files:**
- Modify: `lib/config/emote-store.ts`, `lib/react/use-simulator.ts`
- Test: `lib/config/__tests__/emote-store.test.ts`

**Interfaces:**
- Consumes: `mergeEmotes` (Task 2), `/api/emotes?popular=` (Task 5)
- Produces: `AUTO_PACK_ID = "7tv-popular"`; `hasAutoImported(): boolean`; `markAutoImported(): void` on the store module

- [ ] **Step 1: Write the failing test**

Append to `lib/config/__tests__/emote-store.test.ts`:

Extend the existing import at the top of the file to
`import { AUTO_PACK_ID, hasAutoImported, localEmotePackStore, markAutoImported, mergeEmotes } from "../emote-store";`
and add `beforeEach` to the vitest import, then append:

```ts
describe("auto-import bookkeeping", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts un-imported", () => {
    expect(hasAutoImported()).toBe(false);
  });

  it("remembers once marked", () => {
    markAutoImported();
    expect(hasAutoImported()).toBe(true);
  });

  it("stays marked after the pack is deleted, so it does not come back", () => {
    markAutoImported();
    localEmotePackStore.save([]);
    expect(hasAutoImported()).toBe(true);
  });
});
```

This test needs a DOM. Add a `// @vitest-environment jsdom` pragma at the top of the file, or install and configure jsdom if absent. If jsdom is not available, stub `window.localStorage` with an in-memory Map instead — the store only uses `getItem`/`setItem`/`removeItem`.

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run lib/config/__tests__/emote-store.test.ts`
Expected: FAIL — the exports do not exist.

- [ ] **Step 3: Implement the bookkeeping**

In `lib/config/emote-store.ts`:

```ts
/** Id of the auto-imported popular pack, so the UI can label it. */
export const AUTO_PACK_ID = "7tv-popular";

const AUTO_FLAG_KEY = "streamerchat-gg:emote-auto-imported:v1";

/**
 * Whether the first-run import has already happened.
 *
 * Tracked separately from "is the pack present" on purpose: deleting the pack
 * is a deliberate choice, and re-importing it on the next launch would
 * silently override it.
 */
export function hasAutoImported(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(AUTO_FLAG_KEY) === "1";
  } catch {
    // No storage means we cannot remember a refusal either, so claim it is
    // done rather than re-importing on every render.
    return true;
  }
}

export function markAutoImported(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTO_FLAG_KEY, "1");
  } catch {
    // Non-fatal; worst case it retries next launch.
  }
}
```

- [ ] **Step 4: Wire it into the simulator mount effect**

In `lib/react/use-simulator.ts`, inside the existing mount effect (after the emote merge), add:

```ts
    // First run: pull a real emote vocabulary so chat is not text-only out of
    // the box. Once, and never again after the user deletes it.
    if (packs.length === 0 && !hasAutoImported()) {
      void (async () => {
        try {
          const res = await fetch("/api/emotes?popular=150", { cache: "no-store" });
          if (!res.ok) return;
          const pack = (await res.json()) as EmotePack;
          if (!pack?.emotes?.length) return;

          markAutoImported();
          localEmotePackStore.save([pack]);
          const merged = mergeEmotes([pack]);
          emotesRef.current = merged;
          setEmotes(merged);
          engineRef.current?.setEmotes(merged);
        } catch {
          // Offline or 7TV down. Chat runs emote-free and the banner offers
          // a retry; nothing here may block the simulator from starting.
        }
      })();
    }
```

`packs` is the value already loaded by `localEmotePackStore.load()` in that effect — hoist it into a local so both the merge and this check use it.

- [ ] **Step 5: Run the suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Verify by hand**

Clear site data for `localhost:3000`, run `npm run dev`, open `/simulator`. Emotes should appear in chat within a couple of seconds of the page loading. Reload — it must not re-fetch. Delete the pack on the emotes page and reload — it must stay deleted.

- [ ] **Step 7: Commit**

```bash
git add lib/config/ lib/react/
git commit -m "feat: auto-import popular emotes on first run"
```

---

### Task 7: Harness emote fetching with an offline cache

**Files:**
- Modify: `scripts/simulate.ts`, `.gitignore`
- Test: manual — the harness is the test

**Interfaces:**
- Consumes: `fetchPopularPack`, `fetchChannelPack` (Task 5)

- [ ] **Step 1: Add the cache path to `.gitignore`**

```
# harness emote cache
/.emote-harness-cache.json
```

- [ ] **Step 2: Restructure the harness around an async main**

`scripts/simulate.ts` currently runs at module top level. `tsx` compiles to CJS and rejects top-level `await`, so the fetch must live inside an async function. Wrap the existing body:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { fetchChannelPack, fetchPopularPack, type EmotePack } from "../lib/emotes/seventv";

const CACHE = ".emote-harness-cache.json";

/**
 * Emotes for the harness.
 *
 * Cached to disk because CLAUDE.md values this harness as "faster and more
 * honest than clicking through the UI", and a ~1.1s network round-trip on
 * every invocation undercuts both and breaks it offline.
 */
async function loadEmotes(): Promise<readonly Emote[]> {
  const args = process.argv.slice(2);
  if (args.includes("--no-emotes")) return [];

  const channelArg = args.find((a) => a.startsWith("--channel="));
  if (channelArg) {
    const pack = await fetchChannelPack(channelArg.slice("--channel=".length));
    return pack.emotes;
  }

  try {
    const cached = JSON.parse(readFileSync(CACHE, "utf8")) as EmotePack;
    if (cached?.emotes?.length) return cached.emotes;
  } catch {
    // No cache yet, or it is corrupt. Fetch below.
  }

  try {
    const pack = await fetchPopularPack(150);
    writeFileSync(CACHE, JSON.stringify(pack));
    return pack.emotes;
  } catch {
    console.warn("Could not fetch emotes; running emote-free.");
    return [];
  }
}

async function main() {
  const emotes = await loadEmotes();
  // …existing body, with `emotes` passed to SimulationEngine and
  //   buildEmoteIndex(emotes) instead of DEFAULT_EMOTES
}

main();
```

The seed argument is currently `process.argv[2]`, which now collides with `--channel=`. Change it to pick the first argument that parses as a number:

```ts
const SEED = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a))) || 20260825;
```

- [ ] **Step 3: Run the harness three ways**

```bash
rm -f .emote-harness-cache.json
npm run simulate            # fetches, writes cache, shows emotes
npm run simulate            # instant, reads cache
npm run simulate -- --no-emotes   # emote-free, still coherent
```
Expected: run 1 is ~1s slower than run 2. Runs 1 and 2 show emote spam lines. Run 3 shows none and the message log still reads naturally.

- [ ] **Step 4: Commit**

```bash
git add scripts/ .gitignore
git commit -m "feat: harness fetches popular emotes once and caches them"
```

---

### Task 8: `{streamer}` and `{topic}` template slots

Part B surfaces `streamerName` and `streamTopic` as inputs. Without this they would be controls that silently do nothing.

**Files:**
- Modify: `lib/engine/generators/pool.ts`, `lib/engine/director.ts`, `lib/data/responses/reactions.ts`, `lib/data/responses/idle.ts`
- Test: `lib/engine/__tests__/pool.test.ts`

**Interfaces:**
- Produces: `FillContext` gains `streamer?: string` and `topic?: string`

- [ ] **Step 1: Write the failing test**

Append to `lib/engine/__tests__/pool.test.ts`:

```ts
describe("streamer and topic slots", () => {
  const entry = { text: "how's it going {streamer}" };
  const topicEntry = { text: "wait is this {topic}" };

  it("is unfillable when no streamer name is set", () => {
    expect(canFill(entry, { keywords: [], emotes: [] })).toBe(false);
  });

  it("is fillable once a streamer name is set", () => {
    expect(canFill(entry, { keywords: [], emotes: [], streamer: "dre" })).toBe(true);
  });

  it("substitutes the streamer name", () => {
    const out = fill(entry, { keywords: [], emotes: [], streamer: "dre" }, makeRng(1));
    expect(out).toBe("how's it going dre");
  });

  it("is unfillable when no topic is set", () => {
    expect(canFill(topicEntry, { keywords: [], emotes: [] })).toBe(false);
  });

  it("substitutes the topic", () => {
    const out = fill(topicEntry, { keywords: [], emotes: [], topic: "minecraft" }, makeRng(1));
    expect(out).toBe("wait is this minecraft");
  });
});
```

`makeRng` is whatever helper the file already uses to build a seeded `Rng`; reuse it rather than introducing another.

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run lib/engine/__tests__/pool.test.ts`
Expected: FAIL — `canFill` returns `true` for an unset streamer.

- [ ] **Step 3: Extend `FillContext`, `canFill` and `fill`**

```ts
export interface FillContext {
  keywords: readonly string[];
  emotes: readonly Emote[];
  replyTo?: string;
  /** Streamer's display name, when set. Gates `{streamer}` entries. */
  streamer?: string;
  /** What they're doing, when set. Gates `{topic}` entries. */
  topic?: string;
  recentTexts?: ReadonlySet<string>;
  lastTemplate?: string;
}

export function canFill(entry: ResponseEntry, context: FillContext): boolean {
  if (entry.text.includes("{kw}") && context.keywords.length === 0) return false;
  if (entry.text.includes("{user}") && !context.replyTo) return false;
  // Gated rather than substituted-empty: an entry that names the streamer is
  // simply ineligible when there is no name, so no call site needs to know.
  if (entry.text.includes("{streamer}") && !context.streamer) return false;
  if (entry.text.includes("{topic}") && !context.topic) return false;
  return true;
}

export function fill(entry: ResponseEntry, context: FillContext, rng: Rng): string {
  let text = entry.text;
  if (text.includes("{kw}")) text = text.replace(/\{kw\}/g, rng.pick(context.keywords));
  if (text.includes("{user}") && context.replyTo) text = text.replace(/\{user\}/g, context.replyTo);
  if (text.includes("{streamer}") && context.streamer) {
    text = text.replace(/\{streamer\}/g, context.streamer);
  }
  if (text.includes("{topic}") && context.topic) {
    text = text.replace(/\{topic\}/g, context.topic);
  }
  return text;
}
```

- [ ] **Step 4: Thread settings into both `FillContext` constructions in the director**

`lib/engine/director.ts` builds a `FillContext` in two places — the reactive path (~line 320) and the idle path (~line 460). Both already have `settings` in scope. Add to each object literal:

```ts
          streamer: settings.streamerName || undefined,
          topic: settings.streamTopic || undefined,
```

The `|| undefined` matters: the schema defaults these to `""`, and an empty string would pass the `canFill` truthiness gate and substitute nothing.

- [ ] **Step 5: Add pool entries that use the slots**

To `lib/data/responses/reactions.ts`, in the pools that fit — `greeting`, `question_to_chat`, `showing`, `achievement`:

```ts
  { text: "yooo {streamer}", length: "tiny", tags: ["hype"] },
  { text: "hi {streamer} o/", length: "tiny" },
  { text: "{streamer} you good?", length: "short", tags: ["curious"] },
  { text: "wait {streamer} how did you do that", length: "medium", tags: ["curious"] },
  { text: "{streamer} carrying as always", length: "short", tags: ["hype"] },
  { text: "first time seeing {topic} gameplay, this is sick", length: "medium" },
  { text: "is this {topic}?", length: "tiny", tags: ["curious"] },
  { text: "i only clicked for the {topic} ngl", length: "medium", tags: ["jokester"] },
```

To `lib/data/responses/idle.ts`:

```ts
  { text: "{streamer} you still there", length: "short" },
  { text: "anyone else just here for {topic}", length: "medium" },
```

**Constraint check before writing more:** chat never dunks on the streamer. Every line above is curious, supportive, or self-deprecating on the viewer's part. "i only clicked for the {topic} ngl" is the viewer being flippant about themselves, not criticising the broadcaster. Do not add entries that mock, correct, or express disappointment in the streamer.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run lib/engine/ && npm test`
Expected: PASS.

- [ ] **Step 7: Verify by hand that unset names change nothing**

Run: `npm run simulate`
Expected: no `{streamer}` or `{topic}` appears literally in output, and no message is missing a word where a slot would have been.

- [ ] **Step 8: Commit**

```bash
git add lib/engine/ lib/data/
git commit -m "feat: streamer name and topic template slots

streamerName and streamTopic have been in the schema since the engine was
built and were read by nothing. Settings surfaces them next; without this
they would be inputs that silently do nothing."
```

---

### Task 9: Emote-only mode

**Files:**
- Modify: `lib/config/settings.ts`, `lib/engine/director.ts`
- Test: `lib/engine/__tests__/engine.test.ts`

**Interfaces:**
- Produces: `SimulationSettings.emoteOnlyMode: boolean`

- [ ] **Step 1: Write the failing test**

Append to `lib/engine/__tests__/engine.test.ts`:

```ts
describe("emote-only mode", () => {
  it("emits only emote messages", () => {
    const engine = new SimulationEngine({
      seed: 7,
      now: 0,
      emotes: FIXTURE_EMOTES,
      settings: { audienceSize: 40, aiShare: 0, emoteOnlyMode: true },
    });
    engine.handleTranscript("let's go that was amazing", 0, 0.8);

    const index = buildEmoteIndex(FIXTURE_EMOTES);
    const released: string[] = [];
    for (let t = 0; t <= 20_000; t += 250) {
      for (const m of engine.tick(t)) released.push(m.text);
    }

    expect(released.length).toBeGreaterThan(0);
    for (const text of released) {
      expect(isEmoteOnly(text, index)).toBe(true);
    }
  });

  it("emits nothing rather than blanks when there are no emotes", () => {
    const engine = new SimulationEngine({
      seed: 7,
      now: 0,
      emotes: [],
      settings: { audienceSize: 40, aiShare: 0, emoteOnlyMode: true },
    });
    engine.handleTranscript("let's go that was amazing", 0, 0.8);

    const released: string[] = [];
    for (let t = 0; t <= 20_000; t += 250) {
      for (const m of engine.tick(t)) released.push(m.text);
    }
    expect(released).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run lib/engine/__tests__/engine.test.ts`
Expected: FAIL — `emoteOnlyMode` is not in the schema, and text messages are emitted.

- [ ] **Step 3: Add the schema field**

In `lib/config/settings.ts`, after `emotesEnabled`:

```ts
  /**
   * Every message is emotes and nothing else — what real chat does during a
   * clutch moment. Requires an imported pack; with no emotes the director
   * emits nothing rather than blank lines.
   */
  emoteOnlyMode: z.boolean().default(false),
```

- [ ] **Step 4: Route the director through the emote-only path**

`maybeEmoteOnly` currently gates on `viewer.emoteAffinity` and ambient depth. In emote-only mode it must fire for every speaker regardless. Add a forced variant and use it in both the reactive and idle paths:

```ts
/**
 * Emote-only mode: every message, every speaker, regardless of depth or
 * affinity. Returns null when there are no emotes, which the caller must
 * treat as "skip this speaker" — a blank message on a live stream is worse
 * than a missing one.
 */
function forcedEmoteOnly(
  emotes: readonly Emote[],
  classification: Classification,
  rng: Rng,
): string | null {
  if (emotes.length === 0) return null;
  const emote = pickEmote(emotes, classification.intent, classification.sentiment, rng);
  if (!emote) return null;
  const count = emoteSpamCount(rng);
  return Array.from({ length: count }, () => emote.name).join(" ");
}
```

In the reactive path, before the existing AI/emote/pool cascade:

```ts
    if (settings.emoteOnlyMode) {
      const only = forcedEmoteOnly(emotes, classification, rng);
      if (only === null) continue;   // no emotes — skip, never emit a blank
      text = only;
      source = "pool";
    }
```

and guard the cascade below it with `if (text === null)`. Apply the same shape in the idle path, using `idleClassification` and `return null` instead of `continue`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run lib/engine/ && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/config/settings.ts lib/engine/
git commit -m "feat: emote-only chat mode, guarded against an empty emote list"
```

---

### Task 10: Settings shell, sub-nav, and redirects

**Files:**
- Create: `app/(shell)/settings/layout.tsx`, `app/(shell)/settings/page.tsx`, `app/(shell)/settings/appearance/page.tsx`
- Modify: `app/(shell)/layout.tsx`
- Test: manual — routing

- [ ] **Step 1: Create the settings layout with sub-nav**

```tsx
// app/(shell)/settings/layout.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Settings shell.
 *
 * A sub-nav rather than more top-level items: settings areas will keep
 * arriving, and each one competing with the simulator for sidebar space is
 * how a nav turns into a list.
 */
const SECTIONS = [
  { href: "/settings/chat", label: "Chat", hint: "Behaviour and filtering" },
  { href: "/settings/emotes", label: "Emotes", hint: "Import 7TV packs" },
  { href: "/settings/appearance", label: "Appearance", hint: "How chat looks on stream" },
  { href: "/settings/obs", label: "OBS", hint: "Browser source setup" },
] as const;

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full gap-6 overflow-hidden">
      <nav className="w-48 shrink-0 space-y-1 pt-1">
        {SECTIONS.map((s) => {
          const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
          return (
            <Link
              key={s.href}
              href={s.href}
              className={cn(
                "block rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              <span className="block">{s.label}</span>
              <span className="block text-xs text-muted-foreground">{s.hint}</span>
            </Link>
          );
        })}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Add the `/settings` redirect and the appearance placeholder**

```tsx
// app/(shell)/settings/page.tsx
import { redirect } from "next/navigation";

export default function SettingsIndex() {
  redirect("/settings/chat");
}
```

```tsx
// app/(shell)/settings/appearance/page.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Placeholder. Font upload, outline controls, badge slots and the live
 * preview land here — see the OBS overlay appearance spec.
 */
export default function AppearancePage() {
  return (
    <div className="mx-auto max-w-3xl pb-10">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>How chat looks in your OBS browser source.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Custom fonts, text outline and chat badges are being built. For now,
          font size and timestamps live on the OBS page.
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Cut the top-level nav to two items**

In `app/(shell)/layout.tsx`, replace the `NAV` array:

```ts
const NAV = [
  { label: "Simulator", href: "/simulator", icon: MessagesSquare, hint: "Run the chat" },
  { label: "Settings", href: "/settings", icon: SlidersHorizontal, hint: "Chat, emotes, OBS" },
] as const;
```

Update the lucide import: drop `Smile` and `Tv`, add `SlidersHorizontal`.

- [ ] **Step 4: Verify routing**

Run `npm run dev`, then check `/settings` redirects to `/settings/chat` (404 is expected until Task 12), `/settings/appearance` renders, and the sub-nav highlights the active section.

- [ ] **Step 5: Commit**

```bash
git add "app/(shell)/settings" "app/(shell)/layout.tsx"
git commit -m "feat: settings shell with sub-navigation"
```

---

### Task 11: Move the emotes and OBS pages into settings

**Files:**
- Move: `app/(shell)/emotes/page.tsx` → `app/(shell)/settings/emotes/page.tsx`
- Move: `app/(shell)/obs/page.tsx` → `app/(shell)/settings/obs/page.tsx`
- Create: `app/(shell)/emotes/page.tsx`, `app/(shell)/obs/page.tsx` (redirects)
- Test: manual — routing

- [ ] **Step 1: Move both files with git so history follows**

```bash
mkdir -p "app/(shell)/settings/emotes" "app/(shell)/settings/obs"
git mv "app/(shell)/emotes/page.tsx" "app/(shell)/settings/emotes/page.tsx"
git mv "app/(shell)/obs/page.tsx" "app/(shell)/settings/obs/page.tsx"
```

Both use `@/`-prefixed imports, so nothing needs rewriting. Confirm with `npm run typecheck`.

- [ ] **Step 2: Leave redirects at the old paths**

```tsx
// app/(shell)/emotes/page.tsx
import { redirect } from "next/navigation";

// Moved under /settings. Redirect rather than 404 — this URL is likely
// sitting in an open tab or a bookmark.
export default function EmotesRedirect() {
  redirect("/settings/emotes");
}
```

```tsx
// app/(shell)/obs/page.tsx
import { redirect } from "next/navigation";

// Moved under /settings. The OBS browser-source URL points at /overlay and
// is unaffected, but this page is the one people keep open.
export default function ObsRedirect() {
  redirect("/settings/obs");
}
```

- [ ] **Step 3: Label the auto-imported pack on the emotes page**

In `app/(shell)/settings/emotes/page.tsx`, where each pack is listed, show a badge when `pack.id === AUTO_PACK_ID`:

```tsx
{pack.id === AUTO_PACK_ID && (
  <Badge variant="secondary">Added automatically</Badge>
)}
```

Import `AUTO_PACK_ID` from `@/lib/config/emote-store`. Deleting it must remain possible — the `hasAutoImported` flag from Task 6 is what stops it returning.

- [ ] **Step 4: Verify**

Run `npm run dev`. `/emotes` → `/settings/emotes`, `/obs` → `/settings/obs`. The OBS page's connection status still polls and the copy button still works. Confirm the overlay URL is unchanged.

- [ ] **Step 5: Run checks and commit**

Run: `npm run typecheck && npm test`

```bash
git add -A
git commit -m "refactor: move emotes and OBS pages under /settings"
```

---

### Task 12: The chat settings page

**Files:**
- Create: `app/(shell)/settings/chat/page.tsx`
- Modify: `app/(shell)/simulator/ControlPanel.tsx` (remove what moves)
- Test: manual

- [ ] **Step 1: Build the page**

Reuse the `Field` helper pattern from the OBS page rather than inventing another. Settings persist through `localSettingsStore`, loaded in an effect (not during render) so server and client markup agree — the same pattern `use-simulator` uses.

```tsx
// app/(shell)/settings/chat/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, localSettingsStore } from "@/lib/config/settings";
import type { SimulationSettings } from "@/lib/config/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function ChatSettingsPage() {
  const [settings, setSettings] = useState<SimulationSettings>(DEFAULT_SETTINGS);

  useEffect(() => setSettings(localSettingsStore.load()), []);

  const update = useCallback((patch: Partial<SimulationSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      localSettingsStore.save(next);
      return next;
    });
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      {/* Your stream — the two fields that let chat reference you */}
      {/* Audience — audienceSize */}
      {/* Display — showTimestamps */}
      {/* Filtering — profanityMode, blockedWords, allowedWords */}
    </div>
  );
}
```

Fill each section with `Card` + `Field` blocks:

- **Your stream:** `streamerName` (text, max 40) and `streamTopic` (text, max 80). Hint text should say chat will occasionally use these, and that leaving them blank simply means chat never mentions them.
- **Audience:** `audienceSize` (number, 5–10000). Hint: above ~300 the number is a viewer count, not a headcount.
- **Display:** `showTimestamps` (checkbox).
- **Filtering:** `profanityMode` (select: off / replace / filter — label "off" as "Allow swearing", not "No filtering", because slurs are dropped in every mode). `blockedWords` and `allowedWords` as comma-separated text inputs, split on commas and trimmed on change.

- [ ] **Step 2: Remove the moved controls from the control panel**

In `app/(shell)/simulator/ControlPanel.tsx`, delete the `audienceSize`, `showTimestamps` and `profanityMode` controls. Keep chat speed, emotes, idle, the mic meter, stats and clear.

- [ ] **Step 3: Verify persistence**

Run `npm run dev`. Change settings on `/settings/chat`, navigate to `/simulator`, confirm the change took effect (audience size shows in the stats). Reload and confirm it persisted.

- [ ] **Step 4: Verify the streamer name actually reaches chat**

Set a streamer name, run the simulator, and watch for messages using it. If none appear within a minute, the director threading from Task 8 Step 4 is wrong.

- [ ] **Step 5: Commit**

```bash
git add "app/(shell)/settings/chat" "app/(shell)/simulator/ControlPanel.tsx"
git commit -m "feat: chat settings page with streamer name, topic and word filters"
```

---

### Task 13: Emote-only toggle in the live strip

**Files:**
- Modify: `app/(shell)/simulator/ControlPanel.tsx`, `lib/react/use-simulator.ts`
- Test: manual

- [ ] **Step 1: Expose whether any emotes are loaded**

`ControlPanel` needs to know whether to disable the toggle. `useSimulator` already returns `emotes`; pass `emotes.length` down from `app/(shell)/simulator/page.tsx` as a prop rather than importing the store again:

```tsx
<ControlPanel … emoteCount={simulator.emotes.length} />
```

- [ ] **Step 2: Add the toggle**

Next to the existing Emotes toggle in `ControlPanel.tsx`:

```tsx
<Toggle
  label="Emote only"
  checked={settings.emoteOnlyMode}
  disabled={emoteCount === 0}
  hint={
    emoteCount === 0
      ? "Needs emotes — import a pack on the Emotes page."
      : "Chat says nothing but emotes."
  }
  onChange={(emoteOnlyMode) => onChange({ emoteOnlyMode })}
/>
```

Match whatever toggle component the file already uses; do not introduce a second toggle style.

- [ ] **Step 3: Verify**

Run `npm run dev`, turn the toggle on with the simulator running. Chat should become emotes only within a few seconds. Turn it off and text should return.

- [ ] **Step 4: Commit**

```bash
git add "app/(shell)/simulator" lib/react/
git commit -m "feat: emote-only toggle in the simulator strip"
```

---

### Task 14: Fullscreen chat

**Files:**
- Modify: `app/(shell)/simulator/page.tsx`
- Test: manual

- [ ] **Step 1: Add fullscreen state and the Fullscreen API wiring**

```tsx
const [chatOnly, setChatOnly] = useState(false);

// Track the browser's own fullscreen state as the source of truth: Esc and
// the F11 key both exit without going through our button, and a stale flag
// would leave the UI collapsed with no visible way back.
useEffect(() => {
  const sync = () => {
    if (!document.fullscreenElement) setChatOnly(false);
  };
  document.addEventListener("fullscreenchange", sync);
  return () => document.removeEventListener("fullscreenchange", sync);
}, []);

const toggleChatOnly = useCallback(async () => {
  if (chatOnly) {
    setChatOnly(false);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    return;
  }
  setChatOnly(true);
  // Fullscreen can be refused (permissions policy, an iframe). The collapsed
  // layout is still useful on its own, so a refusal is not an error.
  await document.documentElement.requestFullscreen().catch(() => {});
}, [chatOnly]);
```

- [ ] **Step 2: Add the button right of the status pill**

```tsx
<StatusPill status={status} />
<button
  onClick={() => void toggleChatOnly()}
  aria-label={chatOnly ? "Exit fullscreen chat" : "Fullscreen chat"}
  title={chatOnly ? "Exit fullscreen (Esc)" : "Fullscreen chat"}
  className="rounded p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
>
  {chatOnly ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
</button>
```

Import `Maximize2` and `Minimize2` from `lucide-react`.

- [ ] **Step 3: Collapse the layout**

Hide the control panel and transcript when `chatOnly` is true, and hide the shell sidebar. The sidebar lives in the parent layout, so use a body-level class rather than prop-drilling:

```tsx
useEffect(() => {
  document.body.classList.toggle("chat-only", chatOnly);
  return () => document.body.classList.remove("chat-only");
}, [chatOnly]);
```

and in `app/globals.css`:

```css
/* Fullscreen chat: everything except the chat column and its controls. */
body.chat-only aside[data-app-nav] { display: none; }
body.chat-only [data-panel="controls"],
body.chat-only [data-panel="transcript"] { display: none; }
```

Add `data-app-nav` to the sidebar `<aside>` in `app/(shell)/layout.tsx`, and `data-panel="controls"` / `data-panel="transcript"` to those two elements on the simulator page.

- [ ] **Step 4: Verify the exit path**

Run `npm run dev`. Enter fullscreen, confirm the exit button is visible, press Esc and confirm the layout restores. Then enter, press F11, and confirm it does not get stuck.

- [ ] **Step 5: Commit**

```bash
git add "app/(shell)" app/globals.css
git commit -m "feat: fullscreen chat-only view on the simulator"
```

---

### Task 15: Empty-state banner

**Files:**
- Create: `app/(shell)/simulator/EmoteBanner.tsx`
- Modify: `app/(shell)/simulator/page.tsx`
- Test: manual

- [ ] **Step 1: Build the banner**

```tsx
// app/(shell)/simulator/EmoteBanner.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

/**
 * Shown only when chat has no emotes at all — the first-run import failed, or
 * every pack was deleted. With auto-import working this is rarely seen, which
 * is the point: it is an error affordance, not an onboarding step.
 */
const DISMISS_KEY = "streamerchat-gg:emote-banner-dismissed:v1";

export function EmoteBanner({ emoteCount }: { emoteCount: number }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (emoteCount > 0 || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Non-fatal — it reappears next load.
    }
  };

  return (
    <div className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
      <span className="text-amber-200">
        Chat has no emotes — the automatic import didn&apos;t reach 7TV.{" "}
        <Link href="/settings/emotes" className="underline underline-offset-2">
          Import a pack
        </Link>
        .
      </span>
      <button onClick={dismiss} aria-label="Dismiss" className="ml-auto text-amber-200/70 hover:text-amber-200">
        <X className="size-3.5" />
      </button>
    </div>
  );
}
```

Starting `dismissed` at `true` and correcting it in an effect is deliberate: it avoids a flash of the banner during hydration before localStorage can be read.

- [ ] **Step 2: Mount it above the chat**

In `app/(shell)/simulator/page.tsx`, directly above `<ChatList>`:

```tsx
<EmoteBanner emoteCount={simulator.emotes.length} />
```

- [ ] **Step 3: Verify both states**

With a pack imported, the banner must not render. Then clear site data, go offline (devtools → Network → Offline), reload, and confirm it appears and the simulator still starts.

- [ ] **Step 4: Full verification pass**

Run: `npm test && npm run typecheck && npm run lint && npm run build && npm run simulate`
Expected: tests pass, typecheck clean, lint no worse than baseline (2 errors / 3 warnings, all pre-existing in `ChatList.tsx` and `use-simulator.ts`), build green, harness output coherent.

- [ ] **Step 5: Commit**

```bash
git add "app/(shell)/simulator"
git commit -m "feat: banner when chat has no emotes at all"
```
