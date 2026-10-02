/**
 * Headless simulation harness.
 *
 * Feeds a scripted stream session through the engine with a virtual clock and
 * prints the resulting chat log. Lets us judge pacing and message quality
 * without a browser, a microphone, or a single React render.
 *
 *   npm run simulate                    # default seed
 *   npm run simulate -- 12345           # fixed seed, reproducible
 *   npm run simulate -- --channel=xqc   # import a channel's emotes
 *   npm run simulate -- --no-emotes     # skip emotes entirely
 *
 * Active chat is AI-only, so the harness supplies reactions from the mock
 * provider. That means the *wording* here is not what a real session produces
 * — it is fixed shapes — but everything the harness exists to judge (pacing,
 * gaps, who speaks, emote choice, repetition) is deterministic code and is
 * exactly what a real session does. No API calls, no quota.
 */

import { SimulationEngine } from "../lib/engine/engine";
import { createMockProvider } from "../lib/ai/mock";
import type { CandidateRequest } from "../lib/ai/provider";
import { readFileSync, writeFileSync } from "node:fs";
import { buildEmoteIndex, isEmoteOnly } from "../lib/data/emotes";
import {
  fetchChannelPack,
  fetchPopularPack,
  type EmotePack,
} from "../lib/emotes/seventv";
import type { Emote } from "../lib/engine/types";

/** [secondsIntoStream, whatTheStreamerSaid, micEnergy 0..1] */
const SCRIPT: Array<[number, string, number]> = [
  [2, "hey hey what's up everyone, welcome in", 0.5],
  [9, "okay so today we're gonna finish the base, I think", 0.4],
  [16, "chat what do you think, should I do the roof first or the walls?", 0.55],
  // Silence — idle chatter should escalate through its tiers here.
  [64, "okay yeah I'm just gonna do the roof", 0.35],
  [70, "oh no. oh no no no", 0.75],
  [74, "I can't believe I just did that, this is so annoying", 0.7],
  [82, "wait actually. actually hold on", 0.5],
  [88, "LET'S GO, got it, finally!", 0.95],
  [95, "okay look at this, look how it turned out", 0.6],
  // Another long gap.
  [150, "so yesterday something really funny happened at work", 0.45],
  [158, "I'm not even joking, my manager walked in", 0.5],
  [175, "alright I think that's it for today, thanks for hanging out", 0.4],
];

// Pick the first bare-number argument so the flags below can share argv.
const SEED =
  Number(process.argv.slice(2).find((a) => /^\d+$/.test(a))) || 20260825;
/**
 * Five minutes by default, an hour when asked.
 *
 * `SIM_SECONDS=3600 npm run simulate` is the soak: a long session is where
 * pacing drift, a queue that never recovers and anything that grows without
 * bound show up, and none of those are visible in five minutes. The script
 * repeats so the room is not simply left in idle for fifty-five of them.
 */
const DURATION_S = Number(process.env.SIM_SECONDS ?? 300);
const SCRIPT_PERIOD_S = 300;
const STEP_MS = 250;
/** Quiet the line-by-line log for long runs; the report is the point. */
const QUIET = DURATION_S > 900 && process.env.SIM_VERBOSE !== "1";

const CACHE = ".emote-harness-cache.json";

/**
 * Emotes for the harness.
 *
 * Cached to disk because CLAUDE.md values this harness as "faster and more
 * honest than clicking through the UI", and a ~1s network round-trip on every
 * invocation undercuts both and breaks it offline.
 */
async function loadEmotes(): Promise<readonly Emote[]> {
  const args = process.argv.slice(2);
  if (args.includes("--no-emotes")) return [];

  const channelArg = args.find((a) => a.startsWith("--channel="));
  if (channelArg) {
    const pack = await fetchChannelPack(channelArg.slice("--channel=".length));
    return pack.emotes;
  }

  try {
    const cached = JSON.parse(readFileSync(CACHE, "utf8")) as EmotePack;
    if (cached?.emotes?.length) return cached.emotes;
  } catch {
    // No cache yet, or it is corrupt. Fetch below.
  }

  try {
    const pack = await fetchPopularPack(150);
    writeFileSync(CACHE, JSON.stringify(pack));
    return pack.emotes;
  } catch {
    console.warn("Could not fetch emotes; running emote-free.");
    return [];
  }
}

/**
 * Everything below runs inside main() because emote loading is async and tsx
 * compiles this to CJS, which rejects top-level await.
 */
