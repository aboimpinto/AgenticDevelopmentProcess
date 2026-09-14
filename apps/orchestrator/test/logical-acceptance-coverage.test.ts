import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readPhaseAcceptanceContext } from "../src/manual-test-verification/phase-acceptance-context.js";
import { phaseGatesProtocol, evaluatePhaseGates, type PhaseGateRecord } from "../src/exchanges/phase-gates.js";
import { phaseGateProof } from "../src/exchanges/phase-gates-repository.js";
import { loadVerificationProfile } from "../src/final-verification-profile-loader.js";
import { recoveryEvidenceSnapshot } from "../src/manual-test-verification/recovery-evidence-snapshot.js";
import { proposeCoverageReconciliation } from "../src/manual-test-verification/coverage-reconciliation-prompt.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture(phaseId: string) {
  const root = mkdtempSync(join(tmpdir(), "hepha-logical-coverage-")); roots.push(root);
  const folder = join(root, "feature"); mkdirSync(folder);
  const path = join(folder, phaseId); writeFileSync(path, "# Accepted phase\n");
  const source = "test('save', async () => { await app.save('draft'); expect(await app.reload()).toEqual('draft'); });";
  writeFileSync(join(root, "integration.test.ts"), source);
  writeFileSync(join(root, "runner.log"), "Tests  1 passed (1)\n");
  const record: PhaseGateRecord = { phaseId, flags: { needTestCoverage: true, needCodeReview: false },
    criteria: [{ id: "AC-SAVE", description: "A saved draft survives reload" }],
    checks: [{ id: "integration", gate: "tests", required: true, command: "project test", cwd: ".", outcome: "passed", evidence: [{ path: "runner.log" }] }],
    review: { outcome: "not_applicable", reason: "No production changes" },
    coverage: { outcome: "sufficient", criteria: [{ criterionId: "AC-SAVE", checkIds: ["integration"], testPaths: ["integration.test.ts"], assertions: "The integration test saves through the application and checks the persisted draft after reload." }] } };
  const publish = () => writeFileSync(`${path}.gates.json`, phaseGatesProtocol.encode(record)); publish();
  return { root, folder, path, source, record, publish };
}
it.each(["phase-alpha.md", "phase-38.md"])("reuses logical assertion context from %s without a numeric coverage artifact", async phaseId => {
  const f = fixture(phaseId), before = readFileSync(`${f.path}.gates.json`);
  expect(evaluatePhaseGates(f.record, phaseGateProof(f.path, f.root)).find(g => g.gate === "tests")?.status).toBe("satisfied");
  const context = readPhaseAcceptanceContext(f.folder, f.root);
  expect(JSON.stringify(context)).toContain(f.source);
  expect(JSON.stringify(context)).toContain(f.record.coverage.criteria[0]!.assertions);
  const evidence = { id: "run", status: "executed-passed", command: "project test", sourcePath: "runner.log", detail: "1 test passed; revision: abcdef012345" };
  const result = await proposeCoverageReconciliation({ manifestEntries: [{ sourceId: "AC-SAVE", criterionPreview: "A saved draft survives reload" }], tests: [], automatedEvidence: [evidence], recoveryContext: { phaseAcceptanceAssessments: context } } as never, async prompt => {
    expect(prompt).toContain("Logical acceptance coverage");
    expect(prompt).toContain("Do not generate tests, execute commands, change files");
    expect(prompt).toContain("The integration test saves through the application");
    return JSON.stringify({ links: [{ sourceId: "AC-SAVE", kind: "automated", evidenceId: "run", explanation: "Existing save/reload assertions cover persistence." }], unresolved: [] });
  });
  expect(result.unresolved).toEqual([]); expect(result.proposal.links).toHaveLength(1);
  expect(readFileSync(`${f.path}.gates.json`)).toEqual(before);
});
it("changes the assessment context when an existing assertion changes, without inferring a pass", () => {
  const f = fixture("phase-beta.md"), first = JSON.stringify(readPhaseAcceptanceContext(f.folder, f.root));
  writeFileSync(join(f.root, "integration.test.ts"), "test('save', () => expect(true).toBe(true));");
  expect(JSON.stringify(readPhaseAcceptanceContext(f.folder, f.root))).not.toBe(first);
});
it("reports unavailable or external source references without reading outside the project", () => {
  const f = fixture("phase-gamma.md"), outside = mkdtempSync(join(tmpdir(), "hepha-outside-")); roots.push(outside);
  writeFileSync(join(outside, "secret.ts"), "private outside content");
  symlinkSync(join(outside, "secret.ts"), join(f.root, "linked.test.ts"));
  f.record.coverage.criteria[0]!.testPaths = ["missing.test.ts", "linked.test.ts"]; f.publish();
  const context = JSON.stringify(readPhaseAcceptanceContext(f.folder, f.root));
  expect(context).toContain("unavailable"); expect(context).not.toContain("private outside content");
});

it("accepts a configured final-verification profile with no numeric coverage command", () => {
  const f = fixture("phase-delta.md");
  const profile = join(f.root, "verification.yaml");
  writeFileSync(profile, `version: "2.0"
checks:
` + ["build", "test", "lint"].map(intent => `  - id: ${intent}
    intent: ${intent}
    command: [project, ${intent}]
    workingDirectory: .
    timeout: 60000
    required: true
`).join(""));
  const loaded = loadVerificationProfile(profile);
  expect(loaded).toMatchObject({ valid: true, issues: [] });
  expect(loaded.profile?.checks.map(check => check.intent)).toEqual(["build", "test", "lint"]);
});
it("binds readiness to current logical assertion sources without changing manual pack identity", async () => {
  const f = fixture("phase-epsilon.md");
  const context = { featFolderPath: f.folder, projectRoot: f.root, featExternalId: "ITEM", projectId: "project", cardKey: "feature:ITEM",
    store: { getCurrentManualTestPack: async () => null, getCurrentManualTestReview: async () => null } };
  const model = { tests: [], automatedEvidence: [] };
  const before = await recoveryEvidenceSnapshot(context as never, model as never);
  expect(JSON.stringify(before.model)).toContain(f.source);
  writeFileSync(join(f.root, "integration.test.ts"), "test('save', () => expect(true).toBe(true));");
  const after = await recoveryEvidenceSnapshot(context as never, model as never);
  expect(after.fingerprint).not.toBe(before.fingerprint);
  expect(model).toEqual({ tests: [], automatedEvidence: [] });
});

it("reads current integration assertions from configured inspection without requiring new phase artifacts", () => {
  const f = fixture("legacy-phase.md"); unlinkSync(`${f.path}.gates.json`);
  const context = readPhaseAcceptanceContext(f.folder, f.root, [{ id: "existing-integration", command: "project test", cwd: f.root,
    kind: "test", configurationFiles: [], testPaths: ["integration.test.ts"], reason: "Save and reload are asserted through the shared application fixture." }]);
  expect(JSON.stringify(context)).toContain(f.source);
  expect(context[0]?.checks?.[0]?.reason).toContain("shared application fixture");
  expect(context[0]?.recordPath).toBe("current-inspection:existing-integration");
});
