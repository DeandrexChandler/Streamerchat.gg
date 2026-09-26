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

## 8. Chatters don't know their own names, or each other's — done

At the slow tiers the prompt carries the roster and every line comes back
with `"from"`. The engine matches a name in speech ignoring spacing and
punctuation, so "hi hazel irl" addresses hazelirl, and the prompt says who
was addressed. Verified live: hazelirl answered, milo894 replied to hazel
by name.

---

## 9. No memory: the same chatter keeps saying the same kind of thing — done

Each regular carries a short profile — topics, their last few lines, what
the streamer said to them — into the prompt, and it is saved to browser
storage so they come back tomorrow with it. The length rule also changes at
these tiers: mostly real sentences, about one line in four short, and no
stacked "valid" / "fair enough".

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

## 12. Measure cost against quality — partly done

The route now logs tokens per call and a running total, plus a cost figure
when `AI_PRICE_PER_M_INPUT` and `AI_PRICE_PER_M_OUTPUT` are set. Still to
do: read those numbers off a real session and decide whether the memory
prompt is worth its input tokens at each tier.

---

## 13. Screen-share privacy warning

Recorded in `docs/roadmap.md` (Phase 3). Listed here so it's not lost.

---

## 14. Chat still felt botted after names and memory — done

**Seen:** with names and memory in, the room still read as one voice.

**Cause:** every regular was described to the model by archetype label alone
— "chatty regular", "lurker" — so two of the same archetype were identical,
and the house style rules told the whole room to type the same way.

**Now:** each regular carries typing habits sampled once from ranges
measured off real chats. `npm run sample -- <channel> <secs> voices` reports
per-chatter traits; silky and ironmouse on 2026-09-23 gave median words
2.6 vs 6.0, emote-only 35% vs 42%, caps 29% vs 2%, punctuation 3% both,
stretched words 11% vs 0%. The ranges in `lib/data/voices.ts` sit between
the two, and the spread *within* a room is the point. The prompt asks for
those habits to stay consistent per person and says explicitly that they
are small habits, not accents.

Customisation is still to come: `/settings/regulars` is read-only, with a
"forget my regulars" reset.

