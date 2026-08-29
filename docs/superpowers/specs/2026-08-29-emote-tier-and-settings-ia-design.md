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
| Fresh install with no packs imported | No emotes at all. Chat is text-only until a pack is imported. |
| Discoverability of that | Dismissible one-time banner above chat while zero packs exist |
| Page structure | `/settings` with sub-pages: Chat, Emotes, Appearance, OBS |
| Simulator page | Keeps a small live strip; everything else moves to settings |
| "Emote only mode" | Chat sends nothing but emotes; unavailable until a pack is imported |
| Fullscreen button | Collapses to the chat column *and* requests the Fullscreen API |

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

**`scripts/simulate.ts`** has no localStorage to read packs from. It gains
`--channel=<name>` to import a pack at startup and defaults to emote-free.

Rejected alternative: fetching the 7TV global pack on every run. CLAUDE.md
values the harness as "faster and more honest than clicking through the UI"; a
mandatory network round-trip on every invocation undercuts both, and breaks it
offline.

Accepted cost: `npm run simulate` no longer shows emote spam by default, so its
output is less representative of real chat than it was. `--channel` is the
escape hatch when that matters.

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

The UI control is disabled with an explanation while zero packs are imported.

### Fullscreen

A button immediately right of `StatusPill` in `app/(shell)/simulator/page.tsx`.

Collapses to the chat column — hiding nav, control panel and transcript — and
requests the Fullscreen API in the same action. Status pill and play/pause
remain visible.

Exits on Esc, on the button, and on `fullscreenchange` firing externally. The
exit affordance must stay on screen: browser chrome and the app's own controls
disappearing together is how a user gets stuck.

### Empty-state banner

Shown above the chat while zero emote packs are imported. One line, a link to
`/settings/emotes`, dismissible; dismissal persisted in localStorage alongside
the other client preferences.

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

Manual: `npm run simulate --channel=<name>` to eyeball emote density, and
`npm run simulate` to confirm emote-free output is still coherent.

## Out of scope

Everything in the [OBS overlay appearance spec](2026-08-29-obs-overlay-appearance-design.md):
font upload, outline, badges, overlay config, preview panel. `/settings/appearance`
is created as an empty shell here and filled there.

## Sequence

1. Part A — emote tier removal, fixture, harness flag
2. Part C — `{streamer}` / `{topic}` slots (before the UI that exposes them)
3. Part B — settings routes, redirects, nav, live strip split
4. Emote-only mode, fullscreen, empty-state banner
