import { describe, expect, it, vi } from "vitest";
import { authorManualTestCases } from "../src/manual-test-verification/pack-authoring.js";

const manualCase = {
  id: "BROWSER-KEYBOARD-A", title: "Keyboard navigation", purpose: "Check focus", sourceIds: ["AC-UI-001"],
  role: "Operator", application: "Example console", preconditions: ["Example console is running"],
  setupData: "No account or test data is required.", steps: ["Open the Example console", "Press Tab to focus Save"],
  expectedResult: "Save has a visible focus indicator.",
};
const model = { manifestEntries: [{ sourceId: "AC-UI-001", category: "feat-ac" as const, relativePath: "FeatureDescription.md", contentHash: "hash", criterionPreview: "Keyboard access" }],
  tests: [], coverageMap: [], invalidManualTests: [], automatedEvidence: [], deferredSurfaces: [], applicability: "incomplete" as const };

describe("manual package authoring boundary", () => {
  it.each(["Press Tab until Save has focus", "1. Open the Example console", "In the Example console, select Save", "Disconnect the test device from the network"])("accepts concrete instructions without an opening-verb whitelist: %s", async step => {
    const result = await authorManualTestCases({ guidance: "", sourceMarkdown: "Example console", model,
      runPrompt: async () => JSON.stringify({ tests: [{ ...manualCase, steps: [step] }], unresolved: [] }) });
    expect(result.tests[0]?.steps).toEqual([step]);
  });
  it("returns a rejected draft and exact diagnostics to the model, then validates the correction", async () => {
    const draft = JSON.stringify({ tests: [{ ...manualCase, application: "TBD" }], unresolved: [] });
    const runPrompt = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce(JSON.stringify({ tests: [manualCase], unresolved: [] }));
    const result = await authorManualTestCases({ guidance: "Keep keyboard scope", sourceMarkdown: "Example console supports Save", model, runPrompt });
    expect(result.tests).toEqual([manualCase]);
    expect(runPrompt).toHaveBeenCalledTimes(2);
    expect(runPrompt.mock.calls[1]?.[0]).toContain(draft);
    expect(runPrompt.mock.calls[1]?.[0]).toContain("Application or interface contains a generic or unresolved placeholder");
    expect(runPrompt.mock.calls[1]?.[0]).toContain("Keep keyboard scope");
  });
  it("stops repeated invalid drafts without accepting them or retrying provider failures", async () => {
    const runPrompt = vi.fn().mockResolvedValue(JSON.stringify({ tests: [{ ...manualCase, sourceIds: ["unknown"] }], unresolved: [] }));
    await expect(authorManualTestCases({ guidance: "", sourceMarkdown: "Console", model, runPrompt })).rejects.toThrow(/no progress/i);
    expect(runPrompt).toHaveBeenCalledTimes(3);
    const unavailable = vi.fn().mockRejectedValue(new Error("Provider unavailable"));
    await expect(authorManualTestCases({ guidance: "", sourceMarkdown: "Console", model, runPrompt: unavailable })).rejects.toThrow("Provider unavailable");
    expect(unavailable).toHaveBeenCalledTimes(1);
  });
  it("uses a complete coverage assessment when guidance is blank", async () => {
    const runPrompt = vi.fn().mockResolvedValue(JSON.stringify({ tests: [manualCase], unresolved: [] }));
    await authorManualTestCases({ guidance: "", sourceMarkdown: "Example console supports Save", model, runPrompt });
    expect(runPrompt.mock.calls[0]?.[0]).toContain("Assess every acceptance criterion");
    expect(runPrompt.mock.calls[0]?.[0]).toContain("even when human guidance is empty");
    expect(runPrompt.mock.calls[0]?.[0]).toContain("automated-only requirements");
  });
  it("passes steering and source context to the model and validates its proposed cases", async () => {
    const runPrompt = vi.fn().mockResolvedValue(JSON.stringify({ tests: [manualCase], unresolved: [] }));
    const result = await authorManualTestCases({ guidance: "Include keyboard access", sourceMarkdown: "Example console supports Save", model, runPrompt });
    expect(result.tests).toEqual([manualCase]);
    expect(runPrompt.mock.calls[0]?.[0]).toContain("Include keyboard access");
    expect(runPrompt.mock.calls[0]?.[0]).toContain("Example console supports Save");
  });
  it("rejects invented criterion IDs instead of claiming coverage", async () => {
    await expect(authorManualTestCases({ guidance: "Keyboard", sourceMarkdown: "Console", model,
      runPrompt: async () => JSON.stringify({ tests: [{ ...manualCase, sourceIds: ["AC-UNKNOWN"] }], unresolved: [] }),
    })).rejects.toThrow(/source/i);
  });
  it("keeps unavailable prerequisites unresolved rather than inventing executable tests", async () => {
    const result = await authorManualTestCases({ guidance: "Mobile", sourceMarkdown: "Console", model,
      runPrompt: async () => JSON.stringify({ tests: [], unresolved: ["A supported device and build must be specified."] }),
    });
    expect(result.unresolved).toHaveLength(1);
    expect(result.tests).toEqual([]);
  });
});