async function main() {
const EMOTES = await loadEmotes();

const engine = new SimulationEngine({
  seed: SEED,
  now: 0,
  emotes: EMOTES,
});
engine.updateSettings({ messagesPerSecond: Number(process.env.SIM_RATE ?? 1) });
engine.beginSession(0);

/**
 * Stands in for the AI tier, driven the way the app drives it: every tick
 * the engine is asked what it needs, and the answer is served on the spot.
 * Latency is a separate concern and not what this measures. Startup, active,
 * continuation and every idle stage all flow through this one call, exactly
 * as in the browser.
 */
const provider = createMockProvider();
let generations = 0;
const phases: Record<string, number> = {};
/** Ticks where nothing generated was waiting to be said. The silence metric. */
let dryTicks = 0;
let totalTicks = 0;

/** Simulated provider latency, ms. SIM_LATENCY=12000 for a bad Gemini day. */
const LATENCY_MS = Number(process.env.SIM_LATENCY ?? 0);
const landing: Array<{ at: number; ticket: number; request: CandidateRequest }> = [];

async function deliver(now: number): Promise<void> {
  while (landing.length > 0 && landing[0].at <= now) {
    const { ticket, request } = landing.shift()!;
    const result = await provider.generate(request);
    if (result.status === "ok" && result.reactions.length > 0) {
      engine.supplyReactions(result.reactions, now, ticket);
    } else {
      engine.generationFailed(now, ticket);
    }
  }
}

async function pump(now: number): Promise<void> {
  await deliver(now);
  const request = engine.nextGeneration(now);
  if (!request) return;
  generations += 1;
  const key = request.phase + (request.continuation ? "+" : "") + (request.idleStage ? request.idleStage : "");
  phases[key] = (phases[key] ?? 0) + 1;
  landing.push({ at: now + LATENCY_MS, ticket: engine.generationTicket!, request });
  await deliver(now);
}

const clock = (ms: number) => {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
    total % 60,
  ).padStart(2, "0")}`;
};

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

console.log(`${BOLD}=== headless simulation (seed ${SEED}) ===${RESET}\n`);

let scriptIndex = 0;
let cycleStart = 0;
/** Utterances actually fed in — the script repeats, so its length is not it. */
let spoken = 0;
const gaps: number[] = [];
let lastMessageAt: number | null = null;
const emitted: string[] = [];
/** Messages and heap per ten minutes, so drift has somewhere to show. */
const slices: Array<{ minute: number; messages: number; heapMb: number; mash: number; roster: number; queued: number; pending: number; kept: number }> = [];
let sliceMessages = 0;
let sliceIndex = 0;
const SLICE_MS = 600_000;

for (let now = 0; now <= DURATION_S * 1000; now += STEP_MS) {
  // The script repeats on a five minute loop, so a long run is a long
  // session rather than three minutes of talking and an hour of silence.
  if (scriptIndex >= SCRIPT.length && now >= cycleStart + SCRIPT_PERIOD_S * 1000) {
    cycleStart += SCRIPT_PERIOD_S * 1000;
    scriptIndex = 0;
  }

  while (
    scriptIndex < SCRIPT.length &&
    cycleStart + SCRIPT[scriptIndex][0] * 1000 <= now
  ) {
    const [, text, energy] = SCRIPT[scriptIndex++];
    spoken += 1;
    const outcome = engine.handleTranscript(text, now, energy);
    const c = outcome?.classification;
    if (!QUIET) console.log(
      `\n${DIM}${clock(now)}${RESET} ${BOLD}STREAMER:${RESET} ${text}` +
        `\n${DIM}          -> ${c?.intent} / ${c?.sentiment} ` +
        `| energy ${c?.energy.toFixed(2)} ` +
        `| conf ${c?.confidence.toFixed(2)} ` +
        `| kw [${c?.keywords.slice(0, 3).join(", ")}]` +
        `${outcome?.reacted ? "" : "  \u2014 IGNORED"}${RESET}\n`,
    );
  }

  await pump(now);
  if (engine.pendingReactions === 0) dryTicks += 1;
  totalTicks += 1;
  for (const message of engine.tick(now)) {
    emitted.push(message.text);
    if (lastMessageAt !== null) gaps.push(now - lastMessageAt);
    lastMessageAt = now;
    sliceMessages += 1;
    const tag = message.kind === "idle" ? `${DIM}(idle)${RESET} ` : "";
    if (!QUIET) {
      console.log(
        `${DIM}${clock(now)}${RESET} ${tag}${message.username}: ${message.text}`,
      );
    }
  }

  if (now >= (sliceIndex + 1) * SLICE_MS) {
    sliceIndex += 1;
    const live = engine.exportRoster();
    slices.push({
      minute: Math.round(now / 60_000),
      messages: sliceMessages,
      heapMb: process.memoryUsage().heapUsed / 1_048_576,
      mash: live.filter((v) => v.nameWords.length === 0).length,
      roster: live.length,
      // Engine-side depth, so heap growth can be attributed: the harness
      // itself keeps every line ever emitted, the product does not.
      queued: engine.stats().queued,
      pending: engine.stats().pending,
      kept: emitted.length,
    });
    sliceMessages = 0;
  }
}

const stats = engine.stats();
const avgGap = gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length);

console.log(`\n${BOLD}=== stats ===${RESET}`);
console.log(`messages:       ${stats.released} over ${DURATION_S}s`);
console.log(`rate:           ${(stats.released / (DURATION_S / 60)).toFixed(1)} msg/min`);
console.log(`avg gap:        ${(avgGap / 1000).toFixed(2)}s`);

// Gap distribution is the pacing health check. A chat where nearly every gap
// lands in one bucket reads as metronomic no matter how good the text is.
const buckets = { "<0.5s": 0, "0.5-1.5s": 0, "1.5-3s": 0, "3s+": 0 };
for (const gap of gaps) {
  if (gap < 500) buckets["<0.5s"]++;
  else if (gap < 1500) buckets["0.5-1.5s"]++;
  else if (gap < 3000) buckets["1.5-3s"]++;
  else buckets["3s+"]++;
}
console.log("gap spread:");
for (const [label, n] of Object.entries(buckets)) {
  const pct = (n / Math.max(1, gaps.length)) * 100;
  console.log(
    `  ${label.padEnd(10)} ${String(n).padStart(3)}  ${"#".repeat(Math.round(pct / 2))} ${pct.toFixed(0)}%`,
  );
}
console.log(`audience:       ${stats.audience}`);
console.log(`by source:      ${JSON.stringify(stats.bySource)}`);
console.log(`slots waited:   ${stats.slotsWaited} (a line was queued but nobody eligible could say it yet)`);
console.log(`lines dropped:  ${stats.linesDropped} (nobody in the room could ever say them)`);
console.log(`dry ticks:      ${dryTicks} of ${totalTicks} (${((100 * dryTicks) / Math.max(1, totalTicks)).toFixed(1)}%) — ticks with nothing queued to say`);
console.log(`latency:        ${LATENCY_MS}ms simulated, planner sizing against ${stats.latencyMs}ms`);
console.log(`AI batches:     ${generations} (${(generations / (DURATION_S / 60)).toFixed(1)}/min) ${JSON.stringify(phases)}`);

// Length distribution is the other pacing health check. Real chat is
// dominated by emotes and one-word reactions; a wall of 4-6 word statements
// reads as everyone competing to say something clever.
const lengths = { "emote/1 word": 0, "2-3 words": 0, "4-6 words": 0, "7-9 words": 0, "10+ words": 0 };
const emoteIndex = buildEmoteIndex(EMOTES);
for (const text of emitted) {
  const n = text.trim().split(/\s+/).length;
  // Emote spam is the shortest kind of message, however many tokens it has.
  if (n <= 1 || isEmoteOnly(text, emoteIndex)) lengths["emote/1 word"]++;
  else if (n <= 3) lengths["2-3 words"]++;
  else if (n <= 6) lengths["4-6 words"]++;
  else if (n <= 9) lengths["7-9 words"]++;
  else lengths["10+ words"]++;
}
console.log("length spread:");
for (const [label, n] of Object.entries(lengths)) {
  const pct = (n / Math.max(1, emitted.length)) * 100;
  console.log(
    `  ${label.padEnd(13)} ${String(n).padStart(3)}  ${"#".repeat(Math.round(pct / 2))} ${pct.toFixed(0)}%`,
  );
}
console.log(`ignored:        ${stats.ignored} of ${spoken} utterances skipped by the attention gate`);
console.log(`still queued:   ${stats.pending}`);

if (slices.length > 1) {
  /**
   * The soak report.
   *
   * A five minute run says whether the loop is alive. Only a long one says
   * whether it stays alive: whether the rate drifts, whether the queue
   * recovers, and whether anything grows that should not.
   */
  console.log("\nover time (per ten minutes):");
  for (const slice of slices) {
    const perMinute = slice.messages / (SLICE_MS / 60_000);
    console.log(
      `  to ${String(slice.minute).padStart(3)}min  ${perMinute.toFixed(1).padStart(6)} msg/min  ` +
        `heap ${slice.heapMb.toFixed(1).padStart(5)}MB  ` +
        `gibberish ${slice.mash}/${slice.roster}  ` +
        `engine queue ${slice.queued}+${slice.pending}  harness holds ${slice.kept}`,
    );
  }
  const first = slices[0];
  const last = slices[slices.length - 1];
  const drift = (last.messages - first.messages) / Math.max(1, first.messages);
  console.log(
    `  drift ${(100 * drift).toFixed(1)}% from the first ten minutes to the last; ` +
      `heap ${first.heapMb.toFixed(1)}MB -> ${last.heapMb.toFixed(1)}MB`,
  );
  // A name with no vocabulary behind it is a keyboard-mash or numeric
  // fallback — the shape a long session used to fill the room with.
  const roster = engine.exportRoster();
  const mash = roster.filter((v) => v.nameWords.length === 0);
  console.log(`  roster now: ${roster.map((v) => v.name).join(", ")}`);
  console.log(`  no-vocabulary names: ${mash.length}/${roster.length}${mash.length ? ` (${mash.map((v) => v.name).join(", ")})` : ""}`);
}
}

void main();
