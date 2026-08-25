import { describe, expect, it } from "vitest";
import { Scheduler } from "../scheduler";
import type { PendingMessage } from "../types";

function pending(id: string, offset: number): PendingMessage {
  return {
    id,
    viewerId: `v-${id}`,
    username: `user-${id}`,
    color: "#fff",
    text: id,
    kind: "reaction",
    source: "pool",
    offset,
  };
}

describe("Scheduler", () => {
  it("releases nothing before a message is due", () => {
    const s = new Scheduler(100);
    s.enqueueBurst([pending("a", 1000)], 0);
    expect(s.tick(999)).toHaveLength(0);
    expect(s.pending).toBe(1);
  });

  it("releases a message once its time arrives", () => {
    const s = new Scheduler(100);
    s.enqueueBurst([pending("a", 1000)], 0);
    expect(s.tick(1000).map((m) => m.id)).toEqual(["a"]);
    expect(s.pending).toBe(0);
  });

  it("resolves offsets against the burst start time", () => {
    const s = new Scheduler(100);
    s.enqueueBurst([pending("a", 500)], 10_000);
    expect(s.tick(10_400)).toHaveLength(0);
    expect(s.tick(10_500)).toHaveLength(1);
  });

  it("releases in chronological order regardless of insertion order", () => {
    const s = new Scheduler(100);
    s.enqueueBurst(
      [pending("late", 900), pending("early", 100), pending("mid", 500)],
      0,
    );
    expect(s.tick(1000).map((m) => m.id)).toEqual(["early", "mid", "late"]);
  });

  it("interleaves messages from separately-enqueued bursts", () => {
    const s = new Scheduler(100);
    s.enqueueBurst([pending("a", 0), pending("c", 800)], 0);
    s.enqueueBurst([pending("b", 400)], 0);
    expect(s.tick(1000).map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("enforces the per-minute rate limit", () => {
    const s = new Scheduler(5);
    s.enqueueBurst(
      Array.from({ length: 20 }, (_, i) => pending(`m${i}`, 0)),
      0,
    );
    expect(s.tick(0)).toHaveLength(5);
  });

  it("holds rate-limited messages rather than dropping them", () => {
    const s = new Scheduler(5);
    s.enqueueBurst(
      Array.from({ length: 20 }, (_, i) => pending(`m${i}`, 0)),
      0,
    );
    s.tick(0);
    expect(s.pending).toBe(15);
    // Once the window rolls past a minute, the rest flow through.
    expect(s.tick(61_000)).toHaveLength(5);
  });

  it("applies an updated rate limit to later ticks", () => {
    const s = new Scheduler(2);
    s.enqueueBurst(
      Array.from({ length: 10 }, (_, i) => pending(`m${i}`, 0)),
      0,
    );
    expect(s.tick(0)).toHaveLength(2);
    s.setRateLimit(50);
    expect(s.tick(61_000)).toHaveLength(8);
  });

  it("flush() discards everything queued", () => {
    const s = new Scheduler(100);
    s.enqueueBurst([pending("a", 500), pending("b", 900)], 0);
    s.flush();
    expect(s.pending).toBe(0);
    expect(s.tick(5000)).toHaveLength(0);
  });

  it("trimBeyond() keeps near-future messages and drops the tail", () => {
    // This is what stops chat reacting to something said 8 seconds ago when
    // the streamer has already moved on.
    const s = new Scheduler(100);
    s.enqueueBurst([pending("soon", 500), pending("stale", 6000)], 0);
    s.trimBeyond(0, 1000);
    expect(s.pending).toBe(1);
    expect(s.tick(10_000).map((m) => m.id)).toEqual(["soon"]);
  });

  it("reset() clears the queue and the rate-limit window", () => {
    const s = new Scheduler(2);
    s.enqueueBurst([pending("a", 0), pending("b", 0), pending("c", 0)], 0);
    s.tick(0);
    s.reset();
    s.enqueueBurst([pending("d", 0), pending("e", 0)], 0);
    expect(s.tick(0)).toHaveLength(2);
  });

  it("strips the offset field from released messages", () => {
    const s = new Scheduler(100);
    s.enqueueBurst([pending("a", 250)], 1000);
    const [message] = s.tick(2000);
    expect(message).not.toHaveProperty("offset");
    expect(message.at).toBe(1250);
  });
});
