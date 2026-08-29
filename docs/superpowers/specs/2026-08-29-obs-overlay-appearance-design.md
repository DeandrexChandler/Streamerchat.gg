# OBS overlay appearance: emotes, typography, badges

**Date:** 2026-08-29
**Branch:** `feat/obs-appearance` (to be cut from `main` after the settings spec lands)
**Status:** approved, deferred — implement after
[emote tier and settings IA](2026-08-29-emote-tier-and-settings-ia-design.md)
**Builds on:** the SSE overlay transport (commit `8cbb39c`)

---

## Why

The relay puts messages into OBS. It does not make them look like Twitch. Four
gaps, all visible on stream:

- Imported 7TV emotes never reach the browser source — it has no access to the
  simulator's localStorage, the same wall the message transport hit
- Chat text carries a heavy drop shadow tuned for readability over gameplay,
  which reads as dated
- No way to use a custom font
- No badges, which is a large part of why real chat looks real

## Decisions taken

| Question | Decision |
|---|---|
| Badge art source | Ship a hand-drawn inline SVG set; override per slot by uploading an image |
| Badge types | Subscriber (+tiers, +month milestones), gifter (+leader tiers), Prime, bits/cheer, founder, verified. **No mod/VIP.** |
| Badge distribution | 30% of messages carry ≥1 badge, 10% carry ≥2 (a subset of the 30%). Fixed per viewer. |
| Font import | Upload `.otf/.ttf/.woff/.woff2`, served to the overlay via `@font-face` |
| Appearance delivery | Server-stored per key, pushed live over the existing SSE stream |
| Emote delivery | Overlay fetches packs itself through the existing `/api/emotes` proxy |
| Username color | Message text plain white; usernames keep their per-viewer colors |
| Preview | Live preview panel in settings, not by restyling the simulator |
| Asset storage | Local disk, gitignored |

---

## 0. Git

Prerequisite, already done for the settings spec: the SSE relay is committed,
`main` is fast-forwarded to it, and the stale `claude-rework` branch is deleted.

`feat/obs-appearance` is cut from `main` once the settings work has merged, so
`/settings/appearance` exists to build into.

## 1. Overlay config — the backbone

Everything else depends on this. A per-key appearance object stored server-side:

```
.data/overlay/<sha256(key)>/config.json
                           /font.otf
                           /badge-subscriber.png
```

**The overlay key is hashed for the directory name.** That keeps a bearer token
out of filenames and makes path traversal structurally impossible rather than
something a filter has to catch.

**Delivery is fetch-on-connect plus SSE push.** The browser source GETs its
config when it attaches, then receives `config` events on the stream it already
holds. The initial GET is required because the relay deliberately replays
nothing — a source reappearing after an OBS scene switch needs current state
immediately. The push is what makes tuning feel live.

New:
- `lib/overlay/appearance.ts` — zod schema and defaults
- `lib/overlay/asset-store.ts` — disk-backed read/write
- `app/api/overlay/config/route.ts` — GET, PUT
- `app/api/overlay/assets/route.ts` — POST upload, DELETE
- `app/api/overlay/asset/route.ts` — GET serve

Modified: `lib/overlay/hub.ts` gains a `config` event name;
`lib/overlay/protocol.ts` gains the config event schema.

`.data/` is gitignored.

## 2. Text, outline, transparency

Message text goes plain white. Usernames keep their per-viewer colors and the
`: ` separator lightens — colored names are most of what makes chat scannable,
and dropping them turns the overlay into one white wall.

The drop shadow is removed. Outline becomes a toggle with a width, off by
default, implemented as `paint-order: stroke fill` with `-webkit-text-stroke`.

**Not layered `text-shadow`.** That is the common hack and it blurs at size.
`paint-order` draws the stroke behind the fill so glyphs are not thinned.
Chromium-only, which is exactly what OBS runs.

Driven by CSS custom properties on the overlay root, so `ChatLine` stays shared
with the simulator and the simulator's dark-panel styling is untouched.

Also: set `background: transparent` explicitly on html/body for `/overlay`
rather than relying on the user-agent default, and drop the `<Toaster>` from
that tree — it has no business inside a browser source.

