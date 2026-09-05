import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { appendPhaseExecutionAudit } from "../src/workflows/phases/phase-execution-audit.js";

const featurePath = fileURLToPath(new URL("./generic-phase-execution-audit.feature", import.meta.url));

describe("generic phase execution audit Gherkin integration", () => {
  it("documents generic secret-safe audit behavior", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Phase progress is audited");
    expect(specification).toContain("Scenario: Pi attempts share the same audit stream");
    expect(specification).not.toMatch(/FEAT-\d+|Phase 2|dashboard|governance/i);
  });

  it("appends an arbitrary production audit event to the expected project log", () => {
    const rootPath = mkdtempSync(join(tmpdir(), "hepha-phase-audit-integration-"));
    try {
      appendPhaseExecutionAudit({
        agent: "Any", event: "pi_attempt_started", model: "model", phaseNumber: 91,
        phaseTitle: "Random", project: { rootPath } as any, runId: "run", status: "running",
      });
      expect(readFileSync(join(rootPath, "logs", "phase-execution.jsonl"), "utf8")).toContain('"phaseNumber":91');
    } finally {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });
});
