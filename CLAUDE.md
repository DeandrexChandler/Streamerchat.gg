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
- **Idle is always on**, at sixty seconds, escalating through four stages.
- **The roster is at most ten people**, sized by tier, with stable names and
  colours and per-viewer memory. See `lib/engine/roster.ts`.

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
  api/             chat-candidates (the one route that spends money), emotes, overlay, transcribe
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
