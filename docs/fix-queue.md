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

## 10. The lowest speed is locked at one pace — done

Saying something chat would pile onto now lifts the rate for eight seconds
and decays back: a directive, excitement, a question to chat, a greeting,
or anything with a sentiment ("im sad" classifies as mundane, which is why
intent alone was not enough). The lift is inverse to the tier —
`burstFactorFor` in `lib/engine/roster.ts`, about 3.75x at 0.2/sec and 1.2x
at CHAOS — with one burst per twenty seconds so a talkative minute is not
one long burst.

Measured at 0.2/sec: about 6 lines in the first five seconds against 1.5
for an ordinary line, back to the tier by twenty seconds. A talkative
minute of hot lines lands around 38 messages rather than 49 uncapped.

Also: the first line of a reply now goes out the moment the batch lands
rather than on the next slot, which at this tier was up to five more
seconds on top of the round trip (measured mean 0.3s, was 2.4s).

Calls per minute are unchanged — the burst makes the batches bigger, not
more frequent.

---

## 11. Hot word "screen" forces a screenshot — done

Saying or typing the bare word "screen" sends a frame and pulls a small
batch to the front, the same path a big on-screen change uses, with its own
prompt: the model is told the streamer is pointing at the screen rather
than that something moved.

Decided with the owner:
- **Bare "screen" only.** "screenshot" and "screens" are ordinary words.
- **Twenty second cooldown** (`SCREEN_WORD_COOLDOWN_MS`). Each use is one
  extra call carrying an image; twenty seconds caps a spammed word at three
  extra calls a minute. It also counts as a motion trigger, so the watcher
  cannot spend a second call on the same picture.
- **During the cooldown the word is ignored**, not queued: chat reacting to
  a screen that has moved on is worse than not reacting.
- **Capture off says so** rather than asking about an image that will not
  exist. Turning capture on needs a click; browsers will not let speech
  start a screen share.

The transcript panel is where the cooldown lives, since a limit nobody can
see is indistinguishable from the feature being broken: the word is blue
when it fired ("chat is looking — ready again in 16s"), grey when it did
not ("too soon — ready in 16s", or "screen capture is off"). The clock
ticks once a second and stops itself when nothing is counting down.

It also fires on a line the attention gate would otherwise ignore: "screen"
is an instruction, not chatter.

---

## 12. Measure cost against quality — done

The route logs tokens per call and a running total, plus a cost figure when
`AI_PRICE_PER_M_INPUT` and `AI_PRICE_PER_M_OUTPUT` are set.

**Measured, 2026-10-06**, one live session slightly longer than usual: 109
calls, 108,542 input and 197,762 output tokens. At $0.30 / $2.50 per million
for `gemini-3.5-flash-lite` that is **$0.53**, about **$0.90–1.90 an hour**
depending on speed (3 to 6.5 calls a minute).

- **Output is 94% of the cost** — about 1,800 tokens back per call against
  1,000 sent. The roster and memory sent to the model are in the cheap half,
  so they stay.
- **The lever, if cost ever matters:** most of the output is the JSON
  wrapped around each line rather than the chat itself. `kind` is asked for
  on every line and only read by the diagnostics log. Dropping it and
  shortening keys could plausibly cut a third to a half. Not worth doing at
  these prices; recorded so it is not rediscovered.

---

## 13. Screen-share privacy warning — done

While capture is on, the control panel says it plainly: screenshots go to
Google, share the game window rather than the whole screen, keep messages
and email out of it. Only while it is actually happening — a hover hint on
a toggle is not a warning anyone reads. The toggle's own hint now names
Google too.

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

---

## 15. Remove the "messages kept on screen" setting — done

Gone from the OBS settings page (it was there, not under Appearance, which
is still an empty placeholder) and out of the browser-source URL. The
overlay keeps a fixed 50 lines, which exists only so the DOM cannot grow
over a long stream — how much chat is visible is a function of how tall the
OBS source is. A `max=` left in a URL already pasted into OBS is ignored
rather than breaking.

---

## 16. Customise the regulars — done

`/settings/regulars` is now an editor: rename someone, change their
archetype, drag their typing habits, clear what they remember, delete them,
add someone new (up to twelve). Every change writes straight through — no
Save button.

- **A free-text character per person**, in the streamer's own words, passed
  to the model ahead of everything measured: "streams at 3am, always
  hungry, hates the roof build". This is the one thing trait ranges cannot
  produce.
