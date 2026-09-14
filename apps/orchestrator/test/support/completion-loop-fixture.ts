import { acceptedAssessmentReply } from "./accepted-assessment-reply.js";
import { createServer, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { createCardMetadataStore } from "@hepha/db";
import type { WorkItemCard, ProjectSummary } from "@hepha/shared";
import { CompletionReadinessRefreshApplication } from "../../src/application/features/completion-readiness-refresh-application.js";
import { CompletionReadinessVerificationApplication } from "../../src/application/features/completion-readiness-verification-application.js";
import { PhaseQualityResolutionApplication } from "../../src/application/features/phase-quality-resolution-application.js";
import { FreshFeatureVerificationApplication } from "../../src/application/features/fresh-feature-verification-application.js";
import { projectCompletionRecovery } from "../../src/application/features/completion-recovery-projection.js";
import { completionRecoveryContext } from "../../src/application/features/completion-recovery-context.js";
import { FeatureCompletionReadinessPolicy } from "../../src/application/features/feature-completion-readiness-policy.js";
import { buildManualTestDeliveryModel, hashManualTestDeliveryModel } from "../../src/manual-test-verification/delivery-model.js";
import { readCoverageRecovery } from "../../src/manual-test-verification/acceptance-coverage-reconciliation.js";
import { handleCompletionReadinessRoute } from "../../src/transport/http/routes/completion-readiness-route.js";
import { handlePhaseQualityResolutionRoute } from "../../src/transport/http/routes/phase-quality-resolution-route.js";
import { playwrightReport, trxReport } from "../native-execution-fixtures.js";
import { expandIdentities } from "../../src/manual-test-verification/coverage-context-compaction.js";

export const completionScenarios = [
  { id: "CR-01", title: "Recognize existing coverage, recover missing execution, and automatically become ready", mode: "repair" },
  { id: "CR-02", title: "Retry an assessment error without inventing test repair", mode: "assessment-error" },
  { id: "CR-03", title: "Invalidate changed reports without clearing human passes, then restore readiness", mode: "changed-report" },
  { id: "CR-04", title: "Recognize satisfied coverage without confirmation and reuse unchanged evidence", mode: "review-only" },
  { id: "CR-05", title: "Route discovered browser tests to prerequisite-gated execution without implementing duplicates", mode: "discovery-only" },
  { id: "CR-06", title: "Correct malformed assessment output once using existing evidence without repair", mode: "schema-correction" },
  { id: "CR-07", title: "Stop after exhausted schema correction and recover through explicit refresh", mode: "schema-exhaustion" },
  { id: "CR-08", title: "Assess large interleaved execution evidence without duplicate repair or truncation", mode: "large-context" },
  { id: "CR-09", title: "Upgrade split cached blockers into one configured execution and preserve verified coverage", mode: "configured-execution" },
  { id: "CR-11", title: "Discover existing mixed evidence and become ready without duplicate execution", mode: "mixed-evidence" },
  { id: "CR-10", title: "Preserve complementary proof and route an execution diagnosis into an explicit scoped repair", mode: "diagnosis-repair" },
  { id: "CR-12", title: "Explicitly reassess cached unresolved coverage without rerunning tests or losing approvals", mode: "reassessment" },
  { id: "CR-14", title: "A returned repair without execution evidence retries three times and reports the unresolved cause", mode: "repair-no-execution" },
  { id: "CR-15", title: "Large routing context reaches existing verification without discarding evidence", mode: "large-routing" },
] as const;
export type CompletionScenarioMode = typeof completionScenarios[number]["mode"] | "refresh-execution";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const now = "2026-01-01T12:00:00Z";

/** Same real HTTP routes/applications/files/SQLite in browser and server twins.
 * Only model/worker execution and unrelated portfolio data are controlled test adapters.
 * No user process, database, feature, account or provider is accessed. */
export async function completionLoopFixture(mode: CompletionScenarioMode, variant = 23) {
  const configuredMode = ["configured-execution", "refresh-execution", "repair-no-execution", "large-routing"].includes(mode);
  const root = mkdtempSync(join(tmpdir(), "hepha-completion-loop-"));
  const store = createCardMetadataStore({ HEPHA_DATABASE_PATH: join(root, "test.sqlite") });
  const folder = join(root, "feature"); mkdirSync(folder);
  const phasePath = join(folder, "verification.md"), documentPath = join(folder, "FeatureDescription.md");
  writeFileSync(documentPath, "# Synthetic delivery\n\n## Acceptance Criteria\n- AC-01: Saving displays confirmation.\n- AC-02: Automated browser journey saves and reopens the form.\n- AC-03: The operator opens the delivered form.\n");
  if (mode === "mixed-evidence") writeFileSync(documentPath, readFileSync(documentPath, "utf8").replace("Automated browser journey saves and reopens the form.", "Automated browser journey saves and reopens the form, complemented by operator inspection of visible controls."));
  if (configuredMode) {
    writeFileSync(documentPath, readFileSync(documentPath, "utf8") + "- AC-04: The same automated browser journey verifies keyboard interaction.\n");
    mkdirSync(join(root, "features", "checkout"), { recursive: true });
    writeFileSync(join(root, "features", "checkout", "form.feature"), "Feature: Checkout\n");
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { "verify:browser": "playwright test --config browser.qa.ts" } }));
    writeFileSync(join(root, "browser.qa.ts"), "import { defineConfig } from '@playwright/test'; import { defineBddConfig } from 'playwright-bdd'; const testDir = defineBddConfig({ features: 'features/checkout' }); export default defineConfig({ testDir });");
  }
  if (["discovery-only", "diagnosis-repair", "repair", "changed-report"].includes(mode)) {
    writeFileSync(join(root, "playwright.config.ts"), 'export default { testDir: "." };');
    writeFileSync(join(root, "existing-form.spec.ts"), "test('save and reopen', () => {});");
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { "verify:browser": "playwright test" } }));
  }
  writeFileSync(phasePath, `# Phase ${variant}: Verification\n**Status:** COMPLETED\n\n## Phase Task Ledger\n- [x] Implement form\n`);
  if (mode === "large-context") for (let part = 0; part < 4; part++) writeFileSync(join(folder, `SourceContext-${part}.md`),
    `# Source qualification ${part}\n` + Array.from({ length: 1200 }, (_, i) => `Related workflow discussion ${hash(`synthetic source qualification ${part}-${i}`)}: Separate executed layers may jointly prove the contract. Browser discovery is not execution.`).join("\n"));
  const manual = { id: "MT-OPEN", title: "Open form", purpose: "Inspect the delivered form", sourceIds: ["AC-03"], role: "Operator", application: "Example console", setupData: "An empty form", preconditions: ["Console is available"], steps: ["Open the form", "Inspect the visible controls"], expectedResult: "The form is visible" };
  writeFileSync(join(folder, "ManualTestCases.json"), JSON.stringify({ tests: [manual] }));
  const project: ProjectSummary = { id: "synthetic", name: "Synthetic workflow", rootPath: root, memoryBankPath: root, createdAt: now, updatedAt: now,
    memoryBankRelativePath: ".", defaultBranch: "master", detectedStack: ["typescript"], featuresRootExists: true, needsInitialization: false,
    counts: { "00_EPICS": 0, "01_SUBMITTED": 0, "02_READY_TO_DEVELOP": 0, "03_IN_PROGRESS": 1, "04_COMPLETED": 0, "05_CANCELLED": 0 } };
  const feature = { id: "example", externalId: `FEAT-EXAMPLE-${variant}`, kind: "feature", title: "Synthetic delivery", summary: "Generic completion workflow", folderName: "feature", folderPath: folder, documentPath, documentRelativePath: "feature/FeatureDescription.md", documentUpdatedAt: now, documentExists: true,
    stateFolder: "03_IN_PROGRESS", stateLabel: "In Progress", specMarkdown: readFileSync(documentPath, "utf8"), epicRefinements: [], epicState: null, linkedEpicIds: [], linkedEpics: [], linkedFeatureIds: [], linkedFeatures: [], missingFeatureIds: [],
    phases: [{ number: variant, title: "Verification", status: "COMPLETED", documentPath: phasePath, documentRelativePath: "feature/verification.md", updatedAt: now }],
    implementationEvidence: { changedFiles: [], codeReviews: [], phaseQualityGates: [] }, validation: { needsValidationCount: 0, deepDiveStatus: "current", changedSinceHephaDeepDive: false },
    featureWorkflow: { activeRun: null, lastRun: null, workflowPosition: null, implementationCompleted: true, implementationPhases: [], implementationTasks: [], findings: [], readiness: { ready: true, reasons: [] },
      userCodeReviewCompletedAt: now, manualTestsCompletedAt: now, canAcceptHumanReviewFindings: false, canStartImplementing: false, canContinueImplementing: false,
      canGenerateManualTestPack: true, canReviewManualTestPack: true, canRecordManualTestPass: true, canRecordManualTestFail: true, uiRequirementDecision: "no_ui", hasRefinementArtifacts: true, hasDesignArtifacts: true,
      canSubmitFinding: true, canRecordUserCodeReview: false, workflowMessage: "Implementation is finished; verification remains explicit." },
  } as unknown as WorkItemCard;
  const cardKey = `feature:${feature.externalId}`;
  await store.reconcileScannedCards([{ cardKey, projectId: project.id, externalId: feature.externalId, kind: "feature", stateFolder: feature.stateFolder, title: feature.title,
    documentPath, documentHash: hash(readFileSync(documentPath, "utf8")), documentSize: statSync(documentPath).size, documentUpdatedAt: now }]);
  await store.recordFeatureHumanReview({ cardKey, projectId: project.id, check: "user-code-review" });
  await store.recordFeatureHumanReview({ cardKey, projectId: project.id, check: "manual-tests" });
  const { context, sourceOptions } = completionRecoveryContext(project, feature, [feature], store);
  const model = await buildManualTestDeliveryModel(context, sourceOptions);
  const packDir = join(folder, "manual-test-verification", "pack"); mkdirSync(packDir, { recursive: true });
  const markdownPath = join(packDir, "ManualTestVerification.md"); writeFileSync(markdownPath, "# Manual verification\n### MT-OPEN: Open form\n");
  writeFileSync(join(packDir, "manifest.json"), JSON.stringify({ applicability: "incomplete", classifications: model.coverageMap, manualTests: model.tests, invalidManualTests: [] }));
  await store.recordManualTestPack({ id: "pack", projectId: project.id, cardKey, version: "v1", state: "current", manifestHash: hashManualTestDeliveryModel(model), markdownPath, pdfPath: null, renderError: null, createdAt: now, supersededAt: null });
  await store.recordManualTestReview({ id: "review", projectId: project.id, cardKey, packId: "pack", state: "current", reviewedAt: now, invalidatedAt: null, invalidatedReason: null });
  await store.recordManualTestResult({ id: "result", projectId: project.id, cardKey, packId: "pack", reviewId: "review", testId: "MT-OPEN", result: "pass", recordedAt: now, actualResult: "Form visible", notes: null, findingId: null });
  const verification = join(folder, "verification"); mkdirSync(verification);
  function publish(kind: "save" | "browser") {
    const browser = playwrightReport();
    if (mode === "large-context" && kind === "browser") {
      const template = browser.suites[0]!.specs[0]!;
      browser.suites[0]!.specs = Array.from({ length: 1600 }, (_, i) => ({ ...template,
        title: `${hash(String(i % 40)).slice(0, 8)}: ${"shared setup and verification of the delivered form ".repeat(6)} case ${Math.floor(i / 40)}` }));
      browser.stats.expected = 1600;
    }
    const count = kind === "browser" ? browser.stats.expected : 1;
    const content = kind === "save" ? trxReport() : JSON.stringify(browser);
    const reportPath = join(root, kind === "save" ? "save.trx" : "browser.json"); writeFileSync(reportPath, content);
    const logPath = join(root, `${kind}.log`); writeFileSync(logPath, "Source build succeeded; reporter is authoritative.");
    writeFileSync(join(verification, `${kind}.json`), JSON.stringify({ schema: "phase-verification-receipt/v1", feature: feature.externalId, verifiedAt: now,
      checks: [{ kind, command: kind === "save" ? "dotnet test --logger trx" : "playwright test --reporter=json", cwd: root, testedRevision: "working tree @ abcdef012345 + recorded test changes", success: true, exitCode: 0, tests: count, passed: count, failed: 0, reportPath, reportSha256: hash(content), logPath, logSha256: hash(readFileSync(logPath, "utf8")) }] }));
  }
  publish("save"); if (!configuredMode && !["repair", "discovery-only", "diagnosis-repair"].includes(mode)) publish("browser");
  if (mode === "discovery-only") writeFileSync(join(verification, "discovery.json"), JSON.stringify({ schema: "phase-verification-receipt/v1", feature: feature.externalId, verifiedAt: now,
    checks: [{ kind: "browser-discovery", command: "playwright test --list", cwd: root, testedRevision: "abcdef012345", success: true, exitCode: 0, tests: 8, passed: 8, failed: 0 }] }));
  let modelCalls = 0, workerCalls = 0, errorOnce = mode === "assessment-error", busy = false;
  let executionEnvironmentAvailable = !["discovery-only", "configured-execution"].includes(mode);
  const workerPrompts: string[] = [], unexpected: string[] = [], events = new Set<ServerResponse>();
  let inspectedIdentities = 0;
  let sourcePages = 0;
  const assessedIdentityCounts: number[] = [];
  const assessedSourceClauses: string[][] = [];
  let assessmentGate: Promise<void> | null = null;
  let releaseAssessment = () => {};
  const assessmentPromptLengths: number[] = [];
  const routingPromptLengths: number[] = [];
  const notify = () => { for (const event of events) event.write("event: memorybank.changed\ndata: {}\n\n"); };
  const scan = async () => {
    const metadata = await store.getCardMetadata(project.id, cardKey);
    feature.featureWorkflow!.userCodeReviewCompletedAt = metadata?.userCodeReviewCompletedAt ?? null;
    feature.phases[0]!.updatedAt = statSync(phasePath).mtime.toISOString();
    feature.featureWorkflow!.activeRun = metadata?.workflowStatus === "running" ? { runId: metadata.workflowRunId, command: "continue-implementing", status: "running", currentStep: metadata.workflowCurrentStep ?? "Repairing missing execution", startedAt: now } as never : null;
    feature.featureWorkflow!.lastRun = metadata?.workflowRunId ? { runId: metadata.workflowRunId, command: "continue-implementing",
      status: metadata.workflowStatus, currentStep: metadata.workflowCurrentStep, summary: metadata.workflowSummary,
      error: metadata.workflowError, startedAt: now } as never : null;
    let current = await projectCompletionRecovery(project, feature, [feature], store);
    if (refresh.isRunning(project.id, feature.id)) current = { ...current, completionRecovery: { assessedAt: now, ready: false, verificationStage: "assessing", contextCompaction: refresh.compactionActivity(project.id, feature.id), blockers: [{ id: "recovery-running", action: "external", message: "Readiness recovery running", actionLabel: "Wait" }], phaseGaps: [] } };
    return [current];
  };
  const legacyPrompt = async (prompt: string) => {
      if (assessmentGate) await assessmentGate;
      modelCalls++; await new Promise(resolve => setTimeout(resolve, 80));
      if (prompt.startsWith("Resolve verification recovery actions.")) {
        routingPromptLengths.push(prompt.length);
        const authorityLine = prompt.split("\n").find(line => line.startsWith("Authoritative current verification context: "));
        const authority = authorityLine && JSON.parse(authorityLine.slice("Authoritative current verification context: ".length));
        if (authority?.manualResults?.length) throw new Error("Manual outcomes must not enter automated action routing");
        const targets = JSON.parse(prompt.split("\n").find(line => line.startsWith("Configured targets: "))!.slice("Configured targets: ".length));
        const requirements = JSON.parse(prompt.split("\n").find(line => line.startsWith("Unresolved requirements: "))!.slice("Unresolved requirements: ".length));
        return JSON.stringify({ requirements: requirements.map((entry: { sourceId: string }) => ({ sourceId: entry.sourceId, kind: "execution", targetId: targets[0].id,
          ...(["diagnosis-repair", "repair", "changed-report"].includes(mode) ? {} : { prerequisite: "Make the controlled test server and fixture account available using the project setup instructions." }) })) });
      }
      const extraction = prompt.split("\n").find(line => line.startsWith("Extraction page "));
      if (extraction) {
        const page = JSON.parse(extraction.slice(extraction.indexOf(": ") + 2));
        inspectedIdentities += page.identities.length;
        return JSON.stringify({ inspectedCount: page.identities.length, matches: ["AC-01", "AC-02"].map(sourceId => ({ sourceId, evidenceId: page.evidenceId, identityIndexes: page.identities.map((x: { index: number }) => x.index) })) });
      }
      const sourceLine = prompt.split("\n").find(line => line.startsWith("Source page: "));
      if (sourceLine) {
        sourcePages++;
        const page = JSON.parse(sourceLine.slice(13));
        const criteria = JSON.parse(prompt.split("\n").find(line => line.startsWith("Criteria: "))!.slice(10));
        // Reproduce an uncooperative oversized extraction, not just happy-path JSON.
        if (mode === "large-context" && page.passages.length > 4) return JSON.stringify({ complete: true,
          inspectedCount: page.passages.length, accountedSourceIds: criteria.map((c: { sourceId: string }) => c.sourceId),
          facts: Array.from({ length: 101 }, () => ({ sourceIds: [criteria[0].sourceId], passageId: page.passages[0].id, quote: page.passages[0].text.slice(0, 100) })) });
        return JSON.stringify({ complete: true, inspectedCount: page.passages.length, accountedSourceIds: criteria.map((criterion: { sourceId: string }) => criterion.sourceId),
          facts: ["- [x] Implement form", "Separate executed layers may jointly prove the contract.", "Browser discovery is not execution."].flatMap(quote => {
            const passage = page.passages.find((p: { text: string }) => p.text.includes(quote));
            return passage ? [{ sourceIds: criteria.map((criterion: { sourceId: string }) => criterion.sourceId), passageId: passage.id, quote, occurrence: 0 }] : [];
          }) });
      }
      assessmentPromptLengths.push(prompt.length);
      if (errorOnce) { errorOnce = false; throw new Error("Synthetic assessment temporarily unavailable"); }
      if ((mode === "schema-correction" && modelCalls === 1) || (mode === "schema-exhaustion" && modelCalls <= 3))
        return JSON.stringify({ links: [], unresolved: [{ sourceId: "AC-02", reason: "Existing execution needs assessment", execution: { command: "test", testPaths: null } }] });
      const evidence = JSON.parse(prompt.split("\n").find(line => line.startsWith("Evidence: "))!.slice(10));
      if (mode === "reassessment" && assessmentPromptLengths.length > 1 && evidence.coverageMap.some((entry: any) => entry.sourceId === "AC-01")) throw new Error("Reassessment must not reopen approved coverage");
      if (mode === "large-context") {
        const source = JSON.parse(prompt.split("\n").find(line => line.startsWith("Source documents"))!.split(": ").slice(1).join(": "));
        assessedSourceClauses.push(source.facts?.map((f: any) => f.quote ?? source.sourceQuoteCatalog[f.quoteRef]) ?? []);
        const catalog = evidence.executionIdentityCatalog ? expandIdentities(evidence.executionIdentityCatalog) : [];
        assessedIdentityCounts.push(evidence.automatedEvidence.reduce((sum: number, report: any) => sum + (report.executionIdentities?.length
          ?? (report.executionIdentityReferences ? report.executionIdentityReferences.map((i: number) => catalog[i]).length
            : report.executionIdentityFragments ? expandIdentities(report.executionIdentityFragments).length : 0)), 0));
      }
      const links: object[] = [], unresolved: object[] = [];
      for (const criterion of evidence.coverageMap) {
        if (mode === "reassessment" && criterion.sourceId === "AC-02" && assessmentPromptLengths.length <= 2) {
          unresolved.push({ sourceId: "AC-02", reason: "Inspect the existing browser evidence mapping; do not recreate the test.", diagnosis: { kind: "investigation_required", explanation: "The existing mapping is unavailable", references: ["unavailable-assertion-map.md"], nextAction: "Restore the existing assertion mapping" } });
        }
        if (mode === "diagnosis-repair" && criterion.sourceId === "AC-02") {
          const partial = evidence.automatedEvidence.find((e: { title: string }) => e.title === "save");
          links.push({ sourceId: criterion.sourceId, kind: "automated", evidenceId: partial.id, explanation: "Existing save verification proves one aspect; the browser boundary needs complementary proof." });
        }
        if (mode === "diagnosis-repair" && criterion.sourceId === "AC-02" && workerCalls === 1) {
          unresolved.push({ sourceId: criterion.sourceId, reason: "The inspected persistence helper lacks reopen verification.", diagnosis: { kind: "implementation_missing", explanation: "Required persistence control is absent in the inspected helper.", references: ["verification.md:1"], nextAction: "Repair the persistence helper; preserve authentication delegation." } });
          continue;
        }
        const report = evidence.automatedEvidence.find((e: { title: string }) => e.title === (["AC-01", "AC-03"].includes(criterion.sourceId) ? "save" : "browser"));
        if (mode === "large-routing" && criterion.sourceId === "AC-02" && !report) {
          const partial = evidence.automatedEvidence.find((e: { title: string }) => e.title === "save");
          for (let i = 0; i < 150; i++) links.push({ sourceId: criterion.sourceId, kind: "automated", evidenceId: partial.id,
            explanation: `Distinct factual qualification ${i}: ` + "Preserve the complementary proof and its limited scope. ".repeat(35) });
        }
        if (report) links.push({ sourceId: criterion.sourceId, kind: "automated", evidenceId: report.id, explanation: "The checksum-bound named execution verifies this scenario." });
        else unresolved.push({ sourceId: criterion.sourceId, reason: "The existing browser scenario has no valid executed report. Restore the report or execute only this scenario using the configured fixture; do not add duplicate tests.",
          ...(mode === "diagnosis-repair" ? { execution: { command: "project verify", testPaths: ["tests/existing-journey"] } } : mode === "discovery-only" ? { execution: { command: "playwright test existing-form.spec.ts --reporter=json", testPaths: ["existing-form.spec.ts"], prerequisite: "Make the controlled test server and fixture account available using the project setup instructions." } }
            : configuredMode && criterion.sourceId === "AC-04" ? { execution: { command: "npm run verify:browser", testPaths: ["features/wrong"] } } : {}) });
      }
      return JSON.stringify({ links, unresolved, improvements: mode === "mixed-evidence" ? [{ observation: "Consider a browser-only alternate workflow", rationale: "Optional future depth; the accepted combination already verifies this feature.", references: ["FeatureDescription.md"] }] : [] });
    };
  const runPrompt = async (prompt: string) => acceptedAssessmentReply(prompt, await legacyPrompt(prompt));
  const refresh = new CompletionReadinessRefreshApplication({ findProject: () => project, scanProject: scan, store, notifyActivity: notify, runPrompt,
    ...(mode === "large-context" ? { createPromptSession: () => ({ runPrompt, model: { contextWindow: 40_000, maxTokens: 8000, reasoning: true } }) }
      : mode === "large-routing" ? { createPromptSession: () => ({ runPrompt, model: { contextWindow: 1_000_000, maxTokens: 16000, reasoning: true }, counter: { encoding: "synthetic-token-counter", count: (text: string) => Math.ceil(text.length / 4) } }) } : {}) });
  const repair = new PhaseQualityResolutionApplication({ targets: { resolveCompatibility: async () => ({ project, feature: (await scan())[0]!, workItems: await scan() }) }, store, scan, readiness: refresh, plan: () => ({}) as never, notify,
    worker: async input => { workerCalls++; workerPrompts.push(input.prompt); busy = true; await new Promise(resolve => setTimeout(resolve, 120));
      if (mode === "repair-no-execution") { busy = false; return 'Tests created; no execution report.\nHEPHA_VERIFICATION_DIAGNOSIS_V1 {"findings":[]}'; }
      if (mode === "diagnosis-repair" && workerCalls === 1) {
        busy = false;
        return `HEPHA_VERIFICATION_DIAGNOSIS_V1 ${JSON.stringify({ findings: [{ sourceId: "AC-02", diagnosis: { kind: "implementation_missing", explanation: "The existing journey delegates setup to a shared helper whose required persistence control is absent.", references: ["verification.md:1"], nextAction: "Repair the existing helper in this phase; preserve authentication delegation and the passing save test, then verify the browser boundary and affected callers." } }] })}`;
      }
      if (!executionEnvironmentAvailable) { busy = false; return `NOT EXECUTED: controlled test server and fixture account remain unavailable. No tests or production code changed.\nHEPHA_VERIFICATION_DIAGNOSIS_V1 ${JSON.stringify({ findings: (mode === "configured-execution" ? ["AC-02", "AC-04"] : ["AC-02"]).map(sourceId => ({ sourceId, diagnosis: { kind: "environment_blocked", explanation: "The documented controlled server is unavailable.", references: ["verification.md:1"], nextAction: "Make the controlled server and account available, acknowledge the prerequisite, then rerun existing verification." } })) })}`; }
      publish("browser"); busy = false; return 'Existing browser scenario executed; no test implementation added.\nHEPHA_VERIFICATION_DIAGNOSIS_V1 {"findings":[]}'; },
  });
  let userRefresh = new CompletionReadinessVerificationApplication(refresh, new FreshFeatureVerificationApplication({
    targets: { resolveCompatibility: async () => ({ project, feature: (await scan())[0]!, workItems: await scan() }) }, store, scan, readiness: refresh,
    plan: () => ({}) as never, notify, worker: async () => { throw new Error("This legacy assessment fixture has no fresh execution adapter; use the fresh-verification fixture."); },
  }));
  const policy = new FeatureCompletionReadinessPolicy({ readDeliveryMode: () => "direct_merge" });
  const metrics = async () => ({ modelCalls, workerCalls, workerPrompts, inspectedIdentities, sourcePages, assessedIdentityCounts, assessedSourceClauses, assessmentPromptLengths, routingPromptLengths, unexpected, metadata: await store.getCardMetadata(project.id, cardKey), busy: busy || repair.isRunning(project.id, feature.id) || refresh.isRunning(project.id, feature.id),
    record: readCoverageRecovery(folder), results: await store.listManualTestResults(project.id, cardKey, "pack"), pack: await store.getCurrentManualTestPack(project.id, cardKey),
    phaseDocument: readFileSync(phasePath, "utf8"), ready: policy.canStart((await scan())[0]!), lifecycle: feature.stateFolder });
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, "http://localhost"), path = url.pathname;
    const json = (value: unknown, code = 200) => { response.writeHead(code, { "Content-Type": "application/json" }); response.end(JSON.stringify(value)); };
    try {
      if (await handleCompletionReadinessRoute(request, response, url, userRefresh)) return;
      if (await handlePhaseQualityResolutionRoute(request, response, url, input => repair.resolve(input))) return;
      if (path.endsWith("memory-bank-events")) { response.writeHead(200, { "Content-Type": "text/event-stream" }); response.write(": connected\n\n"); events.add(response); request.on("close", () => events.delete(response)); return; }
      if (path.includes("live-activity")) { response.writeHead(200, { "Content-Type": "text/event-stream" }); response.write("event: live-activity.connected\ndata: {}\n\n"); events.add(response); request.on("close", () => events.delete(response)); return; }
      if (path === "/api/test/metrics") return json(await metrics());
      if (path === "/api/test/stale-assessment" && request.method === "POST") {
        const record = readCoverageRecovery(folder)!;
        record.assessmentVersion = "legacy-test-version";
        record.evidenceFingerprint = "legacy-assessment-fingerprint";
        writeFileSync(join(folder, "manual-test-verification", "completion-recovery.json"), JSON.stringify(record));
        return json({ changed: true });
      }
      if (path === "/api/test/environment-ready" && request.method === "POST") { executionEnvironmentAvailable = true; return json({ available: true }); }
      if (path === "/api/test/legacy-execution-plan" && request.method === "POST") {
        const record = readCoverageRecovery(folder)!;
        delete record.executionPlanFingerprint;
        record.unresolved = record.unresolved.map(({ sourceId, reason }) => ({ sourceId, reason,
          ...(sourceId === "AC-04" ? { execution: { command: "npm run verify:browser", testPaths: ["features/wrong"] } } : {}) }));
        writeFileSync(join(folder, "manual-test-verification", "completion-recovery.json"), JSON.stringify(record));
        return json({ changed: true });
      }
      if (path === "/api/test/legacy-routing" && request.method === "POST") {
        const record = readCoverageRecovery(folder)!;
        delete (record as any).executionRoutingVersion;
        record.unresolved = record.unresolved.map(({ sourceId, reason }) => ({ sourceId, reason }));
        writeFileSync(join(folder, "manual-test-verification", "completion-recovery.json"), JSON.stringify(record));
        return json({ changed: true });
      }
      if (path === "/api/test/tamper" && request.method === "POST") { writeFileSync(join(root, "browser.json"), readFileSync(join(root, "browser.json"), "utf8") + "\n"); return json({ changed: true }); }
      if (path === "/api/projects") return json({ projects: [project] });
      if (path.endsWith("/work-items")) return json({ project, items: await scan(), scannedAt: now, sourceIssues: [], scanStatus: { epicFolderExists: true, epicDocumentCount: 0, epicValidItemCount: 0, epicInvalidSourceCount: 0, epicScanFailed: false, message: null } });
      if (path.endsWith("/document")) return json({ ...feature, cardId: feature.id, content: feature.specMarkdown, readStatus: "ok", readError: null });
      if (path.endsWith("/runtime-evidence")) return json({ schemaVersion: "runtime-execution/v1", projectId: project.id, cardKey, phases: [] });
      if (path === "/api/manual-test-verification/status") { const status = (await scan())[0]!.featureWorkflow!.manualTestPackStatus; return json({ success: true, status, summary: status?.message }); }
      if (path === "/api/delivery/status") return json({ canPrepare: false, cardKey, deliveryError: null, githubIssue: null, issueRole: "feature_issue", mode: "direct_merge", preparationDisabledReason: null, pullRequest: null, status: "not_applicable", statusExplanation: "Direct merge", statusLabel: "Direct Merge", targetBranch: "master" });
      if (path.startsWith("/api/")) { unexpected.push(`${request.method} ${path}`); return json({ error: `Unexpected test API: ${path}` }, 404); }
      const dist = resolve("apps/web/dist"), target = resolve(dist, `.${path === "/" ? "/index.html" : path}`);
      if (!target.startsWith(dist + sep) || !existsSync(target) || !statSync(target).isFile()) { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { "Content-Type": ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" } as Record<string, string>)[extname(target)] ?? "application/octet-stream" }); response.end(readFileSync(target));
    } catch (error) { json({ error: String(error), message: String(error) }, 400); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { url, feature, project, metrics, phasePath,
    ports: { store, scan, readiness: refresh, notify },
    useRefreshApplication: (application: CompletionReadinessVerificationApplication) => { userRefresh = application; },
    holdAssessment: () => { assessmentGate = new Promise<void>(resolve => { releaseAssessment = resolve; }); return () => { assessmentGate = null; releaseAssessment(); }; },
    post: async (path: string, body: unknown) => { const result = await fetch(url + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { status: result.status, body: await result.json() }; },
    close: async () => { for (const event of events) event.end(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await store.close(); rmSync(root, { recursive: true, force: true }); },
  };
}
