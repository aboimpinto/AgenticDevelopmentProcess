import { describe, expect, it } from "vitest";
import {
  deriveEpicStateFromFeatureStateFolders,
  extractEpicState,
  upsertEpicState,
} from "../src/epic-state/lifecycle-state.js";

describe("EPIC state markdown contract", () => {
  it("reads the explicit EPIC State field", () => {
    const markdown = [
      "# EPIC-001: Example",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-001 |",
      "| State | InProgress |",
      "| Status | DRAFT |",
    ].join("\n");

    expect(extractEpicState(markdown)).toBe("in-progress");
  });

  it("reads cancelled EPIC State values", () => {
    const markdown = [
      "# EPIC-001: Example",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-001 |",
      "| State | Cancelled |",
    ].join("\n");

    expect(extractEpicState(markdown)).toBe("cancelled");
  });

  it("does not treat legacy Status as EPIC delivery state", () => {
    const markdown = [
      "# EPIC-001: Example",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-001 |",
      "| Status | Completed |",
    ].join("\n");

    expect(extractEpicState(markdown)).toBeNull();
  });

  it("inserts State after Epic ID when the field is missing", () => {
    const markdown = [
      "# EPIC-001: Example",
      "",
      "| Field | Value |",
      "|-------|-------|",
      "| Epic ID | EPIC-001 |",
      "| Owner | Paulo Aboim Pinto |",
      "",
    ].join("\n");

    expect(upsertEpicState(markdown, "not-started")).toContain(
      "| Epic ID | EPIC-001 |\n| State | NotStarted |\n| Owner | Paulo Aboim Pinto |",
    );
  });

  it("derives persisted state for lifecycle updates", () => {
    expect(deriveEpicStateFromFeatureStateFolders(["04_COMPLETED"], false)).toBe("completed");
    expect(deriveEpicStateFromFeatureStateFolders(["05_CANCELLED"], false)).toBe("cancelled");
    expect(deriveEpicStateFromFeatureStateFolders(["04_COMPLETED", "01_SUBMITTED"], false)).toBe("in-progress");
    expect(deriveEpicStateFromFeatureStateFolders(["01_SUBMITTED", "02_READY_TO_DEVELOP"], false)).toBe(
      "not-started",
    );
    expect(deriveEpicStateFromFeatureStateFolders(["04_COMPLETED"], true)).toBe("in-progress");
  });
});
