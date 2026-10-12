# Roadmap

Phases are strict. Nothing from a later phase is built until the earlier one
is manually believable.

## Phase 1 — Core AI Twitch chat (current)

- [x] AI-only batch generation
- [x] Gemini-only provider
- [x] Startup AI intro
- [x] Active AI responses and continuations
- [x] AI idle responses after 5 minutes, escalating
- [x] Continuous scheduler flow with low-water refill
- [x] Stable viewer identities, roster of at most ten
- [x] Stable Twitch-like colours
- [x] Anti-repetition behaviour
- [x] Speed-tier pacing, all six tiers reachable
- [x] Basic contextual emote selection
- [x] Silent provider failure behaviour
- [x] Automated tests against a scripted provider
- [ ] Transcription needs work — see `docs/fix-queue.md` items 24 and 25
- [x] Manual verification with a real key: the chat feels continuously alive,
      contextually responsive, varied, and recognisably like Twitch chat —
      signed off by the owner 2026-10-06, apart from the OBS check below
- [ ] OBS check — moved to the final product check below.
- [x] Cost measured: about $0.90–1.90 an hour (fix queue item 12)

## Phase 2 — Emote accuracy (current)

Choosing the right emote for a line, rather than a random one that exists.

- [x] One meaning vocabulary shared by hand tags, automatic classification
      and the model (`EMOTE_TAGS`)
- [x] Automatic classification from the name, with anchored matching, so an
      uploaded pack works without being configured (`lib/emotes/meaning.ts`)
- [x] Layered selection: hand tags, the emote the model named, the token
      chat was told to post and what is on screen, the model's stated
      feeling, the intent, mood, nothing
- [x] Unreadable emotes excluded entirely — a relevant line of text beats an
      unrelated picture
- [x] W / GG / hype treated as related but distinct families, with variety
      inside a family and order between families
- [x] Manual overrides on `/settings/emotes`: search, preview, tag, reset to
      automatic, and a filter for emotes chat can never use
- [x] Disallowed contexts: block an emote outright, or bar it from moments
      ("KEKW, never after a death"). Applied before every tier, the model's
      own pick included (`lib/config/emote-rules.ts`)
- [ ] Per-emote usage counts, so tagging is informed by what chat reaches for

Still to come in this phase: per-event priority weighting.

## Phase 3 — Product polish

UI and dashboard redesign. Better settings information architecture. OBS
validation and polish. Custom viewers (up to ten, same shape as generated
ones). Saved session settings.

(Done early, out of phase: the screen-share privacy warning now sits in the
control panel while capture is on.)

## Phase 4 — Hosted product

Accounts. Authentication. Security hardening. Database. Billing. Usage
limits. Deployment. Monetisation.

## Final product check (last)

- [ ] OBS check on stream. Performance, not chat behaviour, run once
      everything above is done. Emotes already verified rendering in a
      browser source with a real pack.

## Deferred and recorded, not planned

- Badges.
- Analytics.
- Marketing pages.
- Any second AI provider or model selector.
- Hotkey screen capture (fix queue item 3). Dropped: capturing only on a
  keypress makes chat later to react, not sooner, unless the press itself
  triggers the batch — and the streamer's hands are on the game.
- Fixing the two pre-existing `react-hooks/set-state-in-effect` lint
  findings in `ChatList.tsx` — real, unrelated to the core loop.
