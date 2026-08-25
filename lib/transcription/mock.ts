import { Emitter } from "../audio/emitter";
import type { TranscriptionEvents, TranscriptionProvider } from "./provider";

/**
 * Scripted provider.
 *
 * Replays a fixed list of utterances on a timer. Lets the whole UI be
 * developed and tested without a microphone, without Chrome, and without
 * granting mic permission a hundred times a day.
 */
export interface MockScriptLine {
  /** Ms after start() at which this line is emitted. */
  at: number;
  text: string;
}

export const DEMO_SCRIPT: readonly MockScriptLine[] = [
  { at: 1_500, text: "hey hey what's up everyone, welcome in" },
  { at: 9_000, text: "okay so today we're gonna finish the base I think" },
  { at: 16_000, text: "chat what do you think, should I do the roof or the walls" },
  { at: 30_000, text: "alright yeah let's do the roof" },
  { at: 38_000, text: "oh no. oh no no no" },
  { at: 44_000, text: "I can't believe I just did that, this is so annoying" },
  { at: 54_000, text: "wait actually, hold on" },
  { at: 60_000, text: "LET'S GO got it, finally!" },
  { at: 68_000, text: "okay look at this, look how it turned out" },
  { at: 110_000, text: "so yesterday something really funny happened at work" },
  { at: 120_000, text: "I'm not even joking, my manager walked right in" },
  { at: 150_000, text: "alright I think that's it for today, thanks for hanging out" },
];

export class MockProvider implements TranscriptionProvider {
  readonly name = "mock";
  readonly events = new Emitter<TranscriptionEvents>();

  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private running = false;

  constructor(
    private readonly script: readonly MockScriptLine[] = DEMO_SCRIPT,
    /** Replay from the top when the script runs out. */
    private readonly loop = true,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  isSupported(): boolean {
    return true;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.events.emit("listening", undefined);
    this.schedule(0);
  }

  stop(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    if (this.running) {
      this.running = false;
      this.events.emit("idle", undefined);
    }
  }

  private schedule(baseOffset: number): void {
    for (const line of this.script) {
      this.timers.push(
        setTimeout(() => {
          if (this.running) this.events.emit("final", { text: line.text });
        }, baseOffset + line.at),
      );
    }

    if (this.loop && this.script.length > 0) {
      const cycle = this.script[this.script.length - 1].at + 20_000;
      this.timers.push(
        setTimeout(() => {
          if (this.running) {
            this.timers = [];
            this.schedule(0);
          }
        }, baseOffset + cycle),
      );
    }
  }
}