- **Anyone edited is pinned.** They are never rotated out by churn, they
  are kept first when a faster tier has fewer seats than there are saved
  people, and a running session writing its roster back cannot overwrite
  them — `localRosterStore.save` merges, keeping the edited identity and
  taking only memory and last-spoken from the session.
- Changes apply at the next Play, which the page says.

**Pinning is its own control**, not a side effect of editing: a pin button
on every card, so a generated regular who turned out well can be kept
without changing a thing. "Made by you" marks the ones the streamer
created. Username colour is a row of the Twitch palette.

Still generated by default: nothing has to be edited for the room to work.

---

# Phase 1 review — 2026-09-30

Audit before starting Phase 2. Roadmap checklist complete except the
owner's manual sign-off; no TODOs; 661 tests passing at the time.

Checked and fine: no unbounded growth over a long session (release times,
ticket map, transcript log, message buffer and wave tracking are all
bounded or cleared).

## 17. Emotes rendered as plain text in OBS — done

**Seen in the code, not on stream:** `ChatLine` resolves emote names
against a pack it is handed, and the overlay handed it an empty list. The
simulator showed images; the browser source showed the word "KEKW". Since
success is "and then goes into OBS", this was Phase 1.

**Cause:** packs live in the streamer's browser storage, and OBS is a
different browser that has never seen them.

**Now:** the simulator sends names and URLs over the existing relay, once
per change and again when a new source attaches. The hub retains the last
pack per key and replays it to a source that connects later, which is
every OBS scene switch. Verified against a running server: a source
attaching after the pack was published receives it before any chat.

## 18. Spend caps could silence chat — done

Ten calls a minute was reachable at a fast tier with capture on plus hot
words, and the refusal is silent by design. Raised to twenty a minute and
nine hundred an hour.

## 19. A missing key looked exactly like working — done

Settings now checks the key when the page is opened. Never on the
simulator, never mid-stream.

## 20. A long session filled the room with gibberish names — done

**Found by the soak**, not by a person: an hour at CHAOS ended with a
roster of `wizngq, whmihs, zwgag, wwqqg, supu, qdwai, ndkj, jtna`.

**Cause:** the keyboard-mash style consumes no vocabulary, so it is the one
style that still passes the "fresh words" pass once the word lists empty —
and they empty fast, because thousands of strangers an hour each took a
word or two and never gave them back.

**Now:** each cohort holds at most about 15% mash names
(`MASH_NAME_SHARE`), churn clears the excess when the room shrinks around
them, and a stranger scrolling off the ring returns their vocabulary. Their
*name* stays taken, same as a departed regular — one handle is one person.

Measured after 4,000 strangers: 7/12 regulars gibberish before, 2/12 after,
and an hour at CHAOS now holds at 1/8.

## Soak test — one hour per tier, mock provider

| tier | rate | drift over the hour | dropped | dry ticks | AI calls |
|---|---|---|---|---|---|
| 0.2/sec | 18.5 msg/min | -5.1% | 0 | 0.2% | 3.3/min |
| 1/sec | 77.2 msg/min | +5.9% | 0 | 0.1% | 3.6/min |
| 4/sec | 295.5 msg/min | -1.4% | 0 | 0.4% | 6.3/min |

The engine's queue stays between 18 and 69 lines all hour at CHAOS while
the harness's own log of every line grows to 17,730 — so the heap growth in
a long run is the harness, not the product. `SIM_SECONDS=3600 npm run
simulate` runs it; the script repeats on a five minute loop so an hour is a
session rather than three minutes of talking and fifty-seven of silence.

---

# Live session 3 — 2026-10-04, about 30 minutes

## 21. Regulars filled chat at the higher speeds — done

## 22. Unique chatters did not match the viewer count — done (the owner's model)

Measured in the engine: ten regulars at 2/sec were each posting about ten
lines a minute, and because strangers post once and vanish, the only names
ever seen twice were the regulars. Real chat, sampled for eight minutes each
from four live channels between 1.2 and 3.2 messages a second:

| channel | rate | unique names | top-10 share | busiest person |
|---|---|---|---|---|
| sodapoppin | 1.2/s | 253 | 25% | 3.1/min |
| agent00 | 1.7/s | 269 | 22% | 5.2/min |
| silky | 1.9/s | 296 | 23% | 4.4/min |
| jynxzi | 3.2/s | 588 | 11% | 2.9/min |

Real chat also has a large middle — 25 to 80 people posting a few times each
carry about half of it — which this engine does not model. The owner chose
to keep regulars plus one-off strangers and turn the regulars down, fully
blended at CHAOS, rather than add a returning crowd.

