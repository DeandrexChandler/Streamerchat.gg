# CLAUDE.md — Engineering rules for StreamerChat.gg

## What this is

A simulated live chat for streamers with quiet chats. The streamer talks; a
simulated audience reacts in real time. Built to be genuinely used — the target
users are two real people with low-viewership streams, not a hypothetical
market.

Success is: start the app, open the simulator, turn on the mic, talk normally,
watch a believable chat react, and put that chat into OBS.

## Operating mode

You are the primary engineer on this project, not a tutor. Make engineering
decisions and act on them. Explain *significant architectural* choices briefly
so the owner can follow along — do not narrate routine work or explain what
every line does.

- Refactor aggressively when justified. Nothing here is sacred.
- Do not preserve a bad implementation because it already exists.
- Ask only when a decision genuinely changes what gets built and you cannot
  reasonably make the call yourself. Otherwise decide, state the decision, and
  keep moving.
- Do not generate documentation nobody asked for.
- Do not over-engineer. This is a monolith on purpose.

## The core architectural rule

**AI is a component inside the system, never the system itself.**

```
Microphone → Transcription → Classifier → Director → Scheduler → Renderer
                                             ↑
                              pools · templates · AI (~5%)
```

Deterministic code owns: timing, message frequency, usernames, colors, emote
selection, personalities, idle behaviour, scheduling, rate limiting, settings,
UI state, analytics.

AI is allowed only where language generation genuinely helps: novel phrasing
for unusual statements, occasional longer messages, and topping up variety when
the classifier is unsure. It refills a *candidate pool* that the scheduler
drains — it is never in the request path for "what is the next message".

Consequences that must stay true:
- The app runs fully, with good output, with **zero API keys set**.
- An AI outage degrades variety. It never stops chat.
- No AI call for anything a lookup table or a rule can decide.

## Avoid both failure modes

Replacing AI with thousands of hardcoded strings is the *other* failure mode.
Behaviour lives in data structures — weighted pools, personality profiles,
emote metadata, intent definitions — under `lib/data/`. Logic lives in
`lib/engine/`. Adding new chat behaviour should usually mean editing data, not
writing code.

## Layout

```
app/
  (shell)/         pages with app chrome — simulator, obs
  overlay/         OBS browser source; NO chrome, deliberately outside (shell)
  api/             server routes
lib/
  engine/          simulation: classifier, director, scheduler, population, rng
  engine/generators/  pool + template + ai tiers
  data/            response pools, personalities, usernames, emotes
  config/          zod-validated settings + storage adapter
  audio/           mic, VAD, utterance batching — plain classes, no React
scripts/simulate.ts  headless harness
```

## Non-negotiables

**Randomness goes through `lib/engine/rng.ts`, never `Math.random()`.** Seeded
RNG is what makes the engine testable and lets a weird session be reproduced.

**The audio pipeline stays out of React.** No `setState` at animation-frame
rate. The volume meter is driven through a DOM ref / CSS variable. If you find
yourself adding a ref to mirror state into a callback, the logic belongs in a
plain class instead.

**The scheduler is the only thing that emits messages.** It is the single choke
point for rate limiting and for the OBS transport. Nothing bypasses it.

**Never prefix a secret with `NEXT_PUBLIC_`.** That inlines it into the client
bundle. Any route that spends money is authenticated, rate-limited, and
size-capped.

**Chat never dunks on the streamer.** Viewers may be confused, derail, tease
*each other*, and be self-deprecating — that is what keeps it from sounding
like a corporate mascot. It never bites the broadcaster. Slurs are dropped in
every filter mode including "off"; "off" means "allow swearing", not "disable
safety". This output goes on someone's live broadcast.

## Testing

`npm test` must pass before anything is called done. Run `npm run simulate` to
eyeball pacing and message quality — it is faster and more honest than clicking
through the UI, and it needs no microphone.

Test the engine at its seams (classifier intents, scheduler timing and rate
limits, filter modes, weighted distributions), not React internals. When you
fix a realism bug, add a regression test for it — "chat repeated itself three
times" is a real bug and it should stay fixed.

Do not claim something works because it compiles. Run it.

## Current state

Done: repo audit; marketing/auth/analytics surface removed; routes flattened;
build green; simulation engine with population, classifier, director,
scheduler, filter, and pools; 119 tests; headless harness.

Next: audio pipeline (Web Speech default, Whisper fallback), simulator UI
rebuild, settings page, AI tier (Google Gemini), OBS transport via SSE.

Deliberately deferred: accounts and any database. The product has to work
end-to-end first.
