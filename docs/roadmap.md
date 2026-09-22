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
- [ ] Manual verification with a real key: the chat feels continuously alive,
      contextually responsive, varied, and recognisably like Twitch chat

## Phase 2 — Emote controls

Manual per-emote tags. Per-event priorities. Allowed and disallowed
contexts. Search and filtering. Persistent overrides.

A first version of manual tagging exists on `/settings/emotes` from before
the scope reset. It is not being extended until Phase 1 is signed off.

## Phase 3 — Product polish

UI and dashboard redesign. Better settings information architecture. OBS
validation and polish. Custom viewers (up to ten, same shape as generated
ones). Saved session settings.

Screen-share privacy warning: when "Watch my screen" is turned on, say
plainly that frames of the shared window go to Google, and to avoid sharing
anything sensitive (passwords, DMs, email, banking, personal info). Suggest
sharing the game window rather than the whole screen. Today the only notice
is the toggle's hover hint.

## Phase 4 — Hosted product

Accounts. Authentication. Security hardening. Database. Billing. Usage
limits. Deployment. Monetisation.

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
