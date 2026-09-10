import { describe, expect, it } from "vitest";
import {
  MAX_MESSAGES_PER_PUBLISH,
  OVERLAY_KEY_PATTERN,
  OverlayPublishSchema,
} from "../protocol";
import type { ChatMessage } from "@/lib/engine/types";

const KEY = "0123456789abcdef0123456789abcdef";

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    viewerId: "v1",
    username: "someone",
    color: "#ff8800",
    text: "hello",
    kind: "reaction",
    source: "ai",
    at: 1_700_000_000_000,
    ...overrides,
  };
}

describe("overlay key pattern", () => {
  it("accepts a generated key", () => {
    expect(OVERLAY_KEY_PATTERN.test(KEY)).toBe(true);
  });

  it.each([
    ["too short", "abc"],
    ["uppercase", KEY.toUpperCase()],
    ["path traversal", "../../etc/passwd"],
    ["query injection", `${KEY}&key=other`],
    ["empty", ""],
  ])("rejects %s", (_label, candidate) => {
    expect(OVERLAY_KEY_PATTERN.test(candidate)).toBe(false);
  });
});

describe("OverlayPublishSchema", () => {
  it("accepts a well-formed publish", () => {
    const parsed = OverlayPublishSchema.safeParse({
      key: KEY,
      messages: [message()],
      clear: false,
    });
    expect(parsed.success).toBe(true);
  });

  it("defaults an omitted body to an empty probe", () => {
    const parsed = OverlayPublishSchema.parse({ key: KEY });
    expect(parsed).toEqual({ key: KEY, messages: [], clear: false });
  });

  it("rejects a malformed key", () => {
    expect(
      OverlayPublishSchema.safeParse({ key: "nope", messages: [] }).success,
    ).toBe(false);
  });

  it("rejects more messages than one publish allows", () => {
    const messages = Array.from({ length: MAX_MESSAGES_PER_PUBLISH + 1 }, (_, i) =>
      message({ id: `m${i}` }),
    );
    expect(OverlayPublishSchema.safeParse({ key: KEY, messages }).success).toBe(
      false,
    );
  });

  it("rejects a message long enough to fill the overlay", () => {
    const parsed = OverlayPublishSchema.safeParse({
      key: KEY,
      messages: [message({ text: "x".repeat(401) })],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a color that isn't a hex value", () => {
    // The overlay puts this straight into a style attribute.
    const parsed = OverlayPublishSchema.safeParse({
      key: KEY,
      messages: [message({ color: "red; background: url(evil)" })],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown message kind", () => {
    const parsed = OverlayPublishSchema.safeParse({
      key: KEY,
      messages: [{ ...message(), kind: "announcement" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-finite timestamp", () => {
    const parsed = OverlayPublishSchema.safeParse({
      key: KEY,
      messages: [{ ...message(), at: Number.NaN }],
    });
    expect(parsed.success).toBe(false);
  });
});
