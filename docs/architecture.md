# Architecture

```
Microphone ─► Transcription ─► Classifier ─┐
Typed input ───────────────────────────────┤
                                           ▼
                                   ┌──────────────┐   nextGeneration()   ┌─────────┐   POST    ┌────────┐
                                   │    Engine    │ ───────────────────► │  Hook   │ ────────► │ Route  │ ─► Gemini
                                   │  (phase,     │ ◄─────────────────── │ (pump)  │ ◄──────── │        │
                                   │   queue,     │   supplyReactions()  └─────────┘  {lines}  └────────┘
                                   │   roster)    │
                                   └──────┬───────┘
                                          │ one line per emit slot
                                          ▼
                                     Director ─► Scheduler ─► Renderer / OBS relay
```

Everything left of the hook is deterministic, seeded, and testable without
a network. The hook carries requests; the route talks to Gemini; the engine
never knows either exists.

## Engine (`lib/engine/engine.ts`)

Owns the conversation state and the decision of when the AI is asked for
more.

- `beginSession(now)` — Play. Phase becomes startup; every viewer forgets
  what they said; the queue is empty.
- `handleTranscript(text, now, energy?, force?)` — an utterance. Microphone
  input goes through the attention gate (`lib/engine/attention.ts`) and may
  be ignored; typed input is forced through. Accepted input sets phase
  active, records the utterance, drops the pending queue and trims the
  scheduler, and observes a topic for momentum.
- `nextGeneration(now)` — returns a complete `CandidateRequest` or null.
  Null while a request is unresolved, while paused, during the failure
  backoff, or while the queue is above the low-water mark. Handles the
  transition into idle and between idle stages. **A returned request must be
  resolved** with `supplyReactions` or `generationFailed`.
- `supplyReactions(lines, now)` — appends a batch, stamped with the phase and
  intent it was requested for. Discards it if the moment has passed (the
  streamer spoke, or the idle stage moved on).
- `tick(now)` — drifts the viewer count, turns the roster over, runs the
  rate governor, releases due messages through the filter.

Sizing lives in `lib/engine/generation.ts` (batch size, low-water mark, idle
stages, failure backoff) and `lib/engine/roster.ts` (roster size, speaking
cooldown, turnover, consecutive cap).

## Director (`lib/engine/director.ts`)

Turns one generated line into one message: picks the speaker (preferring a
fresh voice in a topic, settling for a returning one), decides whether the
line is rendered as words or as an emote, chooses the emote, and labels the
message. It has no text of its own. The only non-model words it can produce
are the token the streamer asked chat to spam.

## Population (`lib/engine/population.ts`)

The roster. Stable identities (name from `lib/data/usernames.ts`, colour
from the fixed Twitch palette, personality from `lib/data/personalities.ts`)
plus per-viewer memory: `hasSaid`, `lastDid`, `remember`, `forget`. The
speaking cooldown is set by the engine from the tier.

## Scheduler (`lib/engine/scheduler.ts`)

The only thing that emits messages. Rate-capped as a safety valve; the
Poisson governor in the engine is what actually paces chat.

## AI layer (`lib/ai/`)

- `provider.ts` — the `CandidateRequest` / `CandidateProvider` contract.
- `prompt.ts` — one prompt per phase. Startup, active, continuation, and
  four idle framings. Compact context only.
- `gemini.ts` — the one real provider. Header auth, JSON mode, thinking off.
- `mock.ts` — scripted provider for tests and the harness. Never reachable
  from the running app.
- `validate.ts` — length, hostility toward the streamer, dedup against recent
  chat. Server-side, so a client cannot skip it.
- `config.ts` — the key, the model constant, and call ceilings.

## Route (`app/api/chat-candidates/route.ts`)

Validates, rate-limits, calls the provider, validates the output, retries
exactly once, and returns `{ reactions, status: "ok" | "unavailable" }`.
Nothing else reaches the browser; causes go to the server log. Built from
injectable dependencies so tests drive it with a scripted provider.

## Hook (`lib/react/use-simulator.ts`)

Binds microphone, transcription and engine to React. Owned by the app shell
(`lib/react/simulator-session.tsx`), not the simulator page, so a session
survives navigation: leaving the simulator pauses it, and only Reset session
or a reload ends it. Every tick: `tick`,
then `pump` — ask the engine what it needs, fetch it, hand it back. One
request in flight at a time. Failures are silent in the UI by design.

## Harness (`scripts/simulate.ts`)

Runs a scripted session through the engine with the mock provider and
prints the chat log plus pacing health: rate, gap spread, length spread, AI
batches per minute by phase, slots that waited, lines dropped, and dry
ticks. `SIM_RATE=2 npm run simulate` for a tier; a bare number for a seed.

## Non-negotiables

- Randomness goes through `lib/engine/rng.ts`. Never `Math.random()`.
- The audio pipeline stays out of React.
- The scheduler is the only emission path.
- The key is server-side only. Never `NEXT_PUBLIC_`.
- Chat never dunks on the streamer. Slurs are dropped in every filter mode.
- No deterministic chat text. If it did not come from the model, it is the
  streamer's own directive token or nothing.
