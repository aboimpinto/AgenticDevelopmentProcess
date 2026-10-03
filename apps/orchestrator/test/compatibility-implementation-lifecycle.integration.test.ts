// Execution fixtures assert TAP evidence; pin the reporter across Node versions.
import { persistManualTestObligation, MANUAL_TEST_DEFERRAL_SCHEMA, MANUAL_TEST_SKIP_REASON } from "../src/manual-test-obligation.js";
import { phaseGatesProtocol, type PhaseGateRecord } from "../src/exchanges/phase-gates.js";
import { createCardMetadataStore } from "@hepha/db";
import type { HandoffPlanV1, MemoryBankStateFolder, WorkItemCard } from "@hepha/shared";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFeatureRecipeSourceApplications } from "../src/bootstrap/feature-recipe-source-applications.js";
import { ImplementationRunSummaryProjector } from "../src/application/features/implementation-run-summary-projector.js";
import { createFeatureProjectionApplications } from "../src/bootstrap/feature-projection-applications.js";
import { createFeatureRecipeSourcePolicy } from "../src/workflows/recipes/feature-recipe-source-policy.js";
import { scanMemoryBankFolders } from "../src/memorybank-scanner.js";
import { createUiRequirementSourceHash } from "../src/workflows/prompts/feature-entry-prompts.js";
import type { ImplementationWorkerInput } from "../src/workflows/phases/implementation-worker-application.js";

const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).reverse().forEach((fn) => fn()));

