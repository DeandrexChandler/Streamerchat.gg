# Emote tier removal and settings information architecture

**Date:** 2026-08-29
**Branch:** `feat/emote-tier-and-settings`
**Status:** approved, not yet implemented
**Follows:** the SSE overlay transport (commit `8cbb39c`)
**Precedes:** [OBS overlay appearance](2026-08-29-obs-overlay-appearance-design.md) — that spec's UI lands in the settings shell this one builds

---

## Why

Two things prompted this.

The chat renders text-only emote names — `LULW`, `KEKW` — as styled purple
tokens, a placeholder from before 7TV import existed. With real image emotes
in, the placeholder is no longer a fallback; it is just wrong output going out
on a stream.

Separately, nine of the sixteen settings in `SimulationSettings` have no UI at
all, and more are coming. The simulator's control panel is the wrong place for
them: it is a live-tuning strip, not a preferences screen.

## Decisions taken

| Question | Decision |
|---|---|
| Fresh install with no packs imported | Auto-import the top ~150 most popular 7TV emotes on first run |
| Which auto-import source | 7TV v4 GraphQL `TOP_ALL_TIME`, **not** the 7TV global set — see below |
| If that fetch fails | Chat runs emote-free; dismissible banner offers a retry / manual import |
| Page structure | `/settings` with sub-pages: Chat, Emotes, Appearance, OBS |
| Simulator page | Keeps a small live strip; everything else moves to settings |
| "Emote only mode" | Chat sends nothing but emotes; unavailable until a pack is imported |
| Fullscreen button | Collapses to the chat column *and* requests the Fullscreen API |

## Why not the 7TV global set

The obvious auto-import source is `/emote-sets/global`. It was measured before
being designed around, and it is unusable as a floor:

```
7TV global:  21 emotes
moods:       unknown 67% · hype 19% · chill 10% · love 5%
sample:      RainTime PETPET Clap2 PepePls forsenPls gachiBASS PartyParrot
```

No laughter, no sadness, no confusion — three of the six moods have zero
coverage, and two thirds of the set classifies as `unknown`. The director picks
emotes by mood to keep a burst tonally coherent; on this set that system has
almost nothing to work with, and emote-only mode would spam `PartyParrot`
where it should be spamming `KEKW`.

The v4 GraphQL popularity search returns the real vocabulary, in one request:

```
top 150:   108 animated (72%), 1.1s
funny      OMEGALUL KEKW PepeLaugh ICANT
sad        Sadge monkaW PepeHands monkaChrist
hype       GIGACHAD Pog POGGERS LETSGO Clap
love       peepoLove peepoComfy widepeepoHappy
confused   Clueless Hmm HUH 5Head
chill      catJAM Bedge NODDERS o7 VIBE
```

Same implementation cost — `lib/emotes/seventv.ts` already posts to
`https://7tv.io/v4/gql` for username resolution, and the search returns
complete emotes with absolute CDN URLs inline, so no per-emote follow-up
requests are needed.

## Scope discovered during design

`streamerName` and `streamTopic` are **dead schema fields** — defined, persisted,
and read by nothing. Surfacing them as form inputs without engine work would
ship a control that silently does nothing, so this spec includes wiring them
into the template generator. That is real added scope and is called out
explicitly in Part C below.

`emoteChannel` is dead in the same way, but nothing asked for it and the emotes
page keeps its own local state. It is deleted rather than wired.

`blockedWords` and `allowedWords` are already consumed by
`lib/engine/profanity.ts`. Surfacing those is UI only.

---

## Part A — Remove the text-emote tier

### The enforcing change

`Emote.url` becomes **required** instead of optional.

This is the mechanism, not a side effect. Once the type guarantees every emote
has an image, the placeholder branch cannot be reintroduced by accident and the
compiler enumerates every caller that assumed otherwise. A runtime check or a
deleted branch would leave the door open.

### Deletions

- `BUILT_IN` and `DEFAULT_EMOTES` in `lib/data/emotes.ts`
- The text-token branch of `EmoteToken` in `app/components/chat/ChatLine.tsx`;
  `EmoteToken` becomes image-only
- `.emote_cache.json` — tracked in git, uses an `emotion`/`tags` schema that no
  longer exists, imported by nothing
