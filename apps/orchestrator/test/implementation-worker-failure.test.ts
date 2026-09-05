import { describe, expect, it } from "vitest";
import { formatImplementationWorkerFailure } from "../src/workflows/phases/implementation-worker-failure.js";

describe("formatImplementationWorkerFailure", () => {
  it("labels a code-review failure with its independent model scope", () => {
    expect(formatImplementationWorkerFailure({
      agentName: "Reviewer", agentRole: "code-review", error: new Error("provider unavailable"),
      modelContext: "Review Model via provider",
    })).toBe(
      "Reviewer failed using Review Model via provider. This failure came from the code-review model, not the phase implementation model. provider unavailable",
    );
  });

  it("does not add review scope to an ordinary implementation worker", () => {
    expect(formatImplementationWorkerFailure({
      agentName: "Worker", agentRole: "implementation", error: "timed out", modelContext: "Implementation Model via provider",
    })).toBe("Worker failed using Implementation Model via provider. timed out");
  });
});
