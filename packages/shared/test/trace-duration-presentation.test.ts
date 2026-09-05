import { describe, expect, it } from "vitest";

import {
  formatDuration,
  formatDurationAria,
} from "../src/trace-presentation.js";

describe("trace duration presentation", () => {
  it("normalizes accumulated minutes into hours, minutes, and seconds", () => {
    const durationMs = ((8 * 60 + 52) * 60 + 12) * 1000;

    expect(formatDuration(durationMs)).toBe("8h 52m 12s");
    expect(formatDurationAria(durationMs)).toBe(
      "8 hours, 52 minutes, and 12 seconds",
    );
  });

  it("normalizes long executions into days, hours, minutes, and seconds", () => {
    const durationMs = (((2 * 24 + 3) * 60 + 4) * 60 + 5) * 1000;

    expect(formatDuration(durationMs)).toBe("2d 3h 4m 5s");
    expect(formatDurationAria(durationMs)).toBe(
      "2 days, 3 hours, 4 minutes, and 5 seconds",
    );
  });
});
