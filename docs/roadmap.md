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

## Phase 4 — Hosted product

Accounts. Authentication. Security hardening. Database. Billing. Usage
limits. Deployment. Monetisation.

## Deferred and recorded, not planned

- Badges.
- Analytics.
- Marketing pages.
- Any second AI provider or model selector.
- Fixing the two pre-existing `react-hooks/set-state-in-effect` lint
  findings in `ChatList.tsx` — real, unrelated to the core loop.
