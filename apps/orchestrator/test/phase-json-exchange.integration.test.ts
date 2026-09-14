import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PhaseSummary } from "@hepha/shared";
import type { PhaseExecutionRole } from "../src/phase-execution-contract.js";
import { runFinalVerification } from "../src/final-verification-adapter.js";
import { phaseVerificationPath, persistDocumentationApplicability } from "../src/exchanges/phase-verification-repository.js";
import { PhaseCheckpointProjectionRepository } from "../src/workflows/phases/phase-checkpoint-projection-repository.js";
import { scanFeaturePhaseQualityGates } from "../src/memorybank/phase-quality-projection.js";
import { getFirstMissingPhaseQualityGate } from "../src/workflows/phases/phase-quality-evidence-policy.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture(role: PhaseExecutionRole, warning = false, testFails = false) {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-exchange-")); roots.push(root);
  const feature = resolve(root, "feature"); mkdirSync(resolve(feature, "Phases"), { recursive: true });
  const phase = { documentPath: resolve(feature, "Phases/phase-0-any-title.md"), number: 0, title: "Arbitrary title", status: "COMPLETED" } as PhaseSummary & { number: number };
  writeFileSync(phase.documentPath, "# Arbitrary title\n**Status**: COMPLETED\n## Changed Files\n- `docs/specification.md`\n");
  writeFileSync(resolve(feature, "PhaseExecutionContract.json"), JSON.stringify({ schemaVersion: "hepha-phase-execution/v3", phases: [{
    id: "assigned-phase", order: 0, document: `Phases/${basename(phase.documentPath)}`, role,
    tasks: [{ id: "assigned-task", kind: role === "planning" ? "agent" : "verification", required: true, ...(role === "planning" ? {} : { profile: "full" }) }],
    developmentValidation: "none", finalValidation: role === "planning" ? "none" : "full", codeReview: "when_production_code_changes", failurePolicy: "repair_and_rerun", gitCheckpoint: "commit_and_push",
  }] }));
  mkdirSync(resolve(root, ".hepha/safety"), { recursive: true });
  writeFileSync(resolve(root, "model.cjs"), "exports.reverse = xs => [...xs].reverse();\n");
  writeFileSync(resolve(root, "verify.test.cjs"), "const {test}=require('node:test');const assert=require('node:assert/strict');const {reverse}=require('./model.cjs');test('reversal preserves input',()=>{const xs=[1,2,3];assert.deepEqual(reverse(xs),[3,2,1]);assert.deepEqual(xs,[1,2,3]);});\n");
  if (testFails) writeFileSync(resolve(root, "verify.test.cjs"), readFileSync(resolve(root, "verify.test.cjs"), "utf8").replace("[3,2,1]", "[1,2,3]"));
  const checks = [
    { id: "build-app", intent: "build", command: warning ? [process.execPath, "-e", "console.warn('warning: synthetic build diagnostic')"] : [process.execPath, "--check", "model.cjs"] },
    { id: "verify-behavior", intent: "test", command: [process.execPath, "--test", "verify.test.cjs"] },
    { id: "lint-app", intent: "lint", command: [process.execPath, "--check", "verify.test.cjs"] },
    { id: "coverage-telemetry", intent: "coverage", command: [process.execPath, "--version"], runAt: "final_checkpoint", coverage: { reportPath: "coverage/lcov.info", format: "lcov", include: ["model.cjs"], exclude: [], minimumPercent: 80, targetPercent: 95, improvementAttempts: 0 } },
  ].map(check => ({ ...check, description: check.id, workingDirectory: ".", timeout: 10000, required: true }));
  writeFileSync(resolve(root, ".hepha/safety/final-verification-profile.yaml"), JSON.stringify({ version: "2.0", checks }));
  const store = { recordFinalVerificationRun: vi.fn(), recordFinalVerificationCheck: vi.fn(), listStartTransitions: vi.fn(async () => []) };
  const run = () => runFinalVerification({ projectRoot: root, projectId: "project-synthetic", cardKey: "feature-synthetic", workflowRunId: "workflow-synthetic", store: store as never, checkpointKind: role === "final_checkpoint" ? "final_checkpoint" : "phase" });
  const scan = () => scanFeaturePhaseQualityGates([phase], [], root);
  const gap = () => getFirstMissingPhaseQualityGate({ implementationEvidence: { phaseQualityGates: scan() } } as never);
  return { root, feature, phase, run, scan, gap };
}

