import { describe, it, expect } from "vitest";
import { formatToday } from "../../src/components/editor/slash-menu/index.js";

// /today inserts the current date in ISO 8601 (YYYY-MM-DD), built from local
// calendar components so it never drifts a day near midnight (unlike toISOString,
// which is UTC-based).
describe("formatToday", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(formatToday(new Date(2026, 5, 10))).toBe("2026-06-10");
  });

  it("zero-pads single-digit month and day", () => {
    expect(formatToday(new Date(2026, 0, 3))).toBe("2026-01-03");
  });

  it("uses local calendar components, not UTC", () => {
    // Late-evening local time that is the next day in UTC for positive offsets.
    // The local date must win regardless of the runner's timezone.
    const d = new Date(2026, 11, 31, 23, 30);
    expect(formatToday(d)).toBe("2026-12-31");
  });

  it("defaults to the current date when called with no argument", () => {
    expect(formatToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
