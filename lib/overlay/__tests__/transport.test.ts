import { describe, expect, it, vi } from "vitest";
import { OverlayTransport } from "../transport";
import { MAX_MESSAGES_PER_PUBLISH } from "../protocol";
import type { ChatMessage } from "@/lib/engine/types";

const KEY = "c".repeat(32);

function message(id: string): ChatMessage {
  return {
    id,
    viewerId: `v-${id}`,
    username: `user_${id}`,
    color: "#aabbcc",
    text: id,
    kind: "reaction",
    source: "ai",
    at: 0,
  };
}

/** A fetch stub whose reported subscriber count can be changed per test. */
function stubFetch(subscribers = 1) {
  const calls: Array<{
    key: string;
    messages: ChatMessage[];
    clear: boolean;
    emotes?: Array<{ name: string; url: string }>;
  }> = [];
  const impl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body)));
    return {
      ok: true,
      json: async () => ({ subscribers }),
    } as Response;
  });
  return { impl: impl as unknown as typeof fetch, calls, raw: impl };
}

/** Lets the microtask queue drain so an in-flight post settles. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("OverlayTransport", () => {
  it("posts queued messages once a subscriber is known", async () => {
    const fetchStub = stubFetch(1);
    const transport = new OverlayTransport({ key: KEY, fetchImpl: fetchStub.impl });

    // First flush is the probe that discovers the subscriber.
    transport.flush(0);
    await settle();
    expect(transport.subscribers).toBe(1);

    transport.push([message("a"), message("b")]);
    transport.flush(100);
    await settle();

    expect(fetchStub.calls.at(-1)).toEqual({
      key: KEY,
      messages: [message("a"), message("b")],
      clear: false,
    });
  });

  it("sends nothing but a slow probe while no browser source is attached", async () => {
    const fetchStub = stubFetch(0);
    const transport = new OverlayTransport({ key: KEY, fetchImpl: fetchStub.impl });

    transport.flush(0);
    await settle();
    expect(fetchStub.calls).toHaveLength(1);

    // A busy second of chat with nobody watching costs zero extra requests.
    for (let t = 200; t <= 2800; t += 200) {
      transport.push([message(`m${t}`)]);
      transport.flush(t);
      await settle();
    }
    expect(fetchStub.calls).toHaveLength(1);

    transport.flush(3000);
    await settle();
    expect(fetchStub.calls).toHaveLength(2);
    // The backlog was dropped, not banked — nothing replays at the overlay.
    expect(fetchStub.calls[1].messages).toEqual([]);
  });

  it("does not post when there is nothing to send", async () => {
    const fetchStub = stubFetch(1);
    const transport = new OverlayTransport({ key: KEY, fetchImpl: fetchStub.impl });

    transport.flush(0);
    await settle();
    expect(fetchStub.calls).toHaveLength(1);

    transport.flush(200);
    transport.flush(400);
    await settle();
    expect(fetchStub.calls).toHaveLength(1);
  });

  it("sends a clear even with no subscribers known and no messages", async () => {
    const fetchStub = stubFetch(0);
    const transport = new OverlayTransport({ key: KEY, fetchImpl: fetchStub.impl });

    transport.clear();
    transport.flush(0);
    await settle();

    expect(fetchStub.calls).toHaveLength(1);
    expect(fetchStub.calls[0].clear).toBe(true);
  });

  it("drops queued messages when clear is called", async () => {
    const fetchStub = stubFetch(1);
    const transport = new OverlayTransport({ key: KEY, fetchImpl: fetchStub.impl });
    transport.flush(0);
    await settle();

    transport.push([message("stale")]);
    transport.clear();
    transport.flush(200);
    await settle();

    expect(fetchStub.calls.at(-1)).toMatchObject({ messages: [], clear: true });
  });

  it("still delivers a clear raised while a post was in flight", async () => {
    // clear() also stops the simulator's tick, so nothing would drive a later
    // flush — the overlay would stay frozen on messages that were just wiped.
    let resolveFetch: (value: Response) => void = () => {};
    const impl = vi.fn(
      () => new Promise<Response>((resolve) => (resolveFetch = resolve)),
    ) as unknown as typeof fetch;
    const transport = new OverlayTransport({ key: KEY, fetchImpl: impl });

    transport.flush(0);
    expect(impl).toHaveBeenCalledTimes(1);

    transport.clear();
    resolveFetch({ ok: true, json: async () => ({ subscribers: 1 }) } as Response);
    await settle();

    expect(impl).toHaveBeenCalledTimes(2);
    const body = JSON.parse(
      String((impl as unknown as ReturnType<typeof vi.fn>).mock.calls[1][1].body),
    );
    expect(body.clear).toBe(true);
  });

  it("never sends more than one batch at a time", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    const impl = vi.fn(
      () => new Promise<Response>((resolve) => (resolveFetch = resolve)),
    ) as unknown as typeof fetch;
    const transport = new OverlayTransport({ key: KEY, fetchImpl: impl });

    transport.clear();
    transport.flush(0);
    transport.push([message("a")]);
    transport.flush(200);
    transport.flush(400);

    expect(impl).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true, json: async () => ({ subscribers: 1 }) } as Response);
    await settle();

    transport.flush(600);
    expect(impl).toHaveBeenCalledTimes(2);
  });

  it("backs off after a failure instead of retrying every tick", async () => {
    const impl = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const transport = new OverlayTransport({ key: KEY, fetchImpl: impl });

    transport.flush(0);
    await settle();
    expect(impl).toHaveBeenCalledTimes(1);

    // A pending clear is always worth sending, so backoff is the only thing
    // that can be holding this one back.
    transport.clear();
    transport.flush(400);
    await settle();
    expect(impl).toHaveBeenCalledTimes(1);

    transport.flush(500);
    await settle();
    expect(impl).toHaveBeenCalledTimes(2);
  });

  it("assumes nothing is attached after a failure, so an outage stays cheap", async () => {
    let healthy = true;
    const impl = vi.fn(async () => {
      if (!healthy) throw new Error("offline");
      return { ok: true, json: async () => ({ subscribers: 1 }) } as Response;
    }) as unknown as typeof fetch;
    const transport = new OverlayTransport({ key: KEY, fetchImpl: impl });

    transport.flush(0);
    await settle();
    expect(transport.subscribers).toBe(1);

    healthy = false;
    transport.push([message("a")]);
    transport.flush(200);
    await settle();
    expect(transport.subscribers).toBe(0);

    // Back to probe cadence: a busy second of chat against a dead server costs
    // nothing, even though the backoff window has already expired.
    for (let t = 800; t <= 2800; t += 200) {
      transport.push([message(`m${t}`)]);
      transport.flush(t);
      await settle();
    }
    expect(impl).toHaveBeenCalledTimes(2);
  });

  it("treats a non-ok response as a failure", async () => {
    const impl = vi.fn(async () => ({ ok: false, status: 429 }) as Response) as
      unknown as typeof fetch;
    const transport = new OverlayTransport({ key: KEY, fetchImpl: impl });

    transport.push([message("a")]);
    transport.flush(0);
    await settle();

    expect(transport.subscribers).toBe(0);
    transport.flush(100);
    expect(impl).toHaveBeenCalledTimes(1);
  });

  it("caps the queue so a stalled relay can't grow it without bound", async () => {
    const fetchStub = stubFetch(1);
    const transport = new OverlayTransport({ key: KEY, fetchImpl: fetchStub.impl });
    transport.flush(0);
    await settle();

    for (let i = 0; i < MAX_MESSAGES_PER_PUBLISH * 3; i += 1) {
      transport.push([message(`m${i}`)]);
    }
    transport.flush(200);
    await settle();

    const sent = fetchStub.calls.at(-1)!.messages;
    expect(sent).toHaveLength(MAX_MESSAGES_PER_PUBLISH);
    // Newest kept: if only some can go out, those are the ones worth showing.
    expect(sent.at(-1)!.id).toBe(`m${MAX_MESSAGES_PER_PUBLISH * 3 - 1}`);
  });

  /**
   * The browser source runs in OBS, which has never seen the streamer's
   * imported packs. Without the pack on the wire every emote reaches the
   * stream as its own name in plain text.
   */
  describe("emotes", () => {
    const pack = [
      { id: "1", name: "KEKW", url: "https://cdn.test/kekw.webp", mood: "funny" as const },
      { id: "2", name: "Pog", url: "https://cdn.test/pog.webp", mood: "hype" as const },
    ];

    it("sends the pack with the first publish that reaches a source", async () => {
      const fetchStub = stubFetch(1);
      const transport = new OverlayTransport({ key: KEY, fetchImpl: fetchStub.impl });
      transport.setEmotes(pack);
      transport.push([message("a")]);
      transport.flush(0);
      await settle();

      expect(fetchStub.calls[0].emotes).toEqual([
        { name: "KEKW", url: "https://cdn.test/kekw.webp" },
        { name: "Pog", url: "https://cdn.test/pog.webp" },
      ]);
    });

    it("does not re-send an unchanged pack on every publish", async () => {
      const fetchStub = stubFetch(1);
      const transport = new OverlayTransport({ key: KEY, fetchImpl: fetchStub.impl });
      transport.setEmotes(pack);
      transport.push([message("a")]);
      transport.flush(0);
      await settle();

      transport.setEmotes(pack);
      transport.push([message("b")]);
      transport.flush(1_000);
      await settle();

      expect(fetchStub.calls[1].emotes).toBeUndefined();
    });

    it("sends the pack again when it changes", async () => {
      const fetchStub = stubFetch(1);
      const transport = new OverlayTransport({ key: KEY, fetchImpl: fetchStub.impl });
      transport.setEmotes(pack);
      transport.push([message("a")]);
      transport.flush(0);
      await settle();

      transport.setEmotes([...pack, { id: "3", name: "Sadge", url: "https://cdn.test/sadge.webp", mood: "sad" as const }]);
      transport.push([message("b")]);
      transport.flush(1_000);
      await settle();

      expect(fetchStub.calls[1].emotes).toHaveLength(3);
    });

    it("sends it again when a new source attaches", async () => {
      // A scene switch in OBS is a fresh connection that has been given
      // nothing, and a publisher mid-session has already sent its pack.
      const calls: Array<{ emotes?: unknown[] }> = [];
      let subscribers = 1;
      const impl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        calls.push(JSON.parse(String(init?.body)));
        return { ok: true, json: async () => ({ subscribers }) } as Response;
      });
      const transport = new OverlayTransport({ key: KEY, fetchImpl: impl as unknown as typeof fetch });

      transport.setEmotes(pack);
      transport.push([message("a")]);
      transport.flush(0);
      await settle();
      expect(calls[0].emotes).toBeDefined();

      subscribers = 2;
      transport.push([message("b")]);
      transport.flush(1_000);
      await settle();

      transport.push([message("c")]);
      transport.flush(2_000);
      await settle();
      expect(calls[2].emotes).toBeDefined();
    });
  });
});