## 3. 7TV emotes in the overlay

Config carries the imported pack identifiers — `{ kind: "channel" | "set" | "global", value }` —
mirrored from the emotes page. The overlay fetches each through the existing
`/api/emotes` proxy, which already sets `cache-control: public, max-age=300`,
and merges them.

Packs are only ever fetched by channel, set or global today, so nothing is lost
by identifying them this way rather than shipping emote data over the wire.

Rejected: pushing the manifest over the relay (a 1200-emote pack is ~150KB,
over the 64KB publish cap, needing chunking) and attaching emote data per
message (repeats the same URLs thousands of times a session).

Failure mode: a failed fetch degrades to plain text, not a blank overlay.

## 4. Font upload

Accepts `.otf`, `.ttf`, `.woff`, `.woff2`. Capped at 5MB.

**Validated by magic bytes, not extension** — `OTTO`, `true`, `wOFF`, `wOF2`,
`0x00010000`. An extension check on an upload endpoint is not a check.

Served from `/api/overlay/asset?key=…&slot=font` with the correct content-type
and a long cache. The overlay injects an `@font-face` rule and applies it to the
whole chat line.

## 5. Badges

`Viewer` gains `badges: BadgeId[]`, assigned once at creation through the seeded
RNG in `lib/engine/population.ts`. A viewer who is a subscriber stays one — that
stability is most of what makes chat read as real rather than random.

`ChatMessage` carries the **IDs, not the images**. The overlay resolves ID to
art. That separation is what lets someone drop in their own PNGs without the
engine knowing anything about it.

### Hitting 30% / 10%

Badge assignment is **independent of a viewer's activity**. Because they are
independent, the badged share of *messages* equals the badged share of
*viewers*, so the target can be set directly instead of chasing drift between
the two — active chatters talk more than lurkers, and any correlation between
activity and badges would pull the message-level rate away from the intended
number.

- P(≥1 badge) = 0.30
- P(≥2 badges) = 0.10

### The set

Subscriber (tier 1/2/3 × month milestones), gifter (+leader tiers), Prime,
bits/cheer (tiered), founder, verified. No moderator or VIP.

One composition rule: at most one sub-family badge, so nobody renders as a
founder *and* a tier-3 subscriber.

Defaults are inline SVG — zero network, nothing loaded from Twitch's CDN, no
third-party IP served.

### Overrides

`/settings/appearance` lists a row per badge slot showing the drawn default with
an upload control. An uploaded image replaces that slot. Reuses the asset
pipeline from section 4, so the incremental cost is close to zero.

This is what makes the feature work for someone else's channel with custom sub
badge art, without either of them registering a Twitch application.

New: `lib/data/badges.ts` (definitions), `app/components/chat/ChatBadges.tsx`.
Modified: `lib/engine/types.ts`, `lib/engine/population.ts`,
`lib/engine/director.ts`, `lib/overlay/protocol.ts`,
`app/components/chat/ChatLine.tsx`.

## 6. Preview panel

A live strip in `/settings/appearance` rendering real `ChatLine`s over a
checkerboard, using the same CSS custom properties as the overlay. Tuning is
done while watching the actual output rather than alt-tabbing to OBS.

The simulator's own chat is deliberately left alone: white-on-transparent text
with an outline looks wrong on the `#18181b` panel its styling was tuned for.

## 7. Testing

- Badge distribution lands within tolerance of 30% / 10% over a seeded run
- A given viewer's badges never change across a session
- Composition rule holds — never two sub-family badges
- Magic-byte validation rejects a non-font renamed `.otf`
- Upload size caps enforced
- Appearance schema rejects out-of-range sizes and malformed colors
- Badge IDs round-trip through the relay protocol
- Config is readable only with the correct key

Manual: `npm run simulate` to eyeball badge density in flowing chat, and a real
OBS browser source to confirm transparency and font rendering.

## Sequence

Each stage is independently shippable; work can stop after any of them.

1. Section 2 — text, outline, transparency (visible immediately)
2. Section 3 — 7TV emotes in the overlay
3. Section 1 — config backbone and live push
4. Section 4 — font upload
5. Section 5 — badges
6. Section 6 — preview panel