async function fixture(initialCompleted = 2, initialState: MemoryBankStateFolder = "03_IN_PROGRESS") {
  const rootPath = mkdtempSync(resolve(tmpdir(), "hepha-lifecycle-"));
  cleanup.push(() => rmSync(rootPath, { recursive: true, force: true }));
  const store = createCardMetadataStore({ HEPHA_DATABASE_PATH: resolve(rootPath, "test.sqlite") });
  cleanup.push(() => store.close());
  const memoryBankPath = resolve(rootPath, "MemoryBank");
  const project = { id: "synthetic", name: "Sample", rootPath, memoryBankPath, createdAt: "2031-01-01", updatedAt: "2031-01-01" };
  const externalId = ["FEAT", "803"].join("-");
  const cardKey = `feature:${externalId}`;
  const initialized = spawnSync("git", ["init", "-b", `feat/${externalId}-sample`, rootPath], { encoding: "utf8" });
  if (initialized.status !== 0) throw new Error(initialized.stderr);
  const states: MemoryBankStateFolder[] = ["02_READY_TO_DEVELOP", "03_IN_PROGRESS", "04_COMPLETED"];
  let state = initialState;
  let folder = resolve(memoryBankPath, "Features", state, `${externalId}-sample`);
  let completed = initialCompleted;
  const calls: ImplementationWorkerInput[] = [];
  const events: string[] = [];
  function save(status = state === "02_READY_TO_DEVELOP" ? "READY_TO_DEVELOP" : state === "04_COMPLETED" ? "COMPLETED" : "IN_PROGRESS") {
    mkdirSync(resolve(folder, "Phases"), { recursive: true });
    writeFileSync(resolve(folder, "FeatureDescription.md"), `# Sample\n\n**Feature ID**: ${externalId}\n\n## Scope\n\nImplement the sample capability.\n`);
    writeFileSync(resolve(folder, "FeatureTasks.md"), ["# Feature Tasks", `**Status**: ${status}`, "", "| Phase | Name | Status | Details |", "| --- | --- | --- | --- |",
      ...Array.from({ length: 9 }, (_, n) => `| ${n} | Work ${n} | ${n < completed ? "COMPLETED" : "PENDING"} | [Link](Phases/phase-${n}-work.md) |`),
    ].join("\n"));
    for (let n = 0; n < 9; n++) writeFileSync(resolve(folder, "Phases", `phase-${n}-work.md`),
      `# Phase ${n}: Work\n\n**Status**: ${n < completed ? "COMPLETED" : "PENDING"}\n\n## Phase Task Ledger\n- [${n < completed ? "x" : " "}] [contract:work-${n}] Implement and verify capability\n\n## Phase Checkpoint\n\n### Test Verification\nNot applicable: synthetic document-only deliverable.\n### Code Review\nNot applicable: synthetic document-only deliverable.\n`);
  }
  function move(next: MemoryBankStateFolder) {
    const target = resolve(memoryBankPath, "Features", next, `${externalId}-sample`);
    mkdirSync(resolve(target, ".."), { recursive: true });
    renameSync(folder, target); folder = target; state = next;
  }
  save();
  const scan = () => scanMemoryBankFolders(project, states, Object.fromEntries(states.map(s => [s, s])) as Record<MemoryBankStateFolder, string>);
  const metadata = () => store.getCardMetadata(project.id, cardKey);
  await store.reconcileScannedCards(scan().map(x => x.metadata));
  function acceptPhase(n: number) {
    const path = resolve(folder, "Phases", `phase-${n}-work.md`);
    writeFileSync(path, readFileSync(path, "utf8").replace("**Status**: PENDING", "**Status**: COMPLETED").replace("- [ ]", "- [x]"));
    const tasks = resolve(folder, "FeatureTasks.md");
    writeFileSync(tasks, readFileSync(tasks, "utf8").replace(`| ${n} | Work ${n} | PENDING |`, `| ${n} | Work ${n} | COMPLETED |`));
    writeFileSync(`${path}.gates.json`, phaseGatesProtocol.encode({ phaseId: `phase-${n}-work.md`, flags: { needCodeReview: false, needTestCoverage: false }, criteria: [], checks: [],
      coverage: { outcome: "not_applicable", criteria: [], reason: "Synthetic document-only task" }, review: { outcome: "not_applicable", reason: "Synthetic document-only task" } }));
    completed = Math.max(completed, n + 1);
  }
  function finish() {
    move("04_COMPLETED");
    const tasks = resolve(folder, "FeatureTasks.md");
    writeFileSync(tasks, readFileSync(tasks, "utf8").replace("**Status**: IN_PROGRESS", "**Status**: COMPLETED"));
  }
  let behavior = async (input: ImplementationWorkerInput) => {
    if (input.agentAction === "refine-feature") { save(); return "Refined"; }
    if (input.phaseNumber !== null && input.phaseNumber < completed) return "Existing gate needs repair; no evidence changed.";
    if (state === "02_READY_TO_DEVELOP") { move("03_IN_PROGRESS"); save(); }
    const autonomous = input.prompt.includes('"workflow_mode":"autonomous"');
    if (autonomous) {
      while (completed < 9) acceptPhase(completed);
      finish();
    } else if (completed < 9) acceptPhase(completed);
    return "Requested action returned.";
  };
  const policy = createFeatureRecipeSourcePolicy({ HEPHA_FEATURE_RECIPE_SOURCE: "devcycle-mcp" });
  const routes = createFeatureRecipeSourceApplications({
    metadataStore: store,
    native: Object.fromEntries(["designFeature", "refineFeature", "startImplementing", "continueImplementing", "completeFeature"].map(k => [k, async () => { throw new Error("Unexpected native dispatch"); }])) as never,
    notifyChanged: (_p, event) => { events.push(event); }, policy,
    routeResolver: { resolvePlan: (actionId) => ({ resolvedRoute: { action: { actionId } } }) as HandoffPlanV1 },
    targets: { resolveCompatibility: async () => ({ feature: { ...scan().find(x => x.card.folderPath === folder)!.card, featureWorkflow: { uiRequirementDecision: "no_ui" } } as WorkItemCard, project }) },
    workItems: { scan: async () => scan().map(x => x.card) },
    worker: { execute: async input => { calls.push(input); return behavior(input); } },
  });
  async function run(autonomous?: boolean, operation: "startImplementing" | "continueImplementing" | "refineFeature" = "continueImplementing") {
    await routes[operation]({ projectId: project.id, cardId: scan()[0]!.card.id, ...(autonomous === undefined ? {} : { autonomous }) });
    await vi.waitFor(async () => expect((await metadata())?.workflowStatus).not.toBe("running"));
    return metadata();
  }
  function projection(activeMetadata: Awaited<ReturnType<typeof metadata>> = null) {
    const scanned = scan()[0]!;
    return createFeatureProjectionApplications({ metadataStoreEnabled: true, recipeSourceFor: policy.sourceFor, getDefaultImplementationModel: () => null,
      implementationRunSummary: new ImplementationRunSummaryProjector({ findLatestReviewReport: () => null, summarizeOutput: (s) => s }), workspaceRoot: process.cwd(),
    }).featureWorkflowSummaryProjector.build({ item: scanned.card, documentHash: "source", metadata: {
      ...activeMetadata, uiRequirementDecision: "no_ui", uiRequirementSourceHash: createUiRequirementSourceHash("source"),
    } as never, validation: { needsValidationCount: 0, changedSinceHephaDeepDive: false, deepDiveStatus: "current" } as never,
    featureFindings: [], implementationAgentRuns: [], implementationPhaseRuns: [] });
  }
  return { run, calls, events, metadata, projection, save, move, finish, acceptPhase, store, project, cardKey,
    folder: () => folder, completed: () => completed, behavior: (fn: typeof behavior) => { behavior = fn; } };
}