- `emoteChannel` from `SimulationSettingsSchema`

### Callers that need answers

**`lib/react/use-simulator.ts`** starts from `[]` and merges imported packs.
`mergeEmotes(builtIn, packs)` loses its first parameter and takes packs only.

**`app/overlay/page.tsx`** currently hardcodes `DEFAULT_EMOTES`. It is left
rendering no emotes by this spec; the appearance spec gives it real pack
fetching. This is a deliberate ordering choice — the overlay renders emotes as
plain text in the interim, which is no worse than the placeholder tokens it
renders today.

**`scripts/simulate.ts`** has no localStorage to read packs from. It fetches the
popular pack on first run and caches it to a gitignored file, so subsequent runs
are instant and work offline. `--channel=<name>` imports a specific channel
instead; `--no-emotes` skips fetching entirely.

The cache matters: CLAUDE.md values the harness as "faster and more honest than
clicking through the UI", and a mandatory ~1.1s network round-trip on every
invocation would undercut both and break it offline.

**`lib/config/emote-store.ts`** validates stored packs with `isEmote()`, which
checks `id`, `name` and `mood` but not `url`. It must now require `url` as well.
Without that, a blob written by an earlier build can reintroduce exactly the
url-less emote the type change is meant to make impossible — and it would fail
at render time, on stream, rather than at the boundary.

**Tests** in `lib/engine/__tests__/pool.test.ts` and `engine.test.ts` lean on
`DEFAULT_EMOTES`. They move to a committed fixture pack at
`lib/data/__fixtures__/emotes.ts` — a dozen real 7TV entries with URLs and
known moods. Keeps the suite offline and deterministic.

---

## Part A2 — Auto-import on first run

### New client for popular emotes

`lib/emotes/seventv.ts` gains `fetchPopularPack(limit = 150)`, posting a
`TOP_ALL_TIME` search to the v4 GraphQL endpoint it already uses. The response
carries `id`, `defaultName`, `flags.animated` and a full `images[]` array with
absolute CDN URLs, so one request yields complete emotes.

The existing still-image rule is unchanged: non-animated emotes are dropped, as
they are for channel imports. Expect ~108 usable emotes from a 150 request.

`app/api/emotes/route.ts` gains a `popular` parameter alongside `channel` and
`set`, so the client keeps going through the same proxy and rate limiter.

### When it runs

On simulator mount, when the pack store is empty. The result is saved through
`localEmotePackStore` like any other pack, tagged as auto-imported so
`/settings/emotes` can label it and offer removal.

It runs **once**. If the user deletes it, it stays deleted — a re-import on
every launch would override a deliberate choice.

### Failure

Network failure is non-fatal: chat runs emote-free and the banner offers a
retry. Nothing blocks the simulator from starting.

### Classifier coverage

56% of the top 150 currently classify as `unknown`. That is survivable —
`classify.ts` deliberately treats `unknown` as a wildcard usable in any mood
rather than guessing — but roughly fifteen added rules would capture the
common misses (`COPIUM`, `Prayge`, `Madge`, `NOOOO`, `YEP`, `Aware`,
`DIESOFCRINGE`, `RAGEY`, `AINTNOWAY`, `SNIFFA`…).

Worth doing here because it improves every channel import too, not just this
pack.

---

## Part B — Settings information architecture

### Routes

```
app/(shell)/simulator/page.tsx           live strip only
app/(shell)/settings/layout.tsx          sub-nav shell
app/(shell)/settings/chat/page.tsx       behavior, audience, streamer, filtering
app/(shell)/settings/emotes/page.tsx     moved from /emotes
app/(shell)/settings/appearance/page.tsx new — shell only, filled by spec C
app/(shell)/settings/obs/page.tsx        moved from /obs
```

`/settings` itself redirects to `/settings/chat`.

`/emotes` and `/obs` become redirects rather than 404s. The OBS browser-source
URL points at `/overlay` and is unaffected, but `/obs` is likely sitting in an
open tab.

Top-level nav in `app/(shell)/layout.tsx` drops from four items to two:
**Simulator** and **Settings**. New settings areas become sub-pages instead of
competing with the simulator for top-level space.