describe("phase JSON protocol through host execution and readiness", () => {
  it.each(["entry_gate", "final_checkpoint"] as const)("%s health passes without new production code", async role => {
    const f = fixture(role);
    const result = await f.run(); expect(result.aggregate.status).toBe("passed");
    expect(result.aggregate.checks.find(check => check.intent === "test")?.outputSummary).toContain("pass 1");
    new PhaseCheckpointProjectionRepository(() => { throw new Error("Clock unavailable"); }).persist(f.phase, result.aggregate, null, role);
    const json = JSON.parse(readFileSync(phaseVerificationPath(f.phase), "utf8"));
    expect(json.schemaVersion).toBe("hepha-exchange/v1"); expect(json.audit).toBeUndefined();
    expect(f.gap()).toBeNull();
    expect(f.scan()[0]?.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ gate: "build", status: "satisfied" }), expect.objectContaining({ gate: "lint", status: "satisfied" }),
      expect.objectContaining({ gate: "tests", status: "satisfied" }), expect.objectContaining({ gate: "code_review", status: "not_applicable" }),
    ]));
    // Change the display layout completely: JSON remains the decision source.
    writeFileSync(f.phase.documentPath, "# Renamed display\n**Status**: COMPLETED\n<!-- hepha:phase-verification:json-v1 -->\n");
    expect(f.gap()).toBeNull();
  });
  it("documentation completes with explicit N/A despite a project health profile", () => {
    const f = fixture("planning");
    persistDocumentationApplicability(f.feature, f.phase);
    expect(JSON.parse(readFileSync(phaseVerificationPath(f.phase), "utf8")).payload.status).toBe("not_applicable");
    expect(f.gap()).toBeNull();
    expect(f.scan()[0]?.gates.find(gate => gate.gate === "tests")?.status).toBe("not_applicable");
  });
  it.each(["planning", "implementation", "integration", "entry_gate", "final_checkpoint"] as const)("%s follows independent test and review declarations, including after development changes", role => {
    const f = fixture(role);
    writeFileSync(f.phase.documentPath, "## Changed Files\n- `packages/shapes.ts`\n");
    const path = resolve(f.feature, "PhaseExecutionContract.json");
    const contract = JSON.parse(readFileSync(path, "utf8"));
    // The developer revises scope: no behavior to verify, but review still required.
    contract.phases[0].tasks = [{ id: "work", kind: "agent", required: true }, { id: "review", kind: "code_review", required: true, condition: "always" }];
    // Deliberately stale summaries must not override the ordered task flags.
    contract.phases[0].finalValidation = "full";
    writeFileSync(path, JSON.stringify(contract));
    persistDocumentationApplicability(f.feature, f.phase);
    expect(f.scan()[0]?.gates.find(gate => gate.gate === "tests")?.status).toBe("not_applicable");
    expect(f.gap()?.gates).toEqual(["code_review"]);
    contract.phases[0].tasks.pop(); // Scope now explicitly declares no review either.
    writeFileSync(path, JSON.stringify(contract));
    expect(f.gap()).toBeNull();
    // Adding a mandatory verification obligation invalidates the former N/A result.
    contract.phases[0].tasks.push({ id: "verify", kind: "verification", required: true, profile: "full" });
    writeFileSync(path, JSON.stringify(contract));
    expect(f.gap()?.gates).toContain("tests");
  });
  it("a passing configured integration check satisfies acceptance without a browser obligation", async () => {
    const f = fixture("integration");
    writeFileSync(resolve(f.root, "verify.test.cjs"), `
      const {test}=require('node:test'); const assert=require('node:assert/strict');
      test('client and controlled service preserve saved state across their boundary', async()=>{
        const records=new Map(); let calls=0;
        const backend={ async put(key,value){calls++;records.set(key,structuredClone(value));}, async get(key){return records.get(key);} };
        const frontend={ async save(value){await backend.put('active',value);}, async load(){return backend.get('active');} };
        await frontend.save({enabled:true});
        assert.deepEqual(await frontend.load(),{enabled:true}); assert.equal(calls,1);
      });
    `);
    writeFileSync(f.phase.documentPath, "## Changed Files\n- `apps/web/src/widget.tsx`\n");
    const result = await f.run();
    new PhaseCheckpointProjectionRepository().persist(f.phase, result.aggregate, null, "integration");
    expect(f.gap()).toBeNull();
    expect(f.scan()[0]?.gates.find(gate => gate.gate === "gherkin_e2e")?.status).toBe("not_applicable");
    // An explicitly declared browser obligation still needs its own evidence.
    writeFileSync(f.phase.documentPath, readFileSync(f.phase.documentPath, "utf8") + "\n## Quality Gate Evidence\n| Gherkin/Playwright E2E | missing | Required browser acceptance scenario |\n");
    expect(f.gap()?.gates).toContain("gherkin_e2e");
  });
  it("passing phase integration does not waive the EPIC workflow gate at its assigned checkpoint", async () => {
    const f = fixture("integration"); const result = await f.run();
    new PhaseCheckpointProjectionRepository().persist(f.phase, result.aggregate, null, "integration");
    const checkpoint = { ...f.phase, number: 1, documentPath: resolve(f.feature, "Phases/phase-1-workflow.md") };
    writeFileSync(checkpoint.documentPath, "## Phase Quality Gate Contract\n| Gate | Applicability | Rationale |\n| Gherkin/Playwright E2E | REQUIRED | EPIC full frontend-to-backend workflow |\n| Tests | NOT_APPLICABLE | No separate phase behavioral assessment; workflow execution remains required |\n| Code review | NOT_APPLICABLE | Execute assigned workflow without implementation |\n");
    const gates = scanFeaturePhaseQualityGates([f.phase, checkpoint], [], f.root);
    const missing = getFirstMissingPhaseQualityGate({ implementationEvidence: { phaseQualityGates: gates } } as never);
    expect(missing).toMatchObject({ phaseNumber: 1, gates: ["gherkin_e2e"] });
  });
  it("build warnings with exit zero are recorded as failed health verification", async () => {
    const f = fixture("entry_gate", true); const result = await f.run();
    expect(result.aggregate.status).toBe("failed");
    new PhaseCheckpointProjectionRepository().persist(f.phase, result.aggregate, null, "entry_gate");
    expect(f.gap()).toBeNull();
    expect(f.scan()[0]?.warnings.join(" ")).toContain("non-blocking");
    expect(f.scan()[0]?.gates.find(gate => gate.gate === "build")?.justification).toContain("warnings");
  });
  it("a real failed test remains a blocking JSON result", async () => {
    const f = fixture("entry_gate", false, true); const result = await f.run();
    expect(result.aggregate.status).toBe("failed");
    expect(result.aggregate.checks.find(check => check.intent === "test")?.exitCode).not.toBe(0);
    new PhaseCheckpointProjectionRepository().persist(f.phase, result.aggregate, null, "entry_gate");
    expect(f.gap()?.gates).toContain("tests");
  });
  it.each(["malformed", "missing"])("%s native JSON cannot fall back to passing Markdown", async mode => {
    const f = fixture("entry_gate"); const result = await f.run();
    new PhaseCheckpointProjectionRepository().persist(f.phase, result.aggregate, null, "entry_gate");
    if (mode === "missing") rmSync(phaseVerificationPath(f.phase)); else writeFileSync(phaseVerificationPath(f.phase), "{broken");
    expect(f.gap()).not.toBeNull();
    expect(f.scan()[0]?.gates.find(gate => gate.gate === "tests")?.justification).toContain("EXCHANGE_PROTOCOL_");
  });
  it("binds the executed command to the configured check instead of trusting valid JSON", async () => {
    const f = fixture("entry_gate"); const result = await f.run();
    new PhaseCheckpointProjectionRepository().persist(f.phase, result.aggregate, null, "entry_gate");
    const json = JSON.parse(readFileSync(phaseVerificationPath(f.phase), "utf8")); json.payload.checks[0].command = ["different-command"];
    writeFileSync(phaseVerificationPath(f.phase), JSON.stringify(json));
    expect(f.gap()).not.toBeNull();
    expect(f.scan()[0]?.gates.find(gate => gate.gate === "tests")?.justification).toContain("configured execution contract");
  });
  it("keeps the executable scenarios documented", () => {
    const text = readFileSync(new URL("./phase-json-exchange.feature", import.meta.url), "utf8");
    expect(text).toContain("Documentation completion needs no invented test execution");
    expect(text).toContain("Checkpoint health is independent of production edits");
  });
});
