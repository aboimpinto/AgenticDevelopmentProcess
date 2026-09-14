import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { completionLoopFixture } from "./completion-loop-fixture.js";
import { FreshFeatureVerificationApplication } from "../../src/application/features/fresh-feature-verification-application.js";
import { CompletionReadinessVerificationApplication } from "../../src/application/features/completion-readiness-verification-application.js";
import { readFreshState } from "../../src/manual-test-verification/fresh-verification-state.js";
import { sha256 } from "../../src/manual-test-verification/fresh-verification-evidence.js";
import { buildManualTestDeliveryModel, hashManualTestDeliveryModel } from "../../src/manual-test-verification/delivery-model.js";
import { completionRecoveryContext } from "../../src/application/features/completion-recovery-context.js";
import { assessModelRequest } from "../../src/runtime/pi/model-request-policy.js";

export const freshScenarios = [
  { id: "FV-01", mode: "passed", title: "Fresh execution replaces historical evidence across phases" },
  { id: "FV-02", mode: "failed", title: "A current failure cannot be hidden by an older pass" },
  { id: "FV-03", mode: "inspection", title: "Missing setup context triggers inspection before execution" },
  { id: "FV-04", mode: "skipped", title: "Skips and missing reports cannot establish readiness" },
  { id: "FV-05", mode: "changed", title: "Changes during verification invalidate the result" },
  { id: "FV-06", mode: "repeat", title: "Another explicit Refresh executes again" },
  { id: "FV-07", mode: "budget", title: "An explicit budget stop preserves inspection progress for revalidation" },
  { id: "FV-08", mode: "mixed", title: "A mixed plan is corrected before real tests and evidence assessment" },
  { id: "FV-09", mode: "renamed", title: "A renamed documented test invalidates the saved plan" },
  { id: "FV-10", mode: "missing-run-id", title: "HEPHA supplies an omitted invocation ID after real execution" },
  { id: "FV-11", mode: "wrong-run-id", title: "HEPHA rejects an explicitly different invocation ID" },
  { id: "FV-12", mode: "unwritten-run-id", title: "Refresh continues when optional runId enrichment is unavailable" },
  { id: "FV-13", mode: "stale-without-id", title: "Fresh execution remains valid despite yesterday's receipt timestamp" },
  { id: "FV-14", mode: "cwd-prefix", title: "Equivalent cwd-prefixed execution reaches readiness with its receipt unchanged" },
  { id: "FV-15", mode: "missing-timestamp", title: "Fresh execution reaches readiness without timestamp or runId" },
  { id: "FV-16", mode: "invalid-timestamp", title: "A malformed receipt timestamp does not block fresh execution" },
  { id: "FV-17", mode: "future-timestamp", title: "A future receipt timestamp does not block fresh execution" },
  { id: "FV-18", mode: "manifest-resolution", title: "A configured nested manifest is resolved before execution and reused on the next Refresh" },
  { id: "FV-19", mode: "hash-first-revision", title: "Hash-first working-tree evidence reaches readiness without losing source qualifications" },
  { id: "FV-20", mode: "console-capture", title: "Additional console capture preserves the planned tests and valid native evidence" },
  { id: "FV-21", mode: "inherited-setup-claim", title: "Execution receives configured checks without inherited prerequisite prose" },
] as const;
export const timestampMetadataModes = ["stale-without-id", "missing-timestamp", "invalid-timestamp", "future-timestamp"];
export const qualifiedRevisions = ["abcdef012345 @ working tree (uncommitted fixture configuration)", "abcdef012345 + documented uncommitted runtime migration working-tree edits (required to build; paired test files unchanged)"];
export type FreshMode = typeof freshScenarios[number]["mode"] | "no-report" | "blocked" | "invalid-plan";

/** Actual HTTP/application/SQLite/receipt flow. Only agent planning is controlled;
 * the execution adapter runs a tiny synthetic assertion process to produce native-format outcomes. */