### What lives where

**Simulator live strip** — things you touch mid-sentence: mic meter, play/pause,
clear, session stats, chat speed, emotes on/off, emote-only, idle on/off.

**`/settings/chat`** — audience size, timestamps, profanity mode, streamer name,
stream topic, blocked words, allowed words.

Not surfaced: `maxMessagesPerMinute`, `idleAfterSeconds`, `sideConversationChance`,
`messageBufferSize`, `aiShare`. The tuned defaults are good and `aiShare` governs
a tier that does not exist yet.

### Emote-only mode

New schema field `emoteOnlyMode: z.boolean().default(false)`.

Threaded to the director, which routes every message through the emote-only
path and skips text generation entirely.

**Guarded in the engine, not only in the UI.** When the emote list is empty the
director produces no message rather than an empty one. A UI-only gate would let
a stale or hand-edited localStorage blob emit blank lines onto a live stream —
exactly the class of failure `SimulationSettingsSchema` exists to prevent.

The UI control is disabled with an explanation only when the emote list is
genuinely empty — which, with auto-import, means the first-run fetch failed
rather than the normal case.

### Fullscreen

A button immediately right of `StatusPill` in `app/(shell)/simulator/page.tsx`.

Collapses to the chat column — hiding nav, control panel and transcript — and
requests the Fullscreen API in the same action. Status pill and play/pause
remain visible.

Exits on Esc, on the button, and on `fullscreenchange` firing externally. The
exit affordance must stay on screen: browser chrome and the app's own controls
disappearing together is how a user gets stuck.

### Empty-state banner

Shown above the chat only when the emote list is empty — i.e. the first-run
auto-import failed, or the user deleted every pack. One line with a retry and a
link to `/settings/emotes`, dismissible; dismissal persisted in localStorage
alongside the other client preferences.

With auto-import working this is rarely seen, which is the point: it is an
error affordance, not an onboarding step.

---

## Part C — Streamer name and topic in the engine

Without this, Part B ships two inputs that do nothing.

`FillContext` gains optional `streamer` and `topic`. `canFill()` learns to gate
on them the way it already gates `{kw}` and `{user}`, so an entry using
`{streamer}` is simply ineligible when no name is set — no empty substitutions,
no special-casing at the call site.

`fill()` substitutes `{streamer}` and `{topic}`.

A modest set of pool entries in `lib/data/responses/` use the new slots.

**Constraint from CLAUDE.md:** chat never dunks on the streamer. Lines
addressing them by name are the highest-risk place for that rule to break, so
entries here stay curious, supportive, or self-deprecating on the viewer's part.

---

## Testing

Engine seams, per CLAUDE.md — not React internals.

- Emote-only mode produces only emote messages under a fixed seed
- Emote-only mode with an empty emote list produces **no** message, not a blank
- `{streamer}` / `{topic}` entries are filtered out by `canFill()` when unset
- `{streamer}` / `{topic}` substitute correctly when set
- `segmentMessage` against url-only emotes
- New and removed schema fields round-trip; a stored blob containing the
  deleted `emoteChannel` still parses
- `mergeEmotes` with its new single-argument signature
- `isEmote()` rejects a stored emote with no `url`
- `fetchPopularPack` maps the GraphQL shape to `Emote[]` and drops stills
- Auto-import runs only when the store is empty, and not again after deletion
- A failed auto-import leaves the simulator startable
- Added classifier rules assign the expected moods

Manual: `npm run simulate --channel=<name>` to eyeball emote density, and
`npm run simulate` to confirm emote-free output is still coherent.

## Out of scope

Everything in the [OBS overlay appearance spec](2026-08-29-obs-overlay-appearance-design.md):
font upload, outline, badges, overlay config, preview panel. `/settings/appearance`
is created as an empty shell here and filled there.

## Sequence

1. Part A — emote tier removal, fixture, `Emote.url` required
2. Part A2 — `fetchPopularPack`, auto-import, classifier rules, harness cache
3. Part C — `{streamer}` / `{topic}` slots (before the UI that exposes them)
4. Part B — settings routes, redirects, nav, live strip split
5. Emote-only mode, fullscreen, empty-state banner
