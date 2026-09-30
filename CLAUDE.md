# CLAUDE.md — Engineering rules for StreamerChat.gg

## What this is

An AI wrapper for a simulated Twitch chat. The streamer presses Play, AI
generates believable viewers and messages, the chat flows continuously at
the selected speed, streamer speech or typed input gives the AI new context,
and prolonged silence causes AI-generated idle conversation.

Built to be genuinely used by two real people with low-viewership streams.
Success is a manual session where the chat feels continuously alive,
contextually responsive, varied, and recognisably like Twitch chat — and
then goes into OBS.

The full product definition is `docs/product-scope.md`. The system is
described in `docs/architecture.md`. What comes later is `docs/roadmap.md`.
Those three files and this one are the source of truth; anything older is
history.

## Operating mode

You are the primary engineer, not a tutor. Make engineering decisions and
act on them. Explain significant architectural choices briefly; do not
narrate routine work.

- Refactor when justified. Nothing here is sacred.
- Ask only when a decision genuinely changes what gets built and you cannot
  reasonably make the call. Otherwise decide, state it, keep moving.
- Do not generate documentation nobody asked for.
- Do not over-engineer. This is a monolith on purpose.

## The core rule

**The AI writes every line chat says. Deterministic code owns everything
else.**

```
Mic / typed ─► Classifier ─► Engine ─(nextGeneration)─► Hook ─► Route ─► Gemini
                              │ ◄───(supplyReactions)──────────────────────┘
                              ▼
                     Director ─► Scheduler ─► Renderer / OBS
```

Deterministic code owns: timing, scheduling, rate limiting, who speaks,
usernames and colours, personalities, per-viewer memory, repetition rules,
emote selection, safety filtering, compact context, queue refill, the
displayed viewer count.

One exception, at the slow tiers only (≤ 0.5/sec, `isConversational` in
`lib/engine/roster.ts`): the room is three or four regulars the streamer
talks to by name, so the model is given the roster and writes each line as
a named person. The engine still enforces everything else — an invented
name is dropped server-side, and the caps on who may speak, how often and
whether they are repeating themselves all still hold. Above that tier the
model never sees a name.

The AI owns: wording and conversational content, in batches — startup,
active, continuation, idle — never one call per message.

Consequences that must stay true:

- **There is no deterministic chat text.** No pools, no templates, no
  fallback lines. If the model did not write it, it is the streamer's own
  directive token or it is nothing.
- **A provider failure is silent to the streamer.** The route retries once,
  logs the cause server-side, and returns `{reactions: [], status:
  "unavailable"}`. No banner, no provider name, no error text in the UI. The
  next batch tries on its own.
- **One provider, one model, fixed.** Gemini `gemini-3.5-flash-lite` via
  `GOOGLE_API_KEY`. No selection anywhere. If Gemini is down or the key is
  out of credit, the answer is to add credit — never another provider.
- **"screen" points chat at the picture.** Said or typed, the bare word
  sends a frame with a small batch and tells the model the streamer is
  pointing at it. Twenty second cooldown, because each use is a call with
  an image; the transcript panel shows the word blue when it fired and grey
  with the remaining seconds when it did not.
- **A hot line lifts the pace, briefly.** A directive, excitement, a
  question to chat or anything with a sentiment gives the room eight seconds
  at a higher rate, decaying back, at most once every twenty seconds
  (`burstFactorFor`, `BURST_MS`, `BURST_COOLDOWN_MS` in
  `lib/engine/roster.ts`). Strongest at the slow tiers, where the baseline
  is one line every five seconds.
- **Idle is always on**, after five minutes with nothing said and nothing
  happening on screen, escalating through four stages (5 / 8 / 12 / 20 min).
  Before that, chat moves off the last line after a minute and just hangs out.
- **The room is regulars plus strangers.** Regulars persist, accumulate
  memory and are who the streamer learns: 3 at the slowest tier up to 12 at
  CHAOS. Strangers pass through once and carry no history, rising from none
  of the traffic to 55%. See `lib/engine/roster.ts`.
