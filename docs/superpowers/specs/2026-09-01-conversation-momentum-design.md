# Conversation momentum: replacing the one-shot generation loop

**Date:** 2026-09-01
**Branch:** `feat/conversation-momentum`
**Status:** approved, not yet implemented

---

## 1. What causes the one-shot, sparse behaviour

Measured, not inferred. One utterance, then sixty seconds of ticks. Each digit
is the number of messages released in that second:

```
spam W                  total= 40  .1...11.1...22.1121..111.11..1
BRO I JUST BEAT IT      total= 38  1.1..221..11.111..11.1..11...1
im grabbing some water  total= 39  1.11.21111.11.11..11..11..11.1
chat what do you think  total= 35  .1...11.1...22..2..11..11.1..1
```

Those four profiles are interchangeable. A clutch win and fetching a glass of
water produce the same volume and the same shape, because **after roughly five
seconds what the streamer said is not represented anywhere in the system.**

Four causes, all structural.

### 1.1 Reaction generation is a single call

`directReaction()` runs once per utterance, asks `burstSize()` for a number
between 1 and 16, produces exactly that many messages, queues them, and
returns. Nothing retains the event. This is precisely the "streamer said
something → generate N → stop" model.

The only other producer is `directIdle()`, which is called with
`keywords: []` and generic pools. It is **structurally incapable** of
referring to what was said — so the trickle after second five is background
noise that has no idea an event occurred.

### 1.2 There is no conversation memory

The engine holds three persistent facts about speech — `previousIntent`,
`previousText`, `previousWasIgnored` — and none of them feed generation. There
is no topic, no momentum, no participant set. Nothing decays because nothing
persists.

### 1.3 The vocabulary cannot produce long messages

Of 357 pool entries: **254 (71%) are three words or fewer**, 17 are eight or
more, and **none exceed twelve**. Measured output over a session:

| words | share |
|---|---|
| 1–3 | **77%** |
| 4–7 | 19% |
| 8–12 | 4% |
| 13–20 | **0%** |
| 20+ | **0%** |

Mean: **2.5 words**. `ambient.ts` instructs editors "Keep entries to one or two
words." No depth system can emit a sentence that does not exist in the data.

### 1.4 The depth mix targets short, and so does the AI cap

`BASE_MIX` weights ambient 0.50 / light 0.28 / engaged 0.17 / invested 0.05 —
78% aimed at one to three words before anything else applies. Separately,
`validateCandidates` rejects any AI line over **12 words**, so the one tier
that could write a real sentence is forbidden from doing so.

---

## 2. The topic lifecycle and momentum model

A new layer, `lib/engine/topics.ts`, sits between the classifier and the
director. It owns the answer to "what is chat currently talking about, and how
much does it care".

```
transcript → classifier → TopicTracker → director → scheduler
                               ↑
                        momentum decay
```

### 2.1 Shape

```ts
interface Topic {
  id: string;
  startedAt: number;
  lastReinforcedAt: number;
  intent: Intent;
  sentiment: Sentiment;
  keywords: string[];
  /** What the streamer actually said, for callbacks and AI context. */
  utterance: string;
  /** Directive payload, when the streamer told chat to do something. */
  directiveTarget?: string;
  /** 0..1 at creation. Sets both peak intensity and lifetime. */
  seed: number;
  /** Viewers who have engaged, and how many times. */
  participants: Map<string, number>;
  messagesEmitted: number;
}
```

Current momentum is derived, never stored — a stored value drifts from the
clock and has to be reconciled on every read:

```
momentum(now) = seed * 0.5 ^ ((now - lastReinforcedAt) / halfLife)
```

### 2.2 Seeding

```
seed = INTENT_WEIGHT[intent]
     * (0.55 + 0.45 * energy)
     * (0.60 + 0.40 * confidence)
```

| intent | weight |
|---|---|
| directive | 1.00 |
| question_to_chat | 0.90 |
| achievement, excitement | 0.85 |
| struggle, showing | 0.60 |
| story, greeting, farewell | 0.50 |
| confusion | 0.45 |
| mundane | 0.20 |

Directives and direct questions get a floor of 0.75 regardless of energy: being
told to do something is interesting because it was addressed to chat, not
because it was shouted.

### 2.3 Bands

| band | momentum | behaviour |
|---|---|---|
| LOW | < 0.30 | a few short replies, quick fade |
| MEDIUM | < 0.55 | steady replies, some development |
| HIGH | < 0.80 | many participants, jokes, callbacks |
| VIRAL | ≥ 0.80 | most of chat participates, long tail |

### 2.4 Stages

Stage is a function of elapsed time, and governs *what kind* of message a topic
produces — this is what stops "spam W" from being a wall of identical Ws.

