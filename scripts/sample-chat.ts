/**
 * Samples a real Twitch chat and prints the numbers the engine is tuned to.
 *
 * The engine's ratios — how many messages are emote-only, how many are one
 * or two words, how fast chat moves — were picked by taste. This replaces
 * taste with measurement from a real channel.
 *
 *   npm run sample -- caseoh_            # ten minutes, then the report
 *   npm run sample -- caseoh_ 120        # two minutes
 *   npm run sample -- caseoh_ 600 keep   # also write the raw lines
 *
 * Read-only and anonymous: Twitch's IRC bridge accepts a `justinfan` nick
 * with no token and no account, which is the same access a logged-out
 * viewer has. Nothing is sent, nothing is stored unless `keep` is passed,
 * and no message text ever reaches the product — the output is a
 * distribution, not a pool of lines to replay.
 */

import { writeFileSync } from "node:fs";

const channel = (process.argv[2] ?? "caseoh_").toLowerCase().replace(/^#/, "");
const seconds = Number(process.argv[3] ?? 600);
const keepRaw = process.argv.includes("keep");

const IRC = "wss://irc-ws.chat.twitch.tv:443";

interface Line {
  at: number;
  user: string;
  text: string;
  /** Emote ranges Twitch itself tagged, so emote detection is not guesswork. */
  emoteChars: number;
}

const lines: Line[] = [];
const started = Date.now();

/**
 * IRCv3 tags carry `emotes=id:start-end,.../...`, which is Twitch telling us
 * exactly which characters render as an image. Third-party emotes (7TV, BTTV)
 * are not tagged and land in the word heuristic below instead.
 */
function taggedEmoteChars(tags: string): number {
  const field = /(?:^|;)emotes=([^;]*)/.exec(tags)?.[1];
  if (!field) return 0;
  let chars = 0;
  for (const spec of field.split("/")) {
    for (const range of (spec.split(":")[1] ?? "").split(",")) {
      const [from, to] = range.split("-").map(Number);
      if (Number.isFinite(from) && Number.isFinite(to)) chars += to - from + 1;
    }
  }
  return chars;
}

/** A word that is probably an emote: no vowels, or CamelCase, or all caps. */
function looksLikeEmote(word: string): boolean {
  if (word.length < 2 || word.length > 25) return false;
  if (!/^[A-Za-z0-9_]+$/.test(word)) return false;
  return (
    /^[A-Z0-9]+$/.test(word) ||
    /^[a-z]+[A-Z]/.test(word) ||
    !/[aeiou]/i.test(word)
  );
}

function report(): void {
  const total = lines.length;
  if (total === 0) {
    console.log("No messages captured. Is the channel live?");
    return;
  }

  const elapsed = (Date.now() - started) / 1000;
  let emoteOnly = 0;
  let short = 0;
  let long = 0;
  let questions = 0;
  let mentions = 0;
  const wordCounts: number[] = [];
  const perUser = new Map<string, number>();
  const seen = new Map<string, number>();
  let repeatedByOwner = 0;

  for (const line of lines) {
    const words = line.text.trim().split(/\s+/).filter(Boolean);
    const wordy = words.filter((w) => !looksLikeEmote(w));
    const allEmote = line.emoteChars >= line.text.trim().length - 2 || wordy.length === 0;

    if (allEmote) emoteOnly += 1;
    else if (wordy.length <= 3) short += 1;
    else long += 1;

    wordCounts.push(words.length);
    if (line.text.includes("?")) questions += 1;
    if (line.text.includes("@")) mentions += 1;
    perUser.set(line.user, (perUser.get(line.user) ?? 0) + 1);

    const key = `${line.user}:${line.text.toLowerCase().replace(/\s+/g, " ").trim()}`;
    if (seen.has(key)) repeatedByOwner += 1;
    seen.set(key, line.at);
  }

  const pct = (n: number) => `${((100 * n) / total).toFixed(1)}%`;
  const sorted = [...wordCounts].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const speakers = [...perUser.values()].sort((a, b) => b - a);
  const topTen = speakers.slice(0, 10).reduce((a, b) => a + b, 0);

  console.log(`\n=== #${channel} — ${total} messages over ${Math.round(elapsed)}s ===`);
  console.log(`rate            ${(total / (elapsed / 60)).toFixed(1)} msg/min  (${(total / elapsed).toFixed(2)}/sec)`);
  console.log(`emote-only      ${pct(emoteOnly)}`);
  console.log(`1-3 words       ${pct(short)}`);
  console.log(`4+ words        ${pct(long)}`);
  console.log(`median words    ${median}`);
  console.log(`questions       ${pct(questions)}`);
  console.log(`@mentions       ${pct(mentions)}  (viewer-to-viewer)`);
  console.log(`unique chatters ${perUser.size}`);
  console.log(`top 10 chatters ${pct(topTen)} of all messages`);
  console.log(`same user, same line twice  ${pct(repeatedByOwner)}`);

  const buckets = [1, 2, 3, 4, 6, 9, 15];
  console.log("\nlength spread:");
  let previous = 0;
  for (const edge of [...buckets, Infinity]) {
    const n = wordCounts.filter((w) => w > previous && w <= edge).length;
    const label = edge === Infinity ? `${previous + 1}+` : `${previous + 1}-${edge}`;
    console.log(
      `  ${label.padEnd(6)} ${String(n).padStart(5)}  ${"#".repeat(Math.round((60 * n) / total))} ${pct(n)}`,
    );
    previous = edge === Infinity ? previous : edge;
  }

  console.log("\nCompare against the engine's current targets:");
  console.log("  emote-only 15%   1-3 words 27%   4+ words 58%   (normal talk)");

  if (keepRaw) {
    const file = `chat-${channel}-${Date.now()}.jsonl`;
    writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n"));
    console.log(`\nraw lines → ${file}`);
  }
}

const socket = new WebSocket(IRC);

socket.addEventListener("open", () => {
  // Anonymous read-only login. No token, no account, nothing sent to chat.
  socket.send("CAP REQ :twitch.tv/tags");
  socket.send(`NICK justinfan${Math.floor(Math.random() * 80000) + 1000}`);
  socket.send(`JOIN #${channel}`);
  console.log(`listening to #${channel} for ${seconds}s...`);
});

socket.addEventListener("message", (event) => {
  for (const raw of String(event.data).split("\r\n").filter(Boolean)) {
    if (raw.startsWith("PING")) {
      socket.send("PONG :tmi.twitch.tv");
      continue;
    }
    const match = /^(?:@(\S*) )?:(\w+)!\S+ PRIVMSG #\S+ :(.*)$/.exec(raw);
    if (!match) continue;
    const [, tags = "", user, text] = match;
    lines.push({ at: Date.now(), user, text, emoteChars: taggedEmoteChars(tags) });
    if (lines.length % 250 === 0) process.stdout.write(`\r  ${lines.length} messages...`);
  }
});

socket.addEventListener("error", () => console.error("connection failed"));

setTimeout(() => {
  socket.close();
  report();
  process.exit(0);
}, seconds * 1000);
