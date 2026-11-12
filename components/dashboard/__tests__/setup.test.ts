import { describe, expect, it } from "vitest";
import { emotesItem, keyItem, micItem, sessionAction } from "../setup";

describe("dashboard setup items", () => {
  it("maps every key state", () => {
    expect(keyItem("checking").state).toBe("checking");
    expect(keyItem("ok").state).toBe("ok");
    for (const s of ["missing", "rejected", "unreachable"] as const) {
      expect(keyItem(s).state).toBe("todo");
    }
    expect(keyItem("missing").detail).toContain("GOOGLE_API_KEY");
    expect(keyItem("ok").href).toBe("/settings/chat");
  });

  it("maps every mic state", () => {
    expect(micItem("checking").state).toBe("checking");
    expect(micItem("granted").state).toBe("ok");
    expect(micItem("denied").detail).toContain("Blocked");
    expect(micItem("prompt").state).toBe("todo");
    expect(micItem("unsupported")).toEqual(micItem("prompt"));
  });

  it("counts emotes", () => {
    expect(emotesItem(0).state).toBe("todo");
    expect(emotesItem(1).detail).toBe("1 emote imported.");
    expect(emotesItem(340).detail).toBe("340 emotes imported.");
  });

  it("offers start, resume or reopen", () => {
    expect(sessionAction("idle").cta).toBe("Start chat");
    expect(sessionAction("paused").cta).toBe("Resume chat");
    expect(sessionAction("running")).toEqual(sessionAction("paused"));
    expect(sessionAction("error").cta).toBe("Open simulator");
  });
});
