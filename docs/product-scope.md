# Product scope

## What this is

An AI wrapper for a simulated Twitch chat.

The streamer presses Play. AI generates believable viewers and messages. The
chat flows continuously at the selected speed. Streamer speech or typed input
gives the AI new context. Prolonged silence causes AI-generated idle
conversation.

Built for two real people with low-viewership streams. Success is a manual
session where the chat feels continuously alive, contextually responsive,
varied, and recognisably like Twitch chat — and then goes into OBS.

## The one rule

**The AI writes every line chat says. Deterministic code decides everything
else.**

Deterministic code owns: timing, scheduling, rate limiting, who speaks,
usernames and colours, personalities, per-viewer memory and repetition rules,
emote selection, safety filtering, compact context construction, queue refill
timing, and the displayed viewer count.

The AI owns: wording and conversational content. It receives compact context
and returns structured lines with a little metadata (emotion, the feeling an
emote should carry, an optional emote by name, eagerness, and at the slow
tiers who is speaking). It never picks a timestamp or an image, and a name it
invents is dropped.

There is no deterministic fallback for chat text. If the AI is unavailable,
that batch is silent, the cause is logged server-side, and the next batch
tries again on its own. Nothing canned is ever shown as chat.

## Provider

One provider, one model:

| | |
|---|---|
| Provider | Google Gemini |
| Model | `gemini-3.5-flash-lite` |
| Key | `GOOGLE_API_KEY` in `.env.local` |

**Temporarily, for comparison only:** a dev switch in the control panel
sends batches to OpenAI `gpt-6-luna` (`OPENAI_API_KEY`) instead, and the
server log keeps a per-model scoreboard. Everything belonging to it is
marked `DEV-MODEL-TOGGLE`; once the owner picks a model, the loser and the
switch are deleted and this is one provider again.

Replies are streamed: each line reaches chat as the model writes it, about a
second after asking. No first line within five seconds is a hang and is
retried then.

## Phases

| Phase | Begins | Ends | What the AI is asked for |
|---|---|---|---|
| Startup | Play | first accepted input, or 5 min | early-arrival chat; one greeting per person, then chatter |
| Active | accepted mic or typed input, or a screen event | next input, or 5 min with no input and no screen event | reactions to what was said; continuations when the batch drains, drifting to general chatter after 60s |
| Idle | 5 min without input or screen event | next input or screen event | reactions to the silence, escalating through four stages |

Idle stages by silence: 5–8 min *the streamer is focused*; 8–12 min *the
streamer may be busy*; 12–20 min *is the streamer still there?*; 20+ min
*chat is entertaining itself*. Each stage is a different prompt, and a stage
change invalidates what was queued for the previous one.

New streamer input at any point: a reply still streaming about something
older is cut off, a few of its unsaid lines ride along behind the new
reply's first lines, and the new reply answers everything said since the
last one. Chat keeps a short memory of what was said in the last two
minutes and how much of it was answered, and circles back to what it barely
got to.

Talking without pausing is handed to chat in five-second pieces.

## Continuous chat

While running, the queue is never empty except while a request is in
flight, after a failed request (with a short backoff), or while paused or
reset. Batches are requested at a low-water mark, sized to about twenty
seconds of chat at the configured rate, and released one line at a time by
the scheduler. Four to six AI calls a minute at every tier. Never one call
per message.

If chat regularly goes silent while running, that is a bug.

A session survives leaving the simulator: going to settings pauses it.
Only **Reset session** or reloading the window ends it.

## Viewer identity

The room is **regulars plus strangers**. Regulars persist across streams
and are who the streamer comes to know; strangers pass through once.

| Tier | Regulars | Stranger share | Displayed viewers |
|---|---|---|---|
| ~0.2/sec | 3 | 0% | 3–11 |
| ~0.5/sec | 4 | 10% | 12–24 |
| ~1/sec | 6 | 70% | 25–180 |
| ~1.5/sec | 8 | 80% | 181–500 |
| ~2/sec | 10 | 85% | 501–1000 |
| CHAOS (4/sec) | 12 | 92% | 1001+ |

At the two slowest tiers chat is a conversation: the model is given the
regulars by name, each with their own typing habits and a short memory —
topics, their last lines, what the streamer said to them — and writes every
line as one of them. Saying a regular's name reaches that person. Above that
tier the model never sees a name.

Each regular carries: name, colour (fixed Twitch palette), personality,
typing habits sampled from real chats, an optional character in the
streamer's own words, and memory saved in the browser. `/settings/regulars`
edits all of it; pinned people are never rotated out. Names are words, or a
word and a number.

## Repetition rules

- A viewer never posts the same line twice in a session. Normalised, so
  `hey`, `heyyy`, `hey!!` and `KEKW KEKW KEKW` versus `KEKW` are one thing.
- A viewer greets once and says goodbye once per session, whatever the words.
- A speaking cooldown scales with the tier (about 30s slow, 1s at CHAOS),
  waived during a hype moment.
- At most three consecutive messages from one viewer, and at most three in
  any ten seconds.
- Different viewers may say the same thing. A pile-on is real.
- If nobody eligible can say a line, it waits, then moves to the back of the
  queue, then is dropped if still unsayable. A slot is delayed, never faked.

## Emotes

7TV packs are imported by channel. **An emote is posted because it fits,
never because it exists.**

One vocabulary of 35 meanings — 21 feelings (happy, love, hype, laugh,
shock, scared, relief, sad, comfort, angry, frustrated, disgust, cringe,
confused, sus, aura, respect, chill, crazy, troll, cope, bored/AFK), 7 chat
actions and 6 topics — shared by three things: the streamer's hand tags,
the reading of a name (`wideSpeedLaugh4` is laughter), and the feeling the
model gives each line. The streamer can add their own meanings with a
sentence saying what each is for; the model reads them.

The model is offered emotes grouped by meaning. Selection, first match wins,
the streamer's own tag before a name that merely suggests it:

1. what chat was told to post (`spam W`)
2. the line's own feeling, and the emote the model named only if it fits it
3. what is on screen, when capture is on
4. what the moment is, leaning sad after bad news
5. the line's coarse emotion, then mood
6. something tagged "anywhere", or no emote at all

An emote nobody tagged and whose name means nothing is never posted. After
bad news no laughing, trolling, hype, dance or freaky emote is posted. The
streamer's "never use this" and "never post it when the moment is…" come
before everything. Emote-only mode renders every line as emotes.

## Settings

Chat speed, emote-only mode, profanity mode and word lists, streamer name,
stream topic, timestamps. Screen capture (opt-in). Emote packs, tags,
custom meanings and rules. Regulars. OBS browser source.

## Explicitly out of scope for now

UI and dashboard redesign. OBS polish. Saved session settings.
Authentication. Security hardening for hosted deployment. Billing and
monetisation. SaaS deployment. A permanent second provider or a model
selector. Badges. Analytics. Marketing pages. Per-emote usage counts
(dropped by the owner: what matters is which emotes chat uses, not how
often).
