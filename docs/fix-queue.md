# Fix queue

Items 1–7 come from a five-minute live session on 2026-09-20. Items 8–13
come from a live session on 2026-09-22. Work through them one at a time, in
whatever order the owner picks.

Each entry records what was seen, what the code does now, and where it
lives — so picking one up later does not mean re-deriving it.

---

## 1. No way to mute the mic while chat keeps going — done

A mic button beside the mic meter in the control panel: its ring moves with your voice while
live, and it turns red with a struck-through mic when muted. It releases the microphone the same
way Pause does (recording indicator off) while chat, typed input, idle and
screen events carry on. Stays muted across Pause, Play and Clear until
switched back; unmuting reopens the mic only while chat is running.

---

## 2. "Watch my screen" is far too slow to respond — done

Where the time went, worst case about 20–30s from a death to chat noticing:
up to 12s of trigger cooldown, waiting for any refill already on the wire,
a full-size batch (~4s), and then its lines appended *behind* a queue of up
to 24s of chat about whatever came before.

Now: the screen batch is small (6–12 lines, measured 1.2–2.6s against
3.9–4.1s for 30), goes to the front of the queue, drops a routine refill
that was in the way, and the prompt leads with "something just changed on
screen". Cooldown 12s → 8s. It also works before the streamer has said
anything, once the arrival wave is out. Expected event-to-first-line: about
2–3 seconds.

Not done: a streaming/realtime model (what Cluely-style tools use). That is
a second Gemini model and breaks the one-model rule; revisit only if 2–3s
still feels slow live.

---

## 3. Capture on a hotkey rather than continuously — dropped

Makes reactions later, not sooner. Recorded in the roadmap's deferred list,
along with a screen-share privacy warning for Phase 3.

---

## 4. One chatter posting four times in a row, replying to themselves — done

- Cause of the self-replies: in a developing topic the director brought back
  a past participant without the speaking cooldown, so whoever just spoke
  was often next, on lines that build on each other. Returning voices now
  sit out their cooldown like everyone else.
- `MAX_CONSECUTIVE` 5 → 3.
- Rolling cap: no viewer posts more than 3 lines in 10 seconds, in a row or
  not (`MAX_POSTS_IN_WINDOW`, `POST_WINDOW_MS` in `lib/engine/roster.ts`).
  Free again once the window passes.
- The sampler now reports back-to-back share, longest run and most lines by
  one person in 5s. caseoh_ (803 lines) and valkyrae (17 lines, 4 chatters):
  0% back to back, at most 3–5 in 5s.
- Not done: the model marking which line answers which. Revisit if a
  question and its answer still land on one name a few lines apart.

---

## 5. Idle mode arrives far too early — done

- Idle stages now at 5 / 8 / 12 / 20 minutes (were 1 / 2.5 / 5 / 10).
- After a minute on the streamer's last line, continuations drift to normal
  stream chatter — the game, each other, small talk — and never mention the
  quiet (`DRIFT_AFTER_S` in `lib/ai/prompt.ts`).
- With capture on, a screen event resets the idle clock. Idle only comes
  when the streamer and the screen are both quiet.

---

## 6. Remove the Emotes toggle — done

The setting and toggle are gone. An empty pack is the only way to turn
emotes off.

---

## 7. Remove the default emote list — done

No first-run import. A fresh install is pure text until a pack is imported
from the emotes page; the banner in the simulator says so.

---

# Session 2 — 2026-09-22: the lowest speed setting

**Main focus.** The lowest setting (0.2/sec) is not just "slower chat". It
is where the streamer has a personal conversation with a few people who
feel real, the way people talk to ChatGPT. The fixed usernames exist for
this. Today the names are stable but the people behind them are not. Memory
is the biggest gap.

Nothing here is started.

---

## 8. Chatters don't know their own names, or each other's

**Seen:** the streamer says "hi hazel irl". hazelirl doesn't know it's being
addressed, and chat answers "i hope whoever you're talking about is good".

