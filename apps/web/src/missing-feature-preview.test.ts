import { describe, expect, it } from "vitest";
import { isRecoverableMissingFeaturesPreviewError } from "./missing-feature-preview";

describe("isRecoverableMissingFeaturesPreviewError", () => {
  it("recognizes stale preview errors that require a new preview", () => {
    expect(
      isRecoverableMissingFeaturesPreviewError(
        "EPIC document has changed since preview. Request a new preview.",
      ),
    ).toBe(true);
    expect(
      isRecoverableMissingFeaturesPreviewError(
        "Preview plan is stale. EPIC document or existing FEATs have changed. Request a new preview.",
      ),
    ).toBe(true);
    expect(
      isRecoverableMissingFeaturesPreviewError(
        "No FEAT candidates to create. Request a new preview to check for changes.",
      ),
    ).toBe(true);
  });

  it("does not treat unrelated apply failures as stale preview recovery", () => {
    expect(isRecoverableMissingFeaturesPreviewError("Cannot apply: ambiguous FEAT state detected for FEAT-020.")).toBe(false);
    expect(isRecoverableMissingFeaturesPreviewError("Project not found.")).toBe(false);
  });
});
