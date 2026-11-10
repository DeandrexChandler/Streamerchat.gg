import { describe, expect, it } from "vitest";
import { isAllowed } from "../allowlist";

describe("isAllowed", () => {
  it.each([
    ["streamer", "streamer", true],
    ["Streamer", " other , STREAMER ", true],
    ["stranger", "streamer,other", false],
    ["streamer", "", false],
    ["", "streamer,", false],
    [undefined, "streamer", false],
  ])("%s in %j → %s", (name, list, allowed) => {
    expect(isAllowed(name, list)).toBe(allowed);
  });
});