| stage | elapsed | character |
|---|---|---|
| `reacting` | 0–3s | reflexive, short, emote-heavy, high pile-on |
| `developing` | 3–12s | longer takes, opinions, jokes, replies to other viewers |
| `referencing` | 12s+ | callbacks, "still thinking about that", late arrivals |
| `fading` | momentum < 0.12 | occasional stragglers, then removal |

`halfLife = 8s + seed * 26s` — about 13s for background muttering, about 34s
for a clutch win. Reinforcement (see §5) resets `lastReinforcedAt`, so a topic
chat keeps feeding stays alive longer.

---

## 3. Scheduling and the messages-per-second target

### 3.1 The setting changes units

`chatSpeed` (a 0.25–12 multiplier labelled `~30/min`, top step `CHAOS`) is
replaced by `messagesPerSecond`, which the engine and the UI both use directly.

| step | label |
|---|---|
| 0.5 | ~1 message every 2 seconds |
| 1.0 | ~1 per second |
| 1.5 | ~1.5 per second |
| 2.0 | ~2 per second |
| 4.0 | Chaos — ~4 per second |

**Migration.** A stored blob carrying the old `chatSpeed` is mapped once
through a small table (0.5→0.5, 0.8→0.5, 1.2→1, 2→1.5, 3.5→2, 12→4) and the
old key dropped. Anything unrecognised falls back to the 1.0 default. Zod
already strips unknown keys, so a blob with neither parses cleanly.

`maxMessagesPerMinute` stops being a user-facing setting and becomes a derived
safety valve at `messagesPerSecond * 60 * 1.6` — headroom for bursts, still a
hard stop against a runaway producer.

### 3.2 The scheduler becomes a rate governor

Today the scheduler is a queue that drains on wall-clock offsets, with a
per-minute cap bolted on. Under momentum it becomes a **Poisson emitter**.

The instantaneous rate is the configured target scaled by how much is going on:

```
activity      = Σ momentum over active topics        (0 when nothing happened)
rateMultiplier = 0.45 + 1.15 * min(1.9, activity)
instantRate    = messagesPerSecond * rateMultiplier
```

Quiet chat runs at 45% of target; a single VIRAL topic runs at roughly 2.3×;
several concurrent topics saturate near 2.6×. Because high-momentum periods are
short relative to idle, **the long-run mean lands close to the target** — which
is the property §10 of the request asks for, and which the new tests assert
directly.

### 3.3 Jitter comes free

Inter-arrival gaps are drawn from an exponential distribution:

```
gap = -ln(U) / instantRate      // U ~ uniform(0,1]
```

This is the correct model for independent arrivals. It produces exactly the
0.8 / 1.2 / 0.9 / 1.1 texture the request describes, and its mean is
`1 / instantRate` by construction — so jitter costs nothing in rate accuracy.
No hand-tuned offset table is needed, and `burstOffsets()` is deleted.

Pile-on during `reacting` is expressed as a temporary rate spike rather than as
a pre-computed burst, so it interacts correctly with the rate limiter instead of
queueing behind it.

---

## 4. Deterministic generation versus AI

The engine stays deterministic-first. AI never decides *whether* a message
happens — only, sometimes, what it says.

### 4.1 Composition, not a bigger list

The fix for short messages is not one enormous file of sentences. Long output
is **composed** in `lib/data/composers.ts` from labelled fragments:

```ts
interface Composer {
  stages: Stage[];          // where it fits in a topic's life
  bands: Band[];            // and at what momentum
  personalities?: PersonalityId[];
  /** Slots: {kw} {user} {streamer} {topic} {emote} {target} {opener} {tail} */
  shape: string;
  length: LengthClass;
}
```

with fragment banks for openers ("bro", "nah", "ngl", "chat"), hedges
("i genuinely thought", "i swear"), intensifiers, tails ("💀", "😭", "fr"),
and callback frames ("still thinking about the {kw}").

A handful of shapes crossed with fragment banks, viewer personality, topic
keywords, the loaded emote set and other viewers' names yields a large space
from a small amount of data — which is the standing rule in CLAUDE.md that
behaviour lives in data structures, not in thousands of hardcoded strings.

`BASE_MIX` is rebalanced (roughly ambient 0.30 / light 0.26 / engaged 0.28 /
invested 0.16) and made stage-aware: `reacting` skews short, `developing` and
`referencing` skew long. Short lines stay useful — they are what a pile-on is
made of — they just stop dominating ordinary conversation.

### 4.2 When AI is invited

AI probability rises with the situation instead of being a flat 5%:

```
aiChance = aiShare
         * bandMultiplier      // LOW 0.5 · MEDIUM 1 · HIGH 2.2 · VIRAL 3.2
         * unusualMultiplier   // 1.8 when classifier confidence < 0.4
         * stageMultiplier     // developing/referencing 1.5, reacting 0.4
```

