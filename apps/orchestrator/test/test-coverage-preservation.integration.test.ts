import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertTestCoveragePreserved,
  captureTestCoverageSnapshot,
} from "../src/test-coverage-preservation-adapter.js";

const temporaryRoots: string[] = [];
const featurePath = fileURLToPath(new URL("./test-coverage-preservation.feature", import.meta.url));
const autonomousWorkflowPath = fileURLToPath(
  new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url),
);
const repairApplicationPath = fileURLToPath(
  new URL("../src/workflows/phases/phase-same-run-repair-application.ts", import.meta.url),
);
const protectedWorkerPath = fileURLToPath(
  new URL("../src/workflows/phases/protected-phase-worker-application.ts", import.meta.url),
);
const workerResultPath = fileURLToPath(
  new URL("../src/workflows/phases/phase-worker-result-application.ts", import.meta.url),
);

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("generic phase repair coverage integration", () => {
  it("keeps the generic Gherkin scenarios wired to the executable guard", () => {
    const feature = readFileSync(featurePath, "utf8");
    expect(feature).toContain("Scenario: Existing test cases survive a repair");
    expect(feature).toContain("Scenario: Coverage reduction is restored and denied");
    expect(feature).toContain("Scenario: A failed validation retries the active phase");
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|architecture debt/i);
  });

  it("routes repairable generic failures back to the same phase in the same run", () => {
    const runner = readFileSync(autonomousWorkflowPath, "utf8");
    const repairApplication = readFileSync(repairApplicationPath, "utf8");
    const protectedWorker = readFileSync(protectedWorkerPath, "utf8");
    const workerResult = readFileSync(workerResultPath, "utf8");

    expect(runner).toContain("this.dependencies.workerResult.process({");
    expect(workerResult).toContain("test_coverage_restored");
    expect(workerResult).toContain("quality_gate_failed");
    expect(workerResult).toContain("this.dependencies.prepareRepair({");
    expect(runner).toContain("sameRunRepairBrief");
    expect(repairApplication).toContain("this.dependencies.evaluate({");
    expect(repairApplication).toContain("this.dependencies.recordTaskFailure({");
    expect(repairApplication).toContain('status: "implementing"');
    expect(runner).toMatch(/this\.dependencies\.workerResult\.process[\s\S]*?phaseIndex -= 1;[\s\S]*?continue;/);
    expect(protectedWorker.indexOf("this.dependencies.restoreMachineState(machineState)")).toBeLessThan(
      protectedWorker.indexOf("return { output, testCoverage }"),
    );
  });

  it("restores a weakened test artifact and fails the repair", () => {
    const root = mkdtempSync(join(tmpdir(), "hepha-test-coverage-"));
    temporaryRoots.push(root);
    const path = join(root, "workflow.spec.ts");
    const original = `test("records a passing result", () => { expect(true).toBe(true); });\n`;
    writeFileSync(path, original, "utf8");
    const snapshot = captureTestCoverageSnapshot(root);

    writeFileSync(path, `test("renders a document", () => {});\n`, "utf8");

    expect(() => assertTestCoveragePreserved(snapshot)).toThrow("restored prior artifacts");
    expect(readFileSync(path, "utf8")).toBe(original);
  });

  it("allows fixture repair plus additional coverage", () => {
    const root = mkdtempSync(join(tmpdir(), "hepha-test-coverage-"));
    temporaryRoots.push(root);
    const path = join(root, "workflow.spec.ts");
    writeFileSync(path, `test("existing", () => { expect(true).toBe(true); });\n`, "utf8");
    const snapshot = captureTestCoverageSnapshot(root);

    writeFileSync(path, [
      `test("existing", () => { expect(true).toBe(true); });`,
      `test("added", () => { expect(2).toBe(2); });`,
      "",
    ].join("\n"), "utf8");

    expect(() => assertTestCoveragePreserved(snapshot)).not.toThrow();
  });
});
