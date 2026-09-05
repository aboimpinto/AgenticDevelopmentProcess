import { describe, expect, it } from "vitest";
import { renderResilientImplementationErrorPath } from "../src/workflows/prompts/resilient-error-path.js";

describe("resilient implementation error path", () => {
  const rules = renderResilientImplementationErrorPath({
    blockedEscalation: "Report BLOCKED",
    completionTarget: "declared work is complete",
  });

  it("continues from a first recoverable failure", () => {
    expect(rules).toContain("- When any command, check, file operation, git operation, or validation step fails, do not stop at the first failure.");
    expect(rules.join("\n")).toContain("project bug, missing dependency/tooling, environment issue, git conflict, transient failure");
  });

  it("requires the smallest repair and focused proof", () => {
    expect(rules.join("\n")).toContain("Implement the smallest safe fix");
    expect(rules.join("\n")).toContain("smallest relevant verification");
    expect(rules.join("\n")).toContain("diagnose -> fix -> verify until the error is resolved and declared work is complete");
  });

  it("escalates only genuine external, unsafe, conflict, or repeated blockers", () => {
    const escalation = rules.at(-1) ?? "";
    expect(escalation).toContain("Report BLOCKED only when");
    expect(escalation).toContain("user input");
    expect(escalation).toContain("unsafe destructive action");
    expect(escalation).toContain("same failure repeats after documented recovery attempts");
  });
});