Now: stranger share 70% / 80% / 85% / 92% at 1 / 1.5 / 2 / 4 per second.
Busiest regular measured at ~7 / 4.4 / 3.4 / 2.6 lines a minute; regulars'
share ~20% / 13% / 11% / 5%. The slow conversational tiers are unchanged.

Trade-offs to watch:
- Unique names per minute are now well above real chat at the fast tiers
  (~200 at 2/sec against real ~37–73), because every stranger is new. The
  returning-crowd model would land closer; recorded here if variety starts
  to read as a firehose.
- The fast tiers run ~7% quicker than before, because strangers never wait
  on a cooldown and fewer slots go unfilled (CHAOS ~320 msg/min, was ~300).

## 23. Keyboard-mash usernames still appeared — done

ujmgfwi, vldykh, sidygxm, wjgxh, after the cap from item 20. The style is
removed outright: names are words, or a word and a number.

## 24. Transcription needs work

**Owner's note:** transcription needs work. Not yet broken down into
specific symptoms — the next live session should note what goes wrong
(missed sentences, wrong words, slow to appear, cut off mid-sentence,
stops entirely).

**Now:** the browser's own speech recognition (`lib/transcription/web-speech.ts`).
Free and low-latency, but:

- Chrome and Edge only.
- Chrome ends recognition on its own after silence and periodically
  regardless; the provider restarts itself with backoff. A gap or a lost
  phrase around a restart is plausible.
- Trained on formal speech, so slang, names and gamer words come out
  wrong. `lib/transcription/slang.ts` repairs a short, deliberately
  conservative list ("low key" to "lowkey", "n g l" to "ngl"), and the
  prompt tells the model the text is imperfect. Regular names are matched
  ignoring spacing ("hazel irl").
- English only (`en-US`).
- Whatever it hears passes through the attention gate, which can still
  decide a sentence is not worth reacting to. Typed input never is.

**Shape of the fix:** first, list what actually goes wrong in a real
session, since the cause differs per symptom. Options already discussed:
a hosted speech-to-text service (better accuracy and custom vocabulary,
costs money per minute, adds a round trip), or keeping the browser
recogniser and widening the repair list and name matching. Measure cost
and latency before choosing — this is the input every reaction depends on.

---

## 25. Talking without breaks stops chat responding properly

**Seen (owner, live):** speaking normally and continuously, with no real
pauses, and chat stops responding properly to what is being said.

**Not investigated yet.** Likely causes to check first, each with a
different fix:

- **No final transcript.** The browser only marks speech as final at a
  pause (`isFinal` in `lib/transcription/web-speech.ts`). Talking straight
  through can leave it all as in-progress text that never reaches the
  engine, so chat has nothing new to answer.
- **One huge transcript.** When it does finalise, a long run-on can arrive
  as a single utterance, and the reply is to the whole paragraph rather
  than to what was just said.
- **Replies superseding each other.** Every accepted sentence makes the
  reply already in flight out of date and queues another; fast enough,
  chat ends up a round trip behind and answering old lines
  (`supplyReactions` / `freshReply` in `lib/engine/engine.ts`).
- **The attention gate's fatigue damper.** A lot of recent speech makes the
  gate more likely to skip a sentence as not worth reacting to
  (`recentVolume` in `lib/engine/attention.ts`).

**First step:** reproduce it with the transcript panel open — whether lines
appear late, as one block, or appear and get marked IGNORED tells which of
these it is. Related to item 24.


---

## 26. Leaving the simulator wiped the session — done

**Seen (owner):** going to settings, or anywhere else in the app, and back
reset the simulator: chat, the transcript and the running session all gone.

**Cause:** the whole session — engine, chat, transcript, mic — lived inside
the simulator page, and Next unmounts a page on navigation.

**Now:** the session is owned by the app shell (`lib/react/simulator-session.tsx`),
which outlives navigation. Leaving the simulator pauses chat and releases
the mic, as Pause does; coming back finds it paused with everything kept,
and Play carries on. Settings changed while away are read in on return.
The only ways to end a session are **Reset session** (the old Clear chat
button, renamed) and reloading the window.

- **Regulars edited mid-session apply after Reset session.** The running
  session keeps the room it started with. A session's roster write-back
  would otherwise delete someone just added or bring back someone just
  removed, so it stops writing once the regulars are edited
  (`revision` in `lib/config/roster-store.ts`).
- Reset session now also zeroes the viewer and message counters, which it
  used to leave showing the old session's numbers.
- Verified in the running app with the provider stubbed: chat and
  transcript survive a trip to settings and back, no AI calls while away,
  Resume continues, Reset wipes it all.
