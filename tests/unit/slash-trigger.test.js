import { describe, it, expect } from "vitest";
import { slashTriggerAllowed } from "../../src/components/editor/slash-menu/index.js";

// "/" opens the slash menu at the start of a line/block or after a space,
// but never mid-word.
describe("slashTriggerAllowed", () => {
  it("fires at the start of a line/block (newline or doc start)", () => {
    expect(slashTriggerAllowed({ parentOffset: 0, charBefore: "" })).toBe(true);
  });

  it("fires after a space", () => {
    expect(slashTriggerAllowed({ parentOffset: 5, charBefore: " " })).toBe(true);
  });

  it("does not fire mid-word", () => {
    expect(slashTriggerAllowed({ parentOffset: 4, charBefore: "O" })).toBe(
      false,
    );
  });

  it("ignores charBefore when at block start", () => {
    // block start wins even if the preceding doc text is a non-space char
    expect(slashTriggerAllowed({ parentOffset: 0, charBefore: "x" })).toBe(true);
  });
});
