import { describe, expect, it, vi } from "vitest";
import { OverlayHub, type OverlayFrame } from "../hub";

const KEY_A = "a".repeat(32);
const KEY_B = "b".repeat(32);

function frame(data = "{}"): OverlayFrame {
  return { event: "chat", data };
}

describe("OverlayHub", () => {
  it("delivers a frame to every subscriber on the key", () => {
    const hub = new OverlayHub();
    const one = vi.fn();
    const two = vi.fn();
    hub.subscribe(KEY_A, one);
    hub.subscribe(KEY_A, two);

    expect(hub.publish(KEY_A, frame("payload"))).toBe(2);
    expect(one).toHaveBeenCalledWith(frame("payload"));
    expect(two).toHaveBeenCalledWith(frame("payload"));
  });

  it("keeps sessions isolated", () => {
    const hub = new OverlayHub();
    const mine = vi.fn();
    const theirs = vi.fn();
    hub.subscribe(KEY_A, mine);
    hub.subscribe(KEY_B, theirs);

    hub.publish(KEY_A, frame());

    expect(mine).toHaveBeenCalledTimes(1);
    expect(theirs).not.toHaveBeenCalled();
  });

  it("does not create a session for a key nobody is listening on", () => {
    const hub = new OverlayHub();
    expect(hub.publish(KEY_A, frame())).toBe(0);
    expect(hub.sessionCount).toBe(0);
  });

  it("stops delivering after unsubscribe and drops the empty session", () => {
    const hub = new OverlayHub();
    const listener = vi.fn();
    const off = hub.subscribe(KEY_A, listener)!;

    off();

    expect(hub.publish(KEY_A, frame())).toBe(0);
    expect(listener).not.toHaveBeenCalled();
    expect(hub.sessionCount).toBe(0);
  });

  it("tolerates unsubscribe being called twice", () => {
    const hub = new OverlayHub();
    const first = vi.fn();
    const second = vi.fn();
    const off = hub.subscribe(KEY_A, first)!;

    off();
    hub.subscribe(KEY_A, second);
    // An aborted request can fire both the signal handler and cancel().
    off();

    expect(hub.publish(KEY_A, frame())).toBe(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("drops a listener that throws without disturbing the others", () => {
    const hub = new OverlayHub();
    const dead = vi.fn(() => {
      throw new Error("stream closed");
    });
    const alive = vi.fn();
    hub.subscribe(KEY_A, dead);
    hub.subscribe(KEY_A, alive);

    expect(hub.publish(KEY_A, frame())).toBe(1);
    expect(alive).toHaveBeenCalledTimes(1);

    expect(hub.publish(KEY_A, frame())).toBe(1);
    expect(dead).toHaveBeenCalledTimes(1);
    expect(hub.subscriberCount(KEY_A)).toBe(1);
  });

  it("refuses more listeners than a session allows", () => {
    const hub = new OverlayHub({ maxSessions: 4, maxListenersPerSession: 2 });
    expect(hub.subscribe(KEY_A, vi.fn())).toBeTypeOf("function");
    expect(hub.subscribe(KEY_A, vi.fn())).toBeTypeOf("function");
    expect(hub.subscribe(KEY_A, vi.fn())).toBeNull();
    expect(hub.subscriberCount(KEY_A)).toBe(2);
  });

  it("refuses new sessions past the session cap but still serves existing ones", () => {
    const hub = new OverlayHub({ maxSessions: 1, maxListenersPerSession: 4 });
    hub.subscribe(KEY_A, vi.fn());

    expect(hub.subscribe(KEY_B, vi.fn())).toBeNull();
    expect(hub.subscribe(KEY_A, vi.fn())).toBeTypeOf("function");
  });

  it("frees a session slot once its last listener leaves", () => {
    const hub = new OverlayHub({ maxSessions: 1, maxListenersPerSession: 4 });
    const off = hub.subscribe(KEY_A, vi.fn())!;

    expect(hub.canSubscribe(KEY_B)).toBe(false);
    off();
    expect(hub.canSubscribe(KEY_B)).toBe(true);
  });

  it("reports capacity the same way subscribe decides it", () => {
    const hub = new OverlayHub({ maxSessions: 2, maxListenersPerSession: 1 });
    hub.subscribe(KEY_A, vi.fn());

    expect(hub.canSubscribe(KEY_A)).toBe(false);
    expect(hub.canSubscribe(KEY_B)).toBe(true);
  });
});

describe("the retained emote pack", () => {
  const frame = (names: string[]) => ({
    event: "emotes" as const,
    data: JSON.stringify({ emotes: names.map((name) => ({ name, url: `u/${name}` })) }),
  });

  it("hands the pack to a source that attaches later", () => {
    // OBS reconnects on every scene switch, long after the pack was sent.
    // Without this, chat on stream renders emote names as plain text.
    const hub = new OverlayHub();
    const first: OverlayFrame[] = [];
    const unsubscribe = hub.subscribe("k".repeat(32), (f) => first.push(f))!;
    hub.publish("k".repeat(32), frame(["KEKW"]));

    const late: OverlayFrame[] = [];
    hub.subscribe("k".repeat(32), (f) => late.push(f));
    expect(late).toHaveLength(1);
    expect(late[0].event).toBe("emotes");
    unsubscribe();
  });

  it("keeps only the most recent pack", () => {
    const hub = new OverlayHub();
    const key = "m".repeat(32);
    const keep = hub.subscribe(key, () => {})!;
    hub.publish(key, frame(["KEKW"]));
    hub.publish(key, frame(["Pog", "Sadge"]));

    const late: OverlayFrame[] = [];
    hub.subscribe(key, (f) => late.push(f));
    expect(JSON.parse(late[0].data).emotes).toHaveLength(2);
    keep();
  });

  it("forgets the pack once nobody is watching", () => {
    // The next publisher sends its own; retaining one for a key with no
    // sources is just a leak with extra steps.
    const hub = new OverlayHub();
    const key = "n".repeat(32);
    const unsubscribe = hub.subscribe(key, () => {})!;
    hub.publish(key, frame(["KEKW"]));
    unsubscribe();

    const late: OverlayFrame[] = [];
    hub.subscribe(key, (f) => late.push(f));
    expect(late).toHaveLength(0);
  });
});