capped so AI can never exceed 35% of a topic's messages. The existing
`AiBudget` ceilings are untouched and still have the final say, so worst-case
spend is unchanged.

With no key the pools and composers carry everything. That is the acceptance
bar: the offline session must still read as a believable room.

---

## 5. Selecting among multiple active topics

Up to **three** concurrent topics, plus a permanent low-weight `ambient`
pseudo-topic so off-topic chatter, greetings and lurker noise never disappear.

**Reinforcement before creation.** A new utterance that overlaps an existing
topic — same intent and any shared keyword — reinforces it: `seed` is raised
toward the new value, `lastReinforcedAt` resets. Continuing to talk about the
same thing sustains one conversation rather than starting five.

**Eviction.** At capacity, the lowest-momentum topic is dropped. A directive or
a direct question is never evicted by a `mundane` topic.

**Per-message selection.** When the emitter decides a message happens, it picks
a topic weighted by momentum, with the ambient pseudo-topic weighted at a fixed
0.35. So at VIRAL most messages are on-topic and a minority are still someone
saying "what game is this tomorrow" — the interleaving §8 of the request asks
for.

**Participants.** Each topic tracks who has spoken in it. First-time speakers
are favoured while a topic is young (the room piling in), and repeat speakers
become likelier later (the same few people developing it). Viewers who never
join a topic simply lurk, which they already do.

---

## 6. Decay and disappearance

Momentum halves every `halfLife`. A topic is removed when it falls below
**0.12**, or when it exceeds **180 seconds** regardless.

The floor matters: without it, exponential decay leaves a topic technically
alive forever at a vanishing weight, cluttering selection and letting a
five-minute-old joke resurface.

`Scheduler.trimBeyond()` is removed. It exists to delete the tail of a burst
when the streamer speaks again — under momentum an older topic should *decay*,
not be deleted, and losing the tail was itself part of why chat felt like it
moved on instantly.

Because reinforcement resets the clock, a topic chat keeps feeding stays alive;
one nobody engages with fades on schedule.

---

## 7. Tests removed and replaced

### Removed — these assert behaviour we are deliberately abandoning

| test | why |
|---|---|
| `spreads a burst over time rather than dumping it at once` | there are no bursts |
| `scales the rate cap with chat speed` | multiplier is gone |
| `produces more messages at higher chatSpeed` | replaced by rate targeting |
| `holds the per-viewer cap at the highest chat speed` | CHAOS semantics gone |
| `keeps moving while the streamer talks continuously` | motion heuristic replaced by rate targeting |
| `keeps moving when the streamer talks quickly` | same |
| `still fills silence` | rewritten against the ambient pseudo-topic |
| scheduler burst-offset tests | `burstOffsets()` is deleted |

The directive and answer tests are **kept** but rewritten against sustained
topics rather than an 8-second window.

### New guarantees

**Rate.** Mean output over a five-minute session is within ±20% of
`messagesPerSecond`, at each of the five steps. Inter-arrival gaps show real
variance (standard deviation at least 40% of the mean) rather than a metronome.

**Momentum.** A high-seed event produces measurably more messages, over a
measurably longer window, than a low-seed one — the property the diagnosis
showed is currently absent. `BRO I JUST BEAT IT` must outlast
`im grabbing some water` by a wide margin.

**Decay.** Momentum halves within tolerance of its half-life; a topic is gone
within its expected lifetime; nothing survives 180 seconds.

**Concurrency.** Three topics coexist; a fourth evicts the weakest; a directive
is never evicted by background muttering. Messages interleave across topics
rather than draining one at a time.

**Length.** Mean words per message rises substantially from the measured 2.5,
messages of three words or fewer fall below 45% (from 77%), and 8+ word
messages appear regularly. Asserted as a distribution, never as a per-message
rule.

**Late reactions.** Messages attributable to a topic still arrive more than
fifteen seconds after it started.

**Deterministic fallback.** With no AI key and no network, a session still
produces varied output with no verbatim repeat inside the recent window.

**Bounded AI.** Even at VIRAL across a long session, AI-sourced messages stay
under the cap and `AiBudget` call ceilings are never exceeded.

---

## Order of work

1. `messagesPerSecond` setting, migration, UI, derived rate cap
2. `lib/engine/topics.ts` — tracker, momentum, stages, reinforcement, eviction
3. Poisson emitter in the engine; delete `burstOffsets` and `trimBeyond`
4. `lib/data/composers.ts` + fragment banks; stage-aware depth mix
5. AI invitation rules; raise the validator word cap
6. Rewrite the test suite around the new invariants

Each step keeps the suite green before the next begins.
