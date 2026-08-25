/**
 * Headless simulation harness.
 *
 * Feeds a scripted stream session through the engine with a virtual clock and
 * prints the resulting chat log. Lets us judge pacing and message quality
 * without a browser, a microphone, or a single React render.
 *
 *   npm run simulate            # default seed
 *   npm run simulate -- 12345   # fixed seed, reproducible
 */

import { SimulationEngine } from "../lib/engine/engine";
import { DEFAULT_EMOTES } from "../lib/data/emotes";

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

const SEED = Number(process.argv[2]) || 20260825;
const DURATION_S = 200;
const STEP_MS = 250;

const engine = new SimulationEngine({
  seed: SEED,
  now: 0,
  emotes: DEFAULT_EMOTES,
  settings: { audienceSize: 45, aiShare: 0 }, // aiShare 0 = fully offline run
});

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
const gaps: number[] = [];
let lastMessageAt: number | null = null;

for (let now = 0; now <= DURATION_S * 1000; now += STEP_MS) {
  while (
    scriptIndex < SCRIPT.length &&
    SCRIPT[scriptIndex][0] * 1000 <= now
  ) {
    const [, text, energy] = SCRIPT[scriptIndex++];
    const classification = engine.handleTranscript(text, now, energy);
    console.log(
      `\n${DIM}${clock(now)}${RESET} ${BOLD}STREAMER:${RESET} ${text}` +
        `\n${DIM}          -> ${classification?.intent} / ${classification?.sentiment} ` +
        `| energy ${classification?.energy.toFixed(2)} ` +
        `| conf ${classification?.confidence.toFixed(2)} ` +
        `| kw [${classification?.keywords.slice(0, 3).join(", ")}]${RESET}\n`,
    );
  }

  for (const message of engine.tick(now)) {
    if (lastMessageAt !== null) gaps.push(now - lastMessageAt);
    lastMessageAt = now;
    const tag = message.kind === "idle" ? `${DIM}(idle)${RESET} ` : "";
    console.log(
      `${DIM}${clock(now)}${RESET} ${tag}${message.username}: ${message.text}`,
    );
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
console.log(`still queued:   ${stats.pending}`);