describe("compatibility implementation lifecycle across scanner, validator, SQLite and dashboard", () => {
  it("updates progress from saved phase files while the same autonomous worker stays running", async () => {
    const f = await fixture();
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    f.behavior(async () => {
      await waiting;
      f.acceptPhase(3);
      for (let n = 4; n < 9; n++) f.acceptPhase(n);
      f.finish();
      return "Finished";
    });
    const run = f.run(true);
    try {
      await vi.waitFor(() => expect(f.calls).toHaveLength(1));
      // These writes represent MCP/Pi's artifacts, not HEPHA conversation turns.
      f.acceptPhase(2);
      const path = resolve(f.folder(), "Phases/phase-3-work.md");
      writeFileSync(path, readFileSync(path, "utf8").replace("**Status**: PENDING", "**Status**: IN_PROGRESS"));
      const tasks = resolve(f.folder(), "FeatureTasks.md");
      writeFileSync(tasks, readFileSync(tasks, "utf8").replace("| 3 | Work 3 | PENDING |", "| 3 | Work 3 | IN_PROGRESS |"));
      expect(f.projection(await f.metadata())?.activeRun).toMatchObject({ status: "running", currentStep: expect.stringContaining("Phase 3") });
      expect(f.calls).toHaveLength(1);
      // Return the in-progress fixture to a completable state before release.
      writeFileSync(path, readFileSync(path, "utf8").replace("**Status**: IN_PROGRESS", "**Status**: PENDING"));
      writeFileSync(tasks, readFileSync(tasks, "utf8").replace("| 3 | Work 3 | IN_PROGRESS |", "| 3 | Work 3 | PENDING |"));
    } finally { release(); }
    expect((await run)?.workflowStatus).toBe("completed");
    expect(f.calls).toHaveLength(1);
  });

  it("does not dispatch another session after a partial autonomous return", async () => {
    const f = await fixture();
    f.behavior(async () => { f.acceptPhase(2); return "Phase saved; work remains"; });
    expect(await f.run(true)).toMatchObject({ workflowStatus: "blocked", workflowSummary: expect.stringContaining("ACTION_INCOMPLETE") });
    expect(f.calls).toHaveLength(1);
    expect(f.completed()).toBe(3);
  });

  it.each(["valid", "wrong_version", "missing_flag"])("consumes the returned MCP gate contract and validates the published record (%s)", async variant => {
    const scenario = "Returned MCP gate schema interoperates with host phase admission";
    expect(readFileSync(new URL("./compatibility-implementation-lifecycle.feature", import.meta.url), "utf8")).toContain(`Scenario: ${scenario}`);
    // Independent provider fixture: do not generate it with the host encoder.
    const response = JSON.parse(readFileSync(new URL("./fixtures/mcp-phase-gate-response.json", import.meta.url), "utf8"));
    expect(response.structuredContent).toMatchObject({ status: "pending_execution", action: "execute_procedure", execution_owner: "client_llm", retry_same_tool: false });
    const contract = response.structuredContent.phase_gate_exchange_schema;
    expect(contract).toEqual(phaseGatesProtocol.schema);
    expect(response.structuredContent.instructions).toContain("Publish the supplied phase.gates");
    const f = await fixture();
    const mcp = vi.fn(() => response);
    f.behavior(async input => {
      if (input.step === "Repairing phase quality gates") return "No repair found; investigate the incompatible exchange.";
      const invocation = input.prompt.match(/```js\n(mcp\([^\n]+\))\n```/)?.[1];
      expect(invocation).toBeDefined();
      const recipe = runInNewContext(invocation!, { mcp }, { timeout: 1000 }).structuredContent;
      const phaseId = `phase-${input.phaseNumber}-work.md`;
      const gateSchema = recipe.phase_gate_exchange_schema;
      // Simulate the recipe publisher using the returned wire contract, not
      // phaseGatesProtocol.encode, then exercise real disk/scanner/host admission.
      const record = {
        schemaVersion: variant === "wrong_version" ? "incompatible/v2" : gateSchema.properties.schemaVersion.const,
        kind: gateSchema.properties.kind.const,
        payload: {
          phaseId, flags: { needCodeReview: false, ...(variant === "missing_flag" ? {} : { needTestCoverage: false }) },
          criteria: [], checks: [],
          coverage: { outcome: "not_applicable", criteria: [], reason: "Documentation-only deliverable; no behavioral coverage assigned." },
          review: { outcome: "not_applicable", reason: "Documentation-only deliverable; no production changes." },
        },
      };
      const phasePath = resolve(f.folder(), "Phases", phaseId);
      writeFileSync(`${phasePath}.gates.json`, JSON.stringify(record));
      writeFileSync(phasePath, readFileSync(phasePath, "utf8").replace("PENDING", "COMPLETED").replace("- [ ]", "- [x]"));
      const tasks = resolve(f.folder(), "FeatureTasks.md");
      writeFileSync(tasks, readFileSync(tasks, "utf8").replace(`| ${input.phaseNumber} | Work ${input.phaseNumber} | PENDING |`, `| ${input.phaseNumber} | Work ${input.phaseNumber} | COMPLETED |`));
      return "Recipe published its phase gate exchange.";
    });
    const result = await f.run(false);
    expect(mcp).toHaveBeenCalledExactlyOnceWith({ server: "devcycle-mcp", tool: "continue-implementation", args: {
      feature_id: f.cardKey.split(":")[1], feature_path: f.folder(), workflow_mode: "single_phase",
    } });
    expect(result?.workflowStatus).toBe(variant === "valid" ? "completed" : "blocked");
    if (variant === "valid") expect(f.calls).toHaveLength(1);
    else expect(result?.workflowSummary).toContain("QUALITY_GATES_BLOCKED");
    expect(f.folder()).toContain("03_IN_PROGRESS");
  });

  it.each([false, true])("reconciles legacy execution layouts before final completion (failed=%s)", async failed => {
    const scenario = "Equivalent execution records permit finalization with optional health warnings";
    expect(readFileSync(new URL("./compatibility-implementation-lifecycle.feature", import.meta.url), "utf8")).toContain(`Scenario: ${scenario}`);
    const f = await fixture(9);
    const path = resolve(f.folder(), "Phases/phase-7-work.md");
    const script = resolve(f.folder(), "verify.test.cjs");
    writeFileSync(script, "const {test}=require('node:test');const assert=require('node:assert/strict');test('preserves value',()=>assert.equal(2+3,5));");
    const execution = spawnSync(process.execPath, ["--test", "--test-reporter=tap", script], { encoding: "utf8" });
    expect(execution.status).toBe(0);
    writeFileSync(resolve(f.folder(), "execution.log"), execution.stdout + execution.stderr);
    writeFileSync(path, readFileSync(path, "utf8") + [
      "| Gate | Command | Result |", "| --- | --- | --- |",
      "| Partition suite | node --test --test-reporter=tap verify.test.cjs | PASS — behavior 1, all 0 failed |",
      "| Boundary fixtures/live | node --test --test-reporter=tap verify.test.cjs | PASS — 1 fixture OK; no forbidden dependency |",
      "| Supporting target | runner test | PASS — exit 0, 0 tests |",
      `| Lint | analyzer check | ${failed ? "FAIL — 1 warning" : "PASS — exit 0, zero warnings"} |`,
      "## Phase Quality Gate Contract", "| Gate | Applicability | Rationale |",
      "| Tests | REQUIRED | Run behavior verification |", "| Build | REQUIRED | Compile the scoped target |", "| Lint | REQUIRED | Analyze scope |",
      "## Quality Metrics", "| Value | Metric |", "| --- | --- |",
      "| PASS — target compiled | Build / compile |", "| PASS — summary cannot hide a failure | Lint |",
    ].join("\n"));
    const result = await f.run(true);
    expect(result?.workflowStatus).toBe("completed");
    expect(f.calls.map(call => call.agentAction)).toEqual(["continue-implementing"]);
    // Reconciliation never rewrites evidence or dispatches another verification
    // solely to repair the presentation of an existing execution result.
    expect(f.folder()).toContain("04_COMPLETED");
  });
  it.each([false, true])("checkpoint execution and review permit continuation only when passing (failed=%s)", async failed => {
    const f = await fixture(7);
    const scenario = failed ? "Failed checkpoint execution still blocks continuation" : "Recorded execution and approved review survive Markdown layout differences";
    expect(readFileSync(new URL("./compatibility-implementation-lifecycle.feature", import.meta.url), "utf8")).toContain(`Scenario: ${scenario}`);
    const testPath = resolve(f.folder(), "verify.test.cjs");
    writeFileSync(testPath, `const {test}=require('node:test'); const assert=require('node:assert/strict');\ntest('retains message order',()=>assert.deepEqual(['first','second'].map(x=>x.toUpperCase()),${failed ? "['SECOND','FIRST']" : "['FIRST','SECOND']"}));`);
    const execution = spawnSync(process.execPath, ["--test", "--test-reporter=tap", testPath], { encoding: "utf8" });
    expect(execution.status).toBe(failed ? 1 : 0);
    writeFileSync(resolve(f.folder(), "execution.log"), execution.stdout + execution.stderr);
    const phasePath = resolve(f.folder(), "Phases/phase-6-work.md");
    writeFileSync(phasePath, readFileSync(phasePath, "utf8") + [
      "| Gate | Command | Expected | Result |", "| --- | --- | --- | --- |",
      `| Ordering regressions | \`node --test --test-reporter=tap verify.test.cjs\` | Green | ${failed ? "FAIL — 0 fixtures passed; 1 fixture failed" : "PASS — 1/1 fixtures OK; 0 failed"} |`,
      "", "- Changed files: `modules/format.ts`,", "  `modules/format.rs`.",
    ].join("\n"));
    const reviews = resolve(f.folder(), "code-reviews/phase-6");
    mkdirSync(reviews, { recursive: true });
    writeFileSync(resolve(reviews, "review.md"), [
      "# Review", "**Phase**: Phase 6 - Work", "**Status**: APPROVED",
      "## Quality Gate Evidence", "| Gate | Decision | Evidence / Justification |", "| --- | --- | --- |",
      "| Code review | satisfied | Reviewed the scoped implementation |",
    ].join("\n"));
    const result = await f.run(false);
    expect(result?.workflowStatus).toBe(failed ? "blocked" : "completed");
    expect(f.calls.map(call => call.phaseNumber)).toEqual(failed ? [6] : [7]);
    if (failed) expect(result?.workflowSummary).toContain("QUALITY_GATES_BLOCKED");
    expect(f.folder()).toContain("03_IN_PROGRESS");
  });
  it("does not advance after a worker marks a phase completed with missing test and review evidence", async () => {
    const f = await fixture(2);
    f.behavior(async () => {
      const path = resolve(f.folder(), "Phases", "phase-2-work.md");
      writeFileSync(path, readFileSync(path, "utf8").replace("PENDING", "COMPLETED").replace("- [ ]", "- [x]") +
        "\n## Quality Gate Evidence\n| Gate | Status | Evidence |\n| Tests | Missing | No recorded execution result |\n| Code Review | Missing | No accepted review |\n");
      const tasks = resolve(f.folder(), "FeatureTasks.md");
      writeFileSync(tasks, readFileSync(tasks, "utf8").replace("| 2 | Work 2 | PENDING |", "| 2 | Work 2 | COMPLETED |"));
      return "Phase complete, all green";
    });
    const result = await f.run(true);
    expect(result?.workflowStatus).toBe("blocked");
    expect(result?.workflowSummary).toContain("IMPLEMENTATION_QUALITY_GATES_BLOCKED");
    expect(result?.workflowSummary).toContain("unresolved declared evidence");
    expect(f.calls).toHaveLength(1);
    expect(f.calls.every(c => c.phaseNumber === 2)).toBe(true);
    expect(f.events).not.toContain("workflow.completed");
  });

  it.each(["Missing", "Unknown", "Waived"])("does not finalize all-completed phases with a %s gate lacking evidence or justification", async status => {
    const f = await fixture(9);
    const path = resolve(f.folder(), "Phases", "phase-7-work.md");
    writeFileSync(path, readFileSync(path, "utf8") + `\n## Quality Gate Evidence\n| Gate | Status | Evidence |\n| Tests | ${status} | |\n`);
    expect(await f.run(true)).toMatchObject({ workflowStatus: "blocked", workflowSummary: expect.stringContaining("QUALITY_GATES_BLOCKED") });
    expect(f.calls).toHaveLength(1);
    expect(f.calls.every(c => c.phaseNumber === 7)).toBe(true);
    expect(f.folder()).toContain("03_IN_PROGRESS");
  });
  it.each([0, 4, 7])("delegates the entire autonomous action from %s completed phases to one worker", async count => {
    const f = await fixture(count, count === 0 ? "02_READY_TO_DEVELOP" : "03_IN_PROGRESS");
    if (count === 0) await f.run(false, "refineFeature");
    const result = await f.run(true, count === 0 ? "startImplementing" : "continueImplementing");
    expect(result?.workflowStatus).toBe("completed");
    expect(f.completed()).toBe(9);
    const implementationCalls = f.calls.filter(x => x.agentAction !== "refine-feature");
    expect(implementationCalls).toHaveLength(1);
    expect(implementationCalls[0]!.phaseNumber).toBe(count);
    expect(f.folder()).toContain("04_COMPLETED");
    expect(implementationCalls[0]!.prompt).toContain('"workflow_mode":"autonomous"');

  });

  it.each([false, undefined])("respects supervised mode including omitted autonomy (%s)", async autonomous => {
    const f = await fixture();
    const result = await f.run(autonomous);
    expect(result?.workflowStatus).toBe("completed");
    expect(f.calls).toHaveLength(1);
    expect(f.completed()).toBe(3);
    expect(f.folder()).toContain("03_IN_PROGRESS");
    expect(f.calls[0]!.prompt).toContain('"workflow_mode":"single_phase"');
    const prompt = f.calls[0]!.prompt;
    expect(prompt).toContain("phase-2-work.md.gates.json");
    expect(prompt).toContain(".hepha/phase-evidence/");
    expect(prompt).toContain("MCP response");
    expect(prompt).not.toContain("HEPHA owns the outer workflow");
    expect(prompt).not.toContain('"$schema"');
    expect(prompt).not.toContain("Logical acceptance coverage:");
    expect(prompt).not.toContain("project-test-plan-authoring/v1");
    expect(Buffer.byteLength(prompt)).toBeLessThan(6000);
  });

  it("allows known lifecycle folder aliases and canonicalizes the status during execution", async () => {
    const f = await fixture(); f.save("03_IN_PROGRESS");
    expect(f.projection()).toMatchObject({ canContinueImplementing: true });
    expect(readFileSync(resolve(f.folder(), "FeatureTasks.md"), "utf8")).toContain("**Status**: 03_IN_PROGRESS");
    f.behavior(async () => "No progress");
    await f.run(false);
    expect(readFileSync(resolve(f.folder(), "FeatureTasks.md"), "utf8")).toContain("**Status**: IN_PROGRESS");
  });

  it("blocks bounded no-progress returns without claiming completion", async () => {
    const f = await fixture(); f.behavior(async () => "Everything is green; resume later");
    const result = await f.run(true);
    expect(result?.workflowStatus).toBe("blocked");
    expect(result?.workflowSummary).toContain("ACTION_INCOMPLETE");
    expect(f.calls).toHaveLength(1);
    expect(f.events).not.toContain("workflow.completed");
  });

  it("preserves cancellation after a worker returns and never launches the next worker", async () => {
    const f = await fixture(); f.behavior(async () => {
      const run = (await f.metadata())!;
      await f.store.recordFeatureWorkflowRun({ projectId: f.project.id, cardKey: f.cardKey, command: "continue-implementing", runId: run.workflowRunId!, status: "cancelled", summary: "Cancelled by user" });
      return "Completed";
    });
    expect((await f.run(true))?.workflowStatus).toBe("cancelled");
    expect(f.calls).toHaveLength(1);
    expect(f.events).not.toContain("workflow.completed");
  });

  it("rejects malformed post-worker state before another dispatch", async () => {
    const f = await fixture(); f.behavior(async () => { f.save("BROKEN"); return "Success"; });
    expect((await f.run(true))?.workflowStatus).toBe("failed");
    expect(f.calls).toHaveLength(1);
  });

  it("does not accept a terminal folder while phases remain unfinished", async () => {
    const f = await fixture(); f.behavior(async () => { f.move("04_COMPLETED"); f.save(); return "Feature complete"; });
    expect((await f.run(true))?.workflowStatus).toBe("failed");
    expect(f.calls).toHaveLength(1);
  });

  it("reports runtime artifact defects as continuation repair rather than Deep Dive", async () => {
    const f = await fixture(); f.save("BROKEN");
    const summary = f.projection()!;
    expect(summary.canContinueImplementing).toBe(false);
    expect(summary.workflowMessage.toLowerCase()).not.toContain("deep-dive");
    expect(summary.workflowMessage).toContain("INVALID_FEATURE_STATUS");
  });

  it("requires another user action after a partial supervised return, using a fresh workflow", async () => {
    const f = await fixture();
    f.behavior(async () => {
      const phasePath = resolve(f.folder(), "Phases", "phase-2-work.md");
      if (f.calls.length === 1) {
        writeFileSync(phasePath, readFileSync(phasePath, "utf8").replace("- [ ]", "- [x]"));
      } else {
        writeFileSync(phasePath, readFileSync(phasePath, "utf8").replace("**Status**: PENDING", "**Status**: COMPLETED"));
        const taskPath = resolve(f.folder(), "FeatureTasks.md");
        writeFileSync(taskPath, readFileSync(taskPath, "utf8").replace("| 2 | Work 2 | PENDING |", "| 2 | Work 2 | COMPLETED |"));
      }
      if (readFileSync(phasePath, "utf8").includes("**Status**: COMPLETED")) writeFileSync(`${phasePath}.gates.json`, phaseGatesProtocol.encode({ phaseId: "phase-2-work.md", flags: { needCodeReview: false, needTestCoverage: false }, criteria: [], checks: [], review: { outcome: "not_applicable", reason: "Document deliverable." }, coverage: { outcome: "not_applicable", reason: "Document deliverable.", criteria: [] } }));
      return "Checkpoint saved; fresh session needed";
    });
    expect((await f.run(false))?.workflowStatus).toBe("blocked");
    expect(f.calls).toHaveLength(1);
    expect((await f.run(false))?.workflowStatus).toBe("completed");
    expect(f.calls.map(call => call.phaseNumber)).toEqual([2, 2]);
    expect(f.calls[0]!.runId).not.toBe(f.calls[1]!.runId);
  });

  it("stops immediately at a persisted blocked phase instead of retrying or declaring success", async () => {
    const f = await fixture(); f.behavior(async () => {
      const phasePath = resolve(f.folder(), "Phases", "phase-2-work.md");
      writeFileSync(phasePath, readFileSync(phasePath, "utf8").replace("**Status**: PENDING", "**Status**: BLOCKED"));
      const taskPath = resolve(f.folder(), "FeatureTasks.md");
      writeFileSync(taskPath, readFileSync(taskPath, "utf8").replace("| 2 | Work 2 | PENDING |", "| 2 | Work 2 | BLOCKED |"));
      return "Required test service unavailable";
    });
    expect((await f.run(true))?.workflowStatus).toBe("blocked");
    expect(f.calls).toHaveLength(1);
  });

  it("preserves an actual worker failure without treating it as a yield", async () => {
    const f = await fixture(); f.behavior(async () => { throw new Error("Configured test gate failed"); });
    expect(await f.run(true)).toMatchObject({ workflowStatus: "failed", workflowError: expect.stringContaining("Configured test gate failed") });
    expect(f.calls).toHaveLength(1);
  });

  it("rejects inconsistent phase projections before admitting continuation", async () => {
    const f = await fixture();
    const path = resolve(f.folder(), "Phases", "phase-3-work.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("**Status**: PENDING", "**Status**: COMPLETED"));
    await expect(f.run(true)).rejects.toThrow("PHASE_STATUS_MISMATCH");
    expect(f.calls).toHaveLength(0);
  });

  it("rejects arbitrary folder prefixes and a valid status hidden below the document header", async () => {
    const f = await fixture();
    for (const status of ["99_IN_PROGRESS", "UNKNOWN"]) {
      f.save(status);
      const path = resolve(f.folder(), "FeatureTasks.md");
      writeFileSync(path, readFileSync(path, "utf8") + "\n## Old history\n**Status**: IN_PROGRESS\n");
      await expect(f.run(true)).rejects.toThrow("INVALID_FEATURE_STATUS");
    }
    expect(f.calls).toHaveLength(0);
  });

  it("offers Continue for a recoverable stale header without claiming valid artifacts or requiring preparation", async () => {
    const f = await fixture(1); f.save("READY_TO_DEVELOP");
    expect(f.projection()).toMatchObject({ canContinueImplementing: true, hasContinuationArtifacts: false,
      canStartImplementing: false, canCreateUiRequirements: false, canRefineFeature: false,
      workflowMessage: expect.stringContaining("repair") });
    expect(readFileSync(resolve(f.folder(), "FeatureTasks.md"), "utf8")).toContain("READY_TO_DEVELOP");
    expect((await f.run(false))?.workflowStatus).toBe("completed");
    expect(f.calls.map(c => c.phaseNumber)).toEqual([1]);
    expect(f.events).toContain("workflow.recovered");
  });

  it("repairs a partial start status before accepting the authorized phase", async () => {
    const f = await fixture(0, "02_READY_TO_DEVELOP");
    f.behavior(async () => {
      f.move("03_IN_PROGRESS"); f.save("READY_TO_DEVELOP");
      const phase = resolve(f.folder(), "Phases", "phase-0-work.md");
      writeFileSync(phase, readFileSync(phase, "utf8").replace("PENDING", "COMPLETED").replace("- [ ]", "- [x]"));
      const tasks = resolve(f.folder(), "FeatureTasks.md");
      writeFileSync(tasks, readFileSync(tasks, "utf8").replace("| 0 | Work 0 | PENDING |", "| 0 | Work 0 | COMPLETED |"));
      writeFileSync(`${phase}.gates.json`, phaseGatesProtocol.encode({ phaseId: "phase-0-work.md", flags: { needCodeReview: false, needTestCoverage: false }, criteria: [], checks: [], review: { outcome: "not_applicable", reason: "Document scope." }, coverage: { outcome: "not_applicable", reason: "Document scope.", criteria: [] } }));
      return "Started and phase accepted";
    });
    expect((await f.run(false, "startImplementing"))?.workflowStatus).toBe("completed");
    expect(f.calls).toHaveLength(1);
    expect(readFileSync(resolve(f.folder(), "FeatureTasks.md"), "utf8")).toContain("**Status**: IN_PROGRESS");
    expect(f.events).toContain("workflow.recovered");
  });

  it("rejects an unverified folder move without launching a hidden repair worker", async () => {
    const f = await fixture(0, "02_READY_TO_DEVELOP");
    f.behavior(async () => "Folder moved; all good");
    expect(await f.run(false, "startImplementing")).toMatchObject({ workflowStatus: "failed", workflowError: expect.stringContaining("COMPATIBILITY_STATE_CONFLICT") });
    expect(f.calls).toHaveLength(1);
    expect(f.folder()).toContain("02_READY_TO_DEVELOP");
    expect(f.events).not.toContain("workflow.completed");
  });

  it("does not select a duplicate feature location for recovery", async () => {
    const f = await fixture(1); f.save("READY_TO_DEVELOP");
    cpSync(f.folder(), resolve(f.folder(), "..", "..", "02_READY_TO_DEVELOP", "FEAT-803-copy"), { recursive: true });
    // Resolve a particular target as the HTTP command does; scan still returns both identities.
    expect(await f.run(false)).toMatchObject({ workflowStatus: "failed", workflowError: expect.stringContaining("COMPATIBILITY_FEATURE_LOCATION") });
    expect(f.calls).toHaveLength(0);
  });

  it("preserves cancellation during start and never launches a recovery worker", async () => {
    const f = await fixture(0, "02_READY_TO_DEVELOP");
    f.behavior(async () => {
      const run = (await f.metadata())!;
      await f.store.recordFeatureWorkflowRun({ projectId: f.project.id, cardKey: f.cardKey, command: "start-implementing", runId: run.workflowRunId!, status: "cancelled", summary: "Cancelled during start" });
      f.move("03_IN_PROGRESS"); f.save();
      return "Done";
    });
    expect((await f.run(false, "startImplementing"))?.workflowStatus).toBe("cancelled");
    expect(f.calls).toHaveLength(1);
    expect(f.events).not.toContain("workflow.completed");
  });

  it("blocks a repeated mismatch rather than silently repairing every worker return", async () => {
    const f = await fixture(1); f.save("READY_TO_DEVELOP");
    f.behavior(async () => { f.save("READY_TO_DEVELOP"); return "Done"; });
    expect(await f.run(false)).toMatchObject({ workflowStatus: "blocked", workflowSummary: expect.stringContaining("RECOVERY_EXHAUSTED") });
    expect(f.calls).toHaveLength(1);
  });

  it("does not offer a header repair when phase evidence is also inconsistent", async () => {
    const f = await fixture(1); f.save("READY_TO_DEVELOP");
    const path = resolve(f.folder(), "Phases", "phase-2-work.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("PENDING", "COMPLETED"));
    expect(f.projection()?.canContinueImplementing).toBe(false);
    await expect(f.run(false)).rejects.toThrow("PHASE_STATUS_MISMATCH");
    expect(f.calls).toHaveLength(0);
  });

  it("does not mistake pre-launch manual-task seeding for supervised worker scope expansion", async () => {
    const f = await fixture(0, "02_READY_TO_DEVELOP");
    persistManualTestObligation(f.folder(), "FEAT-803", {
      schemaVersion: MANUAL_TEST_DEFERRAL_SCHEMA, id: "physical", title: "Physical target check",
      reason: MANUAL_TEST_SKIP_REASON, phaseNumber: 4, taskId: "work-4",
      preconditions: ["Physical target available"], steps: ["Inspect the target"],
      expectedResult: "Target behaves as specified", evidenceRequirements: ["Record the outcome"],
    });
    f.behavior(async () => {
      const future = resolve(f.folder(), "Phases/phase-4-work.md");
      expect(readFileSync(future, "utf8")).toContain("- [x]");
      f.move("03_IN_PROGRESS");
      const tasks = resolve(f.folder(), "FeatureTasks.md");
      writeFileSync(tasks, readFileSync(tasks, "utf8").replace("READY_TO_DEVELOP", "IN_PROGRESS"));
      f.acceptPhase(0);
      return "Selected phase completed; manual obligation still pending";
    });
    expect(await f.run(false, "startImplementing")).toMatchObject({ workflowStatus: "completed" });
    expect(f.calls).toHaveLength(1);
    expect(readFileSync(resolve(f.folder(), "ManualTestObligations.json"), "utf8")).toContain('"PENDING"');
  });

  it("rejects supervised task progress in another phase even before its phase status changes", async () => {
    const f = await fixture();
    f.behavior(async () => {
      const path = resolve(f.folder(), "Phases/phase-3-work.md");
      writeFileSync(path, readFileSync(path, "utf8").replace("- [ ]", "- [-]"));
      return "Started a later task";
    });
    expect(await f.run(false)).toMatchObject({ workflowStatus: "failed", workflowError: expect.stringContaining("SCOPE_EXCEEDED") });
    expect(f.calls).toHaveLength(1);
  });

  it("rejects regression of completed tasks inside an unfinished phase", async () => {
    const f = await fixture();
    const path = resolve(f.folder(), "Phases/phase-2-work.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("- [ ]", "- [x]"));
    f.behavior(async () => {
      writeFileSync(path, readFileSync(path, "utf8").replace("- [x]", "- [ ]"));
      return "Reset the task";
    });
    expect(await f.run(true)).toMatchObject({ workflowStatus: "failed", workflowError: expect.stringContaining("STATE_REGRESSION") });
    expect(f.calls).toHaveLength(1);
  });

  it("rejects a worker that crosses the supervised phase boundary", async () => {
    const f = await fixture(); f.behavior(async () => {
      for (const n of [2, 3]) {
        const path = resolve(f.folder(), "Phases", `phase-${n}-work.md`);
        writeFileSync(path, readFileSync(path, "utf8").replace("**Status**: PENDING", "**Status**: COMPLETED").replace("- [ ]", "- [x]"));
        const taskPath = resolve(f.folder(), "FeatureTasks.md");
        writeFileSync(taskPath, readFileSync(taskPath, "utf8").replace(`| ${n} | Work ${n} | PENDING |`, `| ${n} | Work ${n} | COMPLETED |`));
      }
      return "Completed two phases";
    });
    expect(await f.run(false)).toMatchObject({ workflowStatus: "failed", workflowError: expect.stringContaining("SCOPE_EXCEEDED") });
    expect(f.calls).toHaveLength(1);
  });

  it("delegates finalization to the same autonomous continuation command for a resolved phase inventory", async () => {
    const f = await fixture(9);
    expect((await f.run(true))?.workflowStatus).toBe("completed");
    expect(f.calls.map(call => call.agentAction)).toEqual(["continue-implementing"]);
    expect(f.folder()).toContain("04_COMPLETED");
  });

  it("does not infer finalization authority from a supervised continuation with no remaining phase", async () => {
    const f = await fixture(9);
    expect((await f.run(false))?.workflowStatus).toBe("blocked");
    expect(f.calls).toHaveLength(0);
  });
});

describe("structured gates recover within the original user workflow", () => {
  it.each([[false,false], [false,true], [true,false], [true,true]])("repairs evidence with independent review=%s coverage=%s and then finalizes", async (review, coverage) => {
    const f = await fixture(9);
    const document = resolve(f.folder(), "Phases/phase-7-work.md");
    writeFileSync(document, readFileSync(document, "utf8") + "\n## Quality Gate Evidence\n| Gate | Status | Evidence |\n| Tests | Unknown | Imported report needs reconciliation |\n");
    const testPath = resolve(f.project.rootPath, "ordering.test.cjs");
    writeFileSync(testPath, "const {test}=require('node:test');const assert=require('node:assert/strict');test('preserves ordering',()=>assert.deepEqual([1,2].map(x=>x*2),[2,4]));");
    let executions = 0;
    f.behavior(async input => {
      expect(input.prompt).toContain('"workflow_mode":"autonomous"');
      expect(input.phaseNumber).toBe(7);
      const command = `${process.execPath} --test --test-reporter=tap ${testPath}`;
      const observationPath = resolve(f.project.rootPath, ".hepha/phase-evidence", `${input.runId}.jsonl`);
      const payload: PhaseGateRecord = { phaseId: "phase-7-work.md", flags: { needCodeReview: review, needTestCoverage: coverage },
        criteria: [{ id: "sequence", description: "Preserve request sequence." }], checks: [],
        review: review ? { outcome: "approved", reportPath: "review.md" } : { outcome: "not_applicable", reason: "No code review scope." },
        coverage: coverage ? { outcome: "sufficient", criteria: [{ criterionId: "sequence", checkIds: ["ordering"], testPaths: [testPath], assertions: "Exact ordered values remain unchanged after mapping." }] }
          : { outcome: "not_applicable", criteria: [], reason: "No new behavioral scope." } };
      if (coverage) {
        const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", testPath], { encoding: "utf8" }); executions++;
        expect(result.status).toBe(0);
        input.onPiEvent!({ type: "tool_execution_start", toolCallId: "actual-execution", toolName: "bash", args: { command } });
        input.onPiEvent!({ type: "tool_execution_end", toolCallId: "actual-execution", toolName: "bash", isError: result.status !== 0,
          result: { content: [{ type: "text", text: result.stdout + result.stderr }] } });
        payload.checks.push({ id: "ordering", gate: "tests", required: true, command, cwd: f.project.rootPath, outcome: "passed", evidence: [{ path: observationPath, toolCallId: "actual-execution" }] });
      }
      if (review) writeFileSync(resolve(f.folder(), "review.md"), "# Review\n**Status**: APPROVED\nOrdering assertions cover the declared acceptance scope.\n");
      writeFileSync(`${document}.gates.json`, phaseGatesProtocol.encode(payload));
      f.finish();
      return "Reconciled existing obligations and verified acceptance.";
    });
    expect(await f.run(true)).toMatchObject({ workflowStatus: "completed" });
    expect(f.calls.map(c => c.agentName)).toEqual(["DevCycle MCP Compatibility Agent"]);
    expect(executions).toBe(coverage ? 1 : 0);
    expect(f.events).not.toContain("workflow.blocked");
  });
});
