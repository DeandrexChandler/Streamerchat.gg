import { describe, expect, it } from "vitest";
import { repairSlang } from "../slang";
import { classify } from "../../engine/classifier";

describe("repairSlang", () => {
  it.each([
    ["that was low key insane", "that was lowkey insane"],
    ["n g l that was rough", "ngl that was rough"],
    ["g g everyone", "gg everyone"],
    ["I'm dead ass serious", "I'm deadass serious"],
    ["that food is bussing", "that food is bussin"],
    ["pog champ", "poggers"],
  ])("repairs %j", (input, expected) => {
    expect(repairSlang(input)).toBe(expected);
  });

  it("leaves ordinary speech completely alone", () => {
    const plain = "okay so I think we should try the roof first";
    expect(repairSlang(plain)).toBe(plain);
  });

  it("does not touch ambiguous slang that has a common literal reading", () => {
    // "yeet"/"yet", "rizz"/"risk", "goated"/"goaded" are all left alone: a
    // wrong substitution puts words in the streamer's mouth.
    expect(repairSlang("not yet")).toBe("not yet");
    expect(repairSlang("that's a risk")).toBe("that's a risk");
  });

  it("rescues a classification the mistranscription would have lost", () => {
    // The point of the whole module. "bussing" is a real English word, so it
    // scores nothing and lands in mundane — which the attention gate then
    // mostly ignores. Repaired to "bussin" it reads as praise.
    expect(classify("this run is bussing", {}).intent).toBe("mundane");
    expect(classify(repairSlang("this run is bussing"), {}).intent).toBe(
      "excitement",
    );
  });
});