**Now:** the model never sees usernames. The prompt asks for "N separate
messages from N different viewers" (`opening()` in `lib/ai/prompt.ts`), and
the engine gives each line to a viewer afterwards (`directOne` in
`lib/engine/director.ts`). No line is written *as* anyone, so nobody can
answer to their name. The classifier has no idea of usernames, and speech
recognition will mangle them ("hazel irl" for `hazelirl`).

**Shape of the fix:** the roster goes into the prompt, and the model writes
each line for a named viewer, so the engine assigns speakers from what the
model chose rather than picking them itself. Names are matched loosely
against the transcript (spacing, homophones), so an addressed viewer
answers first and everyone else knows who was meant. This changes the core
split in CLAUDE.md (the engine owns who speaks) for this case, so it needs
a decision before it's built. Probably only at the low tiers, where the room
is 3–4 regulars.

---

## 9. No memory: the same chatter keeps saying the same kind of thing

**Seen:** one chatter keeps saying "fair enough", "valid", "truuue". Never
back to back, but it's the same empty agreement every time, with no sense
that this person remembers anything said earlier in the stream.

**Now:** per-viewer memory is only the list of exact lines they have said
(`Population.remember` / `hasSaid`), used to stop exact repeats. It never
reaches the model. Personalities (`lib/data/personalities.ts`) steer
activity, verbosity and emote use. They never become a voice in the prompt.
The prompt also asks for half the lines to be one to three words
(`RULES` in `lib/ai/prompt.ts`), which is where "valid" / "fair enough"
come from. At 0.2/sec a batch is about 10 lines, so half are filler.

**Shape of the fix:** at the low tiers, each regular carries a short
profile into the prompt: who they are, what they've said and asked this
stream, running jokes, what they think of the streamer. Short lines should
be much rarer at 0.2 than at CHAOS. The model writes as each person, so
recurring people sound like recurring people. Ties into item 8.

---

## 10. The lowest speed is locked at one pace

**Seen:** at 0.2/sec, saying something that should light chat up ("I'm
sad", "spam W", "Hello?") gets the same slow trickle. It feels robotic.

**Now:** a burst exists but is small. The rate is the setting ×
`(RATE_FLOOR 1 + RATE_GAIN 1.2 × topic activity capped at 1.9)`
(`effectiveRate` in `lib/engine/engine.ts`), which tops out near 0.66/sec
at the lowest tier. The first lines also wait on the provider round trip.

**Shape of the fix:** a short, sharp burst on directive, emotional and
question intents at the low tiers: several lines in the first few seconds,
then back to baseline. Maybe let the first reply skip the normal gap
entirely.

---

## 11. Hot word "screen" forces a screenshot (general setting, all speeds)

**Seen / wanted:** saying a hot word like "screen" should send a screenshot
to chat right away, for an immediate reaction to what the streamer is
looking at.

**Now:** a screenshot goes out only with batches, and a screen batch fires
only when the picture changes a lot (`SCREEN_EVENT_THRESHOLD` in
`lib/react/use-simulator.ts`, `screenEvent` in the engine). Nothing in
speech triggers it.

**Shape of the fix:** the classifier spots the hot word and the engine
treats it as a screen event with the streamer's words attached, skipping
the cooldown. Needs capture on. If capture is off, it could ask to turn it
on. The hot word list should probably be a setting.

---

## 12. Measure cost against quality before redesigning

**Why:** items 8 and 9 put names, profiles and memory into every prompt,
which costs more input per call. The owner wants to go back to the drawing
board on cost versus quality rather than guess.

**Now:** `gemini-3.5-flash-lite`, about 4–5 calls a minute at every tier,
`maxOutputTokens` 4,000, one frame roughly 260 input tokens. No per-session
cost figure exists anywhere.

**Shape of the fix:** log input/output tokens per call on the server, add
a cost-per-hour line to the session trace, then compare a memory-heavy
prompt at 0.2/sec against today's. A low tier makes few lines, so richer
prompts may cost little in absolute terms. Measure before deciding.

---

## 13. Screen-share privacy warning

Recorded in `docs/roadmap.md` (Phase 3). Listed here so it's not lost.

