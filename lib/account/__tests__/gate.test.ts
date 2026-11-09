import { describe, expect, it } from "vitest";
import { gateFor, safeReturnPath } from "../gate";

describe("gateFor", () => {
  it.each([
    ["/dashboard", "page"],
    ["/simulator", "page"],
    ["/settings", "page"],
    ["/settings/regulars", "page"],
    ["/settings/obs", "page"],
    ["/emotes", "page"],
    ["/obs", "page"],
    ["/account", "page"],
    ["/api/chat-candidates", "api"],
    ["/api/emotes", "api"],
    ["/api/ai-status", "api"],
    ["/api/overlay/publish", "api"],
    ["/api/something-new", "api"],
    ["/", "open"],
    ["/features", "open"],
    ["/pricing", "open"],
    ["/login", "open"],
    ["/signup", "open"],
    ["/overlay", "open"],
    ["/api/overlay/stream", "open"],
    ["/api/overlay/status", "open"],
    ["/api/auth/callback/twitch", "open"],
    ["/simulatorx", "open"],
    ["/api/overlay/streamx", "api"],
  ] as const)("%s → %s", (path, gate) => {
    expect(gateFor(path)).toBe(gate);
  });
});

describe("safeReturnPath", () => {
  it.each([
    ["/settings/obs?x=1", "/settings/obs?x=1"],
    [null, "/simulator"],
    ["", "/simulator"],
    ["https://evil.example", "/simulator"],
    ["//evil.example", "/simulator"],
    ["/\\evil.example", "/simulator"],
  ])("%s → %s", (from, to) => {
    expect(safeReturnPath(from)).toBe(to);
  });
});