export async function freshVerificationFixture(mode: FreshMode, options: {
  planResponse?: (json: string) => string;
  presentCommand?: (command: string) => string;
  afterExecution?: (directory: string) => void;
  repairEvidence?: (directory: string, prompt: string) => Promise<void> | void;
} = {}) {
  const f = await completionLoopFixture("review-only", 31), root = f.project.rootPath, folder = f.feature.folderPath;
  const description = join(folder, "FeatureDescription.md");
  writeFileSync(description, readFileSync(description, "utf8") + "\n## Test inventory\nTest file: runner.cjs\nConfigured checks: package.json verify:save and verify:browser.\n");
  execFileSync("git", ["init", "-q", root]);
  writeFileSync(join(root, ".gitignore"), "test.sqlite*\n.hepha/\n");
  writeFileSync(join(root, "source.json"), JSON.stringify({ value: mode === "failed" ? 2 : 1 }));
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { "verify:save": "node runner.cjs save", "verify:browser": "node runner.cjs browser", unrelated: "node runner.cjs unrelated" } }));
  writeFileSync(join(root, "runner.cjs"), `const assert = require('node:assert/strict'); const fs = require('node:fs');
const name = process.argv[2]; let status = process.env.SYNTHETIC_SKIP === '1' ? 'pending' : 'passed';
if (status === 'passed') { try { assert.equal(JSON.parse(fs.readFileSync('source.json','utf8')).value, 1); } catch { status = 'failed'; } }
const report = { success: status === 'passed', numTotalTests: 1, numPassedTests: status === 'passed' ? 1 : 0, numFailedTests: status === 'failed' ? 1 : 0, numPendingTests: status === 'pending' ? 1 : 0, testResults: [{ name, status, assertionResults: [{ fullName: name + ' preserves feature behavior', status }] }] };
if (process.env.SYNTHETIC_REPORT_PATH) { fs.writeFileSync(process.env.SYNTHETIC_REPORT_PATH, JSON.stringify(report)); console.log('Test runner finished: ' + status); }
else process.stdout.write(JSON.stringify(report)); if (status === 'failed') process.exitCode = 1;
`);
  writeFileSync(join(root, "setup.md"), "Use the configured node runner. It owns an isolated in-memory fixture; no external service required.\n");
  if (mode === "manifest-resolution") {
    mkdirSync(join(root, "native")); writeFileSync(join(root, "native/Cargo.toml"), "[workspace]\n");
    // Process-backed Cargo stand-in: a missing manifest option really fails the
    // subprocess without requiring a Rust toolchain in browser/HTTP test jobs.
    writeFileSync(join(root, "manifest-check.cjs"), `const fs = require('node:fs'); const assert = require('node:assert/strict');
const args = process.argv.slice(2); const index = args.indexOf('--manifest-path');
assert.ok(index >= 0, 'Cargo.toml is not discoverable from cwd');
assert.equal(args[index + 1], 'native/Cargo.toml');
assert.ok(fs.readFileSync(args[index + 1], 'utf8').includes('[workspace]'));
console.log(JSON.stringify({workspace: args[index + 1]}));`);
  }
  const second = join(folder, "phase-48.md"); writeFileSync(second, "# Phase 48: Integration\n**Status:** COMPLETED\n");
  f.feature.phases.push({ ...f.feature.phases[0]!, number: 48, title: "Integration", documentPath: second, documentRelativePath: "feature/phase-48.md" });
  const { context, sourceOptions } = completionRecoveryContext(f.project, f.feature, [f.feature], f.ports.store);
  const pack = await f.ports.store.getCurrentManualTestPack(f.project.id, `feature:${f.feature.externalId}`);
  await f.ports.store.recordManualTestPack({ ...pack!, manifestHash: hashManualTestDeliveryModel(await buildManualTestDeliveryModel(context, sourceOptions)) });
  let stages = 0, executions = 0, inspectionReads = 0, busy = false;
  const commands: string[] = [], prompts: string[] = [];
  const preparationCommands: string[] = [];
  const activities: string[] = [], workerLimits: (number | null | undefined)[] = [];
  let testGate: Promise<void> | undefined, releaseTests = () => {};
  let correctionGate: Promise<void> | undefined, releaseCorrection = () => {};
  let release!: () => void;
  let gate: Promise<void> | undefined;
  const service = new FreshFeatureVerificationApplication({ ...f.ports,
    notify: (...args) => { const stage = readFreshState(folder)?.stage; if (stage && activities.at(-1) !== stage) activities.push(stage); f.ports.notify(...args); },
    targets: { resolveCompatibility: async () => ({ project: f.project, feature: (await f.ports.scan())[0]!, workItems: await f.ports.scan() }) },
    plan: () => ({}) as never,
    worker: async input => {
      stages++; prompts.push(input.prompt); workerLimits.push(input.maxRuntimeMs); busy = true;
      try {
        if (gate) await gate;
        if (input.prompt.startsWith("HEPHA fresh feature verification: inspect") || input.prompt.startsWith("HEPHA fresh feature verification: correct")) {
          if (input.prompt.startsWith("HEPHA fresh feature verification: correct") && correctionGate) await correctionGate;
          readFileSync(join(root, "setup.md"), "utf8"); inspectionReads++;
          const testFile = readFileSync(description, "utf8").match(/Test file: ([\w.-]+)/)![1]!;
          const checks: any[] = ["save", "browser"].map(id => ({ id, kind: "test", suiteKey: id, cwd: root, command: `node ${testFile} ${id}`, configurationFiles: ["package.json"], testPaths: [testFile], gates: [id === "save" ? "tests" : "gherkin_e2e"], reason: "FeatureDescription.md inventory maps configured checks; setup.md verified" }));
          if (mode === "inherited-setup-claim") checks[1].reason = "Historical prose demands the unrelated settlement-daemon at port 12345";
          if (mode === "mixed" || mode === "invalid-plan") checks.push({ id: "runtime", kind: inspectionReads === 1 || mode === "invalid-plan" ? "test" : "static", cwd: root, command: "node --version", configurationFiles: ["package.json"], testPaths: [], reason: "Configured runtime preflight, not coverage" });
          if (mode === "manifest-resolution") checks.unshift({ id: "manifest", kind: "preparation", cwd: root, command: "cargo metadata --no-deps --format-version 1", configurationFiles: ["native/Cargo.toml"], testPaths: [], reason: "Resolve the configured native workspace" });
          if (mode === "budget" && inspectionReads === 1) {
            const state = readFreshState(folder)!;
            writeFileSync(join(state.directory, "inspection-checkpoint.json"), JSON.stringify({ schema: "feature-inspection-checkpoint/v1", runId: state.runId, featureId: f.feature.externalId,
              checks: [checks[0]], phases: [{ phaseNumber: 31, checkIds: ["save"] }], remainingPhaseNumbers: [48] }));
            try { assessModelRequest("next request", { contextWindow: 1000000, maxTokens: 32000, reasoning: true }, "high", 512000, 512000); }
            catch (error) { throw new Error('HEPHA_MODEL_REQUEST {"inputTokens":42}\n' + (error as Error).message); }
          }
          const json = JSON.stringify({ checks, phases: [{ phaseNumber: 31, checkIds: checks.map(c => c.id) }, { phaseNumber: 48, checkIds: ["browser"] }] });
          return options.planResponse ? options.planResponse(json) : json;
        }
        const state = readFreshState(folder)!;
        if (input.step === "Repair verification evidence") {
          await options.repairEvidence?.(state.directory, input.prompt);
          return "Evidence repair response; independently validate the saved artifacts.";
        }
        if (mode === "inherited-setup-claim") {
          const context = readFileSync(join(state.directory, "receipt-context.json"), "utf8");
          if (input.prompt.includes("settlement-daemon") || context.includes("settlement-daemon")) throw new Error("Inherited prerequisite prose leaked into execution authority");
          // The execution adapter reads the actual fixture description, independent of planning prose.
          if (!readFileSync(join(root, "setup.md"), "utf8").includes("no external service required")) throw new Error("Actual fixture configuration unavailable");
        }
        if (mode === "blocked") throw new Error("Controlled fixture unavailable after inspecting setup.md; supply the documented fixture authority.");
        if (mode === "no-report") return "All tests passed (unsupported worker assertion)";
        const checks = [];
        for (const check of state.plan!.checks) {
          if (check.kind !== "test") {
            input.onPiEvent?.({ type: "tool_execution_start", toolName: "bash", toolCallId: check.id, args: { command: check.command } });
            preparationCommands.push(check.command);
            const log = execFileSync(process.execPath, check.id === "manifest" ? ["manifest-check.cjs", ...check.command.split(" ").slice(1)] : ["--version"], { encoding: "utf8", cwd: root });
            const reportPath = join(state.directory, "runtime.log"); writeFileSync(reportPath, log);
            checks.push({ id: check.id, cwd: root, command: check.command, success: true, exitCode: 0, tests: 0, passed: 0, failed: 0, reportPath, reportSha256: sha256(log) });
            input.onPiEvent?.({ type: "tool_execution_end", toolName: "bash", toolCallId: check.id });
            continue;
          }
          const consolePath = join(state.directory, `${check.id}.console.log`), reportPath = join(state.directory, `${check.id}.json`);
          const executionCommand = options.presentCommand?.(check.command) ?? check.command;
          const invocation = mode === "console-capture" ? `cd '${root}' && ${executionCommand} > '${consolePath}' 2>&1`
            : mode === "mixed" ? `date -u; cd "${root}" && ${check.command}; echo "EXIT=$?"; date -u`
            : mode === "cwd-prefix" ? `cd '${root}' && ${check.command}` : check.command;
          input.onPiEvent?.({ type: "tool_execution_start", toolName: "bash", toolCallId: check.id, args: { command: invocation } });
          commands.push(check.command); executions++;
          let report: string, exitCode = 0;
          try { report = execFileSync(mode === "cwd-prefix" || mode === "console-capture" ? "bash" : process.execPath,
            mode === "cwd-prefix" || mode === "console-capture" ? ["-c", invocation] : [check.testPaths[0]!, check.id],
            { cwd: root, encoding: "utf8", env: { ...process.env, SYNTHETIC_SKIP: mode === "skipped" ? "1" : "0", SYNTHETIC_REPORT_PATH: mode === "console-capture" ? reportPath : undefined } }); }
          catch (error) { report = String((error as any).stdout); exitCode = 1; }
          if (mode === "console-capture") report = readFileSync(reportPath, "utf8");
          const parsed = JSON.parse(report); writeFileSync(reportPath, report);
          checks.push({ id: check.id, kind: check.id, cwd: root, command: mode === "cwd-prefix" || mode === "console-capture" ? invocation : check.command, testedRevision: mode === "hash-first-revision" ? qualifiedRevisions[check.id === "save" ? 0 : 1] : "abcdef012345", success: parsed.success, exitCode, tests: parsed.numTotalTests, passed: parsed.numPassedTests, failed: parsed.numFailedTests, reportPath, reportSha256: sha256(report),
            ...(mode === "console-capture" ? { logPath: consolePath, logSha256: sha256(readFileSync(consolePath, "utf8")) } : {}) });
          if (testGate) await testGate;
          input.onPiEvent?.({ type: "tool_execution_end", toolName: "bash", toolCallId: check.id });
        }
        writeFileSync(join(state.directory, "receipt.json"), JSON.stringify({ schema: "phase-verification-receipt/v1", feature: f.feature.externalId,
          ...(["missing-run-id", "unwritten-run-id", ...timestampMetadataModes].includes(mode) ? {} : { runId: mode === "wrong-run-id" ? "other-invocation" : state.runId }),
          verifiedAt: mode === "missing-timestamp" ? undefined : mode === "invalid-timestamp" ? "clock unavailable"
            : new Date(Date.now() + (mode === "future-timestamp" ? 86_400_000 : mode === "stale-without-id" ? -86_400_000 : 0)).toISOString(), checks }));
        // Existing immutable audit data prevents optional enrichment from writing.
        // The actual application and importer must still accept the ID-less receipt.
        if (mode === "unwritten-run-id" || timestampMetadataModes.includes(mode)) writeFileSync(join(state.directory, "receipt.worker.json"), readFileSync(join(state.directory, "receipt.json")));
        if (mode === "changed") writeFileSync(join(root, "source.json"), '{"value":3}');
        options.afterExecution?.(state.directory);
        return "Run-local reports saved";
      } finally { busy = false; }
    },
  });
  f.useRefreshApplication(new CompletionReadinessVerificationApplication(f.ports.readiness, service));
  return { ...f, freshMetrics: async () => {
    const metrics = await f.metrics();
    return { ...metrics, stages, executions, inspectionReads, commands, preparationCommands, prompts, activities, workerLimits, fresh: readFreshState(folder),
      busy: busy || metrics.busy || metrics.metadata?.workflowStatus === "running" };
  },
    receiptArtifacts: () => {
      const directory = readFreshState(folder)!.directory;
      return { canonical: JSON.parse(readFileSync(join(directory, "receipt.json"), "utf8")),
        worker: JSON.parse(readFileSync(join(directory, "receipt.worker.json"), "utf8")),
        context: JSON.parse(readFileSync(join(directory, "receipt-context.json"), "utf8")) };
    },
    currentReceipt: () => JSON.parse(readFileSync(join(readFreshState(folder)!.directory, "receipt.json"), "utf8")),
    renameDocumentedTest: () => {
      renameSync(join(root, "runner.cjs"), join(root, "renamed-runner.cjs"));
      writeFileSync(description, readFileSync(description, "utf8").replace("Test file: runner.cjs", "Test file: renamed-runner.cjs"));
      writeFileSync(join(root, "package.json"), readFileSync(join(root, "package.json"), "utf8").replaceAll("runner.cjs", "renamed-runner.cjs"));
    },
    holdTests: () => { testGate = new Promise<void>(resolve => { releaseTests = resolve; }); return () => { testGate = undefined; releaseTests(); }; },
    holdCorrection: () => { correctionGate = new Promise<void>(resolve => { releaseCorrection = resolve; }); return () => { correctionGate = undefined; releaseCorrection(); }; },
    hold: () => { gate = new Promise<void>(resolve => { release = resolve; }); return () => { gate = undefined; release(); }; },
  };
}
