import { describe, expect, it, vi } from "vitest";
import { Emitter } from "../emitter";

interface Events {
  ping: number;
  done: void;
}

describe("Emitter", () => {
  it("delivers payloads to subscribers", () => {
    const emitter = new Emitter<Events>();
    const handler = vi.fn();
    emitter.on("ping", handler);
    emitter.emit("ping", 42);
    expect(handler).toHaveBeenCalledWith(42);
  });

  it("delivers to every subscriber", () => {
    const emitter = new Emitter<Events>();
    const a = vi.fn();
    const b = vi.fn();
    emitter.on("ping", a);
    emitter.on("ping", b);
    emitter.emit("ping", 1);
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("does not deliver to other events", () => {
    const emitter = new Emitter<Events>();
    const handler = vi.fn();
    emitter.on("done", handler);
    emitter.emit("ping", 1);
    expect(handler).not.toHaveBeenCalled();
  });

  it("unsubscribes via the returned function", () => {
    const emitter = new Emitter<Events>();
    const handler = vi.fn();
    const off = emitter.on("ping", handler);
    off();
    emitter.emit("ping", 1);
    expect(handler).not.toHaveBeenCalled();
  });

  it("tolerates a handler unsubscribing itself mid-emit", () => {
    // The audio loop emits at 60fps; a handler removing itself during dispatch
    // must not corrupt iteration or skip the remaining subscribers.
    const emitter = new Emitter<Events>();
    const second = vi.fn();
    const off = emitter.on("ping", () => off());
    emitter.on("ping", second);
    expect(() => emitter.emit("ping", 1)).not.toThrow();
    expect(second).toHaveBeenCalledOnce();
  });

  it("isolates a throwing handler from the others", () => {
    // One bad subscriber must never stall the animation-frame loop.
    const emitter = new Emitter<Events>();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const good = vi.fn();
    emitter.on("ping", () => {
      throw new Error("boom");
    });
    emitter.on("ping", good);
    expect(() => emitter.emit("ping", 1)).not.toThrow();
    expect(good).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("emitting an event with no subscribers is a no-op", () => {
    const emitter = new Emitter<Events>();
    expect(() => emitter.emit("ping", 1)).not.toThrow();
  });

  it("clear() removes every subscription", () => {
    const emitter = new Emitter<Events>();
    const handler = vi.fn();
    emitter.on("ping", handler);
    emitter.clear();
    emitter.emit("ping", 1);
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not double-register the same handler", () => {
    const emitter = new Emitter<Events>();
    const handler = vi.fn();
    emitter.on("ping", handler);
    emitter.on("ping", handler);
    emitter.emit("ping", 1);
    expect(handler).toHaveBeenCalledOnce();
  });
});