- **Regulars remember, and survive the session.** A few topics, a few lines
  and what the streamer said to them, per person, saved to browser storage
  (`lib/config/roster-store.ts`) and shown to the model at the slow tiers.
  Kept deliberately small: it rides in every prompt.
- **Every regular types differently.** Line length, caps, punctuation,
  questions, stretched words and two things they bring up — sampled once per
  person from ranges measured off real chats (`lib/data/voices.ts`, from
  `npm run sample -- <channel> <secs> voices`) and saved with them. Subtle by
  design: habits, not costumes. `/settings/regulars` shows the room read-only.
- **What is on screen decides the character of chat**, when the streamer has
  turned capture on. A frame rides along with batches the engine already
  makes, the model names what it sees from a closed list, and
  `lib/ai/moment.ts` turns that into how emote-heavy and how fast the room
  is. A big change on screen pulls a small batch (6–12 lines) to the front
  of the queue, so chat reacts in about two seconds. Capture is opt-in and
  off by default; without it chat falls back to reading intent from speech.

## Avoid both failure modes

"Everything goes to a model" produced twelve lines dumped at once from a
fresh random username each. "Thousands of hardcoded strings" produced a chat
that could not hear you. The engine exists so neither happens: the model
writes, the engine decides who, when, how often, and whether they have
already said it.

## Layout

```
app/
  (shell)/         pages with app chrome — simulator, settings, obs
  overlay/         OBS browser source; NO chrome, deliberately outside (shell)
  api/             chat-candidates (the one route that spends money), emotes, overlay
lib/
  ai/              provider contract, prompt per phase, gemini, mock (tests only), validate, config
  engine/          engine, director, scheduler, population, roster, generation, topics, classifier, attention, rng
  data/            usernames, personalities, emote index
  emotes/          7TV import, semantic emote selection
  config/          zod-validated settings + storage adapters
  audio/           mic, VAD — plain classes, no React
  transcription/   Web Speech provider
scripts/simulate.ts  headless harness with the mock provider
docs/                product-scope, architecture, roadmap
```

## Branching

**Never commit to `main`.** Work happens on a branch and reaches `main`
through a pull request, even working solo: the branch is what makes a
change reviewable and revertable as a unit. `main` is only ever
fast-forwarded by a merged PR, never pushed to directly.

## Non-negotiables

**Randomness goes through `lib/engine/rng.ts`, never `Math.random()`.**

**The audio pipeline stays out of React.** No `setState` at frame rate.

**The scheduler is the only thing that emits messages.**

**The key is server-side only. Never prefix a secret with `NEXT_PUBLIC_`.**
The chat-candidates route is rate-limited and size-capped. It is not
authenticated, because there are no accounts; that is acceptable on
localhost and nowhere else.

**Never spend real API credit in automated tests.** Every provider boundary
is mocked. The harness uses the mock. If a check needs a real key, stop and
say so.

**Chat never dunks on the streamer.** Viewers may be confused, derail, tease
each other, be self-deprecating. They never bite the broadcaster. Slurs are
dropped in every filter mode including "off".

## Anti-feature-creep rule

Before any change: *does this directly improve believable continuous
AI-generated Twitch chat?* If not, record it in `docs/roadmap.md` and do not
build it. Phases 2–4 (emote controls, polish, hosted product) are not
started until Phase 1 is manually believable.

## Testing

`npm test` must pass before anything is called done. `npm run typecheck`
and `npm run lint` too (two pre-existing lint findings in `ChatList.tsx`
are known and recorded).

`npm run simulate` runs a scripted session through the engine with the mock
provider and prints pacing health — rate, gap spread, AI batches per minute
by phase, slots that waited, lines dropped, dry ticks. It is the fastest
honest read on whether the loop is alive. `SIM_RATE=4 npm run simulate` for
a tier.

Test the engine at its seams with a scripted provider: phases, refill,
staleness, repetition, pacing per tier, viewer continuity, emote selection,
silent failure. When you fix a realism bug, add the regression test.

Do not claim something works because it compiles. Run it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
