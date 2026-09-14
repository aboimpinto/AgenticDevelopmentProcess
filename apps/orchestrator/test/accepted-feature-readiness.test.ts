import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeSourceItems } from "../src/manual-test-verification-policy.js";
import type { ManualTestDeliveryModel } from "../src/manual-test-verification/delivery-model.js";
import { hashManualTestDeliveryModel } from "../src/manual-test-verification/delivery-model.js";
import { buildAcceptedFeatureScope, captureAcceptedFeatureScope, readinessModel } from "../src/manual-test-verification/accepted-feature-scope.js";
import { decodeFeatureAcceptance, featureAcceptanceExchange, type FeatureAcceptanceAssessment } from "../src/manual-test-verification/feature-acceptance-assessment.js";
import { publishReadinessImprovements } from "../src/manual-test-verification/readiness-improvements.js";
import { readPhaseAcceptanceContext } from "../src/manual-test-verification/phase-acceptance-context.js";
import type { FreshCheck } from "../src/manual-test-verification/fresh-verification-evidence.js";
import type { CoverageRecoveryRecord } from "../src/manual-test-verification/acceptance-coverage-reconciliation.js";
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "accepted-feature-")); roots.push(root);
  const text = "AC-FORM-01: Save confirms the form. Browser Save and component alternate-state tests collectively verify this behavior.";
  writeFileSync(join(root, "FeatureDescription.md"), `# Form\n## Acceptance Criteria\n- ${text}\n`);
  writeFileSync(join(root, "acceptance-test-report.md"), "Browser Save plus component alternate-state assertions are the agreed approach.");
  const manifestEntries = normalizeSourceItems([{ category: "feat-ac", explicitId: "AC-FORM-01", relativePath: "FeatureDescription.md", text }, { category: "epic-ac", explicitId: "AC-OTHER-01", relativePath: "Epic.md", text: "Unrelated future workflow." }]);
  const base: ManualTestDeliveryModel = { manifestEntries, coverageMap: manifestEntries.map(e => ({ ...e, coverageStatus: "uncovered", testIds: [] })) as never, tests: [], invalidManualTests: [{ id: "authoring", errors: ["Previous draft only had one criterion."] }], automatedEvidence: [{ id: "executed-form", title: "Form", command: "node --test form.test.js", sourcePath: "report.txt", status: "executed-passed", detail: "2 tests; revision: abcdef012345" }], deferredSurfaces: [], applicability: "incomplete" };
  const scope = buildAcceptedFeatureScope({ featFolderPath: root, featExternalId: "FEAT-FORM" }, base);
  const model = readinessModel({ ...base, acceptedScope: scope });
  const payload: FeatureAcceptanceAssessment = { baselineId: scope.id, criteria: [{ sourceId: "AC-FORM-01", status: "satisfied", contributions: [{ kind: "automated", evidenceId: "executed-form", explanation: "The connected Save assertion and alternate-state assertions collectively verify the accepted approach." }] }], improvements: [{ observation: "Consider another browser-only alternative", rationale: "Future additional verification; the accepted combination already covers the feature.", references: ["form.test.js"] }] };
  return { root, base, scope, model, payload };
}
describe("accepted feature readiness", () => {
  it("accepts collective evidence, excludes unrelated parent criteria and records stronger tests as improvements", () => {
    const { scope, model, payload } = fixture();
    expect(scope.criteria.map(c => c.sourceId)).toEqual(["AC-FORM-01"]);
    const result = decodeFeatureAcceptance(featureAcceptanceExchange.encode(payload), model);
    expect(result.unresolved).toEqual([]);
    expect(result.proposal.links).toHaveLength(1);
    expect(result.improvements[0]?.status).toBe("proposed-for-future-planning");
  });
  it("rejects invented criteria, omitted criteria, duplicate criteria and stronger obligations", () => {
    const { model, payload } = fixture();
    for (const criteria of [[], [...payload.criteria, ...payload.criteria], [{ ...payload.criteria[0]!, sourceId: "AC-EXTRA-02" }]]) {
      expect(() => decodeFeatureAcceptance(featureAcceptanceExchange.encode({ ...payload, criteria }), model)).toThrow();
    }
    const wrong: FeatureAcceptanceAssessment = { ...payload, criteria: [{ ...payload.criteria[0]!, status: "unmet", gap: { obligation: "Every state must run in a browser", expected: "More browser tests", observed: "Component tests", references: ["form.test.js"], nextAction: "Add tests" } }] };
    expect(() => decodeFeatureAcceptance(featureAcceptanceExchange.encode(wrong), model)).toThrow(/exact excerpt/);
  });
  it("reports a real accepted assertion gap and retains partial evidence", () => {
    const { model, payload } = fixture();
    payload.criteria[0] = { ...payload.criteria[0]!, status: "unmet", gap: { obligation: "Save confirms the form.", expected: "Save confirms the form.", observed: "The test only opens the form", references: ["form.test.js"], nextAction: "Assert Save confirmation" } };
    const result = decodeFeatureAcceptance(featureAcceptanceExchange.encode(payload), model);
    expect(result.proposal.links).toHaveLength(0);
    expect(result.partialLinks).toHaveLength(1);
    expect(result.unresolved[0]?.diagnosis?.kind).toBe("implementation_missing");
  });
  it("keeps missing evidence distinct from missing code and rejects failed or invented evidence", () => {
    const { model, payload } = fixture();
    const pending: FeatureAcceptanceAssessment = { ...payload, criteria: [{ sourceId: "AC-FORM-01", status: "evidence_pending", contributions: [], evidenceNeed: { reason: "Read the delegated Save assertion", references: ["shared-save.ts"], nextAction: "Inspect the current helper" } }] };
    expect(decodeFeatureAcceptance(featureAcceptanceExchange.encode(pending), model).unresolved[0]?.diagnosis?.kind).toBe("investigation_required");
    expect(() => decodeFeatureAcceptance(featureAcceptanceExchange.encode(payload), { ...model, automatedEvidence: [] })).toThrow();
    expect(featureAcceptanceExchange.decode(JSON.stringify({ schemaVersion: "hepha-exchange/v1", kind: "feature.acceptance.assessment", payload: { ...payload, ready: true } })).valid).toBe(false);
  });
  it("preserves manual package identity while excluding authoring defects from automated readiness", () => {
    const { base } = fixture(); const hash = hashManualTestDeliveryModel(base);
    expect(readinessModel(base).invalidManualTests).toEqual([]);
    expect(hashManualTestDeliveryModel(base)).toBe(hash);
    expect(readinessModel({ ...base, invalidManualTests: [{ id: "broken-case", errors: ["No executable step"] }] }).invalidManualTests).toHaveLength(0);
  });
  it("pins the accepted plan and rejects unapproved criterion edits", () => {
    const { root, scope, base } = fixture(); captureAcceptedFeatureScope(root, scope);
    expect(buildAcceptedFeatureScope({ featFolderPath: root, featExternalId: "FEAT-FORM" }, base).id).toBe(scope.id);
    writeFileSync(join(root, "FeatureDescription.md"), "## Acceptance Criteria\n- AC-FORM-01: Save now requires another workflow.\n");
    expect(() => buildAcceptedFeatureScope({ featFolderPath: root, featExternalId: "FEAT-FORM" }, base)).toThrow(/criteria changed/);
  });
  it("publishes deduplicated proposals outside the feature without promoting them into current requirements", () => {
    const { root, model, payload, scope } = fixture();
    const result = decodeFeatureAcceptance(featureAcceptanceExchange.encode(payload), model);
    const record = { baselineId: scope.id, improvements: result.improvements } as CoverageRecoveryRecord;
    publishReadinessImprovements(root, "FEAT-FORM", record); publishReadinessImprovements(root, "FEAT-FORM", record);
    const content = readFileSync(join(root, "LessonsLearned/feat-form-readiness-improvements.md"), "utf8");
    expect(content.match(/<!-- improvement:/g)).toHaveLength(1);
    expect(content).toContain("status: proposed-for-future-planning");
  });
  it("reads selected sources across admitted repositories and keeps unadmitted roots inaccessible", () => {
    const { root } = fixture(); const front = join(root, "front"), back = join(root, "back"); mkdirSync(front); mkdirSync(back);
    writeFileSync(join(back, "SaveTests.cs"), "Assert.Equal(expected, Save());");
    const check = { id: "save", cwd: back, command: "dotnet test", kind: "test", testPaths: ["SaveTests.cs"], reason: "Save assertion" } as FreshCheck;
    expect(readPhaseAcceptanceContext(root, front, [check], [front, back])[0]?.sources?.[0]?.content).toContain("Assert.Equal");
    expect(readPhaseAcceptanceContext(root, front, [check])[0]?.sources?.[0]?.status).toBe("unavailable");
  });
});

it("keeps manual-only obligations outside automated assessment and rejects manual links even with a PASS", () => {
  const { model, payload } = fixture();
  Object.assign(model, { tests: [{ id: "MT-DEVICE", steps: ["Open the form"] }], recoveryContext: { manualResults: [{ testId: "MT-DEVICE", reviewed: true, result: "pass" }] } });
  payload.criteria[0]!.contributions = [{ kind: "manual", evidenceId: "MT-DEVICE", stepNumbers: [1], explanation: "User acknowledged execution" }];
  expect(() => featureAcceptanceExchange.encode(payload)).toThrow(/EXCHANGE_PROTOCOL_INVALID/);
  model.acceptedScope!.criteria[0]!.verification = "manual";
  const automated = readinessModel(model);
  expect(automated.coverageMap).toEqual([]);
  expect(automated.tests).toEqual([]);
});

it("follows delegated helpers and retrieves missing references only within admitted roots", async () => {
  const { root } = fixture();
  writeFileSync(join(root, "form.test.ts"), "import { assertSave } from './assert-save.js'; assertSave();");
  writeFileSync(join(root, "assert-save.ts"), "export const assertSave = () => expect(save()).toEqual('saved');");
  const checks = [{ id: "form", cwd: root, command: "project-test", kind: "test", testPaths: ["form.test.ts"] }] as FreshCheck[];
  const context = readPhaseAcceptanceContext(root, root, checks);
  expect(context[0]?.sources?.some(s => s.content?.includes("toEqual('saved')"))).toBe(true);
  const { readAcceptanceReferences } = await import("../src/manual-test-verification/phase-acceptance-context.js");
  expect(readAcceptanceReferences(["assert-save.ts:1"], root)).toContain("toEqual('saved')");
  expect(readAcceptanceReferences(["../../etc/passwd"], root)).toBe("");
});

it("retains the admitted baseline across a lifecycle folder move and archives an authorized planning amendment", () => {
  const { root, scope, base } = fixture(); captureAcceptedFeatureScope(root, scope);
  const movedModel = { ...base, manifestEntries: base.manifestEntries.map(e => ({ ...e, relativePath: `Features/03_IN_PROGRESS/feature/${e.relativePath}` })) };
  expect(buildAcceptedFeatureScope({ featFolderPath: root, featExternalId: "FEAT-FORM" }, movedModel).id).toBe(scope.id);
  writeFileSync(join(root, "FeatureDescription.md"), "## Acceptance Criteria\n- AC-FORM-01: Save confirms and clears the form.\n");
  const amended = buildAcceptedFeatureScope({ featFolderPath: root, featExternalId: "FEAT-FORM" }, base, true);
  expect(amended.id).not.toBe(scope.id);
  captureAcceptedFeatureScope(root, amended, true);
  expect(JSON.parse(readFileSync(join(root, "manual-test-verification/accepted-scope-history", `${scope.id}.json`), "utf8")).id).toBe(scope.id);
});

it("retrieves a cited missing helper and reassesses without execution or new manual results", async () => {
  const { model, payload } = fixture();
  const { proposeCoverageReconciliation } = await import("../src/manual-test-verification/coverage-reconciliation-prompt.js");
  let calls = 0; const retrieved: string[][] = [];
  const result = await proposeCoverageReconciliation(model, async prompt => {
    calls++;
    if (calls === 1) return featureAcceptanceExchange.encode({ ...payload, criteria: [{ sourceId: "AC-FORM-01", status: "evidence_pending", contributions: [], evidenceNeed: { reason: "Need the delegated assertion", references: ["assert-save.ts"], nextAction: "Read the helper" } }] });
    expect(prompt).toContain("expect(save()).toBe('saved')");
    return featureAcceptanceExchange.encode(payload);
  }, "", undefined, undefined, references => { retrieved.push(references); return "assert-save.ts: expect(save()).toBe('saved')"; });
  expect(calls).toBe(2); expect(retrieved).toEqual([["assert-save.ts"]]);
  expect(result.unresolved).toEqual([]);
  expect(featureAcceptanceExchange.decode(featureAcceptanceExchange.encode(result.assessment!)).valid).toBe(true);
});

it.each(["dotnet test tests.csproj", "cargo test --manifest-path Cargo.toml", "npm run verify:feature"])("uses the declared feature inventory for %s without framework discovery", async command => {
  const { root } = fixture();
  writeFileSync(join(root, "runner.json"), "{}"); writeFileSync(join(root, "assertions.txt"), "Save confirms the form");
  const inventory = { schema: "project-verification-inventory/v1", checks: [{ id: "accepted-form", kind: "test", cwd: ".", command, configurationFiles: ["runner.json"], testPaths: ["assertions.txt"], reason: "Accepted form criterion" }], phases: [{ phaseNumber: 42, checkIds: ["accepted-form"] }] };
  writeFileSync(join(root, "FeatureDescription.md"), `# Form\n<!-- hepha:verification-inventory:start -->\n\`\`\`json\n${JSON.stringify(inventory)}\n\`\`\`\n<!-- hepha:verification-inventory:end -->`);
  const { discoverVerificationTargets } = await import("../src/manual-test-verification/configured-verification-targets.js");
  const first = discoverVerificationTargets(root, root);
  expect(first.diagnostics).toEqual([]); expect(first.targets[0]?.command).toBe(command);
  writeFileSync(join(root, "runner.json"), '{"changed":true}');
  expect(discoverVerificationTargets(root, root).fingerprint).not.toBe(first.fingerprint);
});

it("does not import a parent criterion just because it shares the feature criterion ID", () => {
  const { root, base } = fixture();
  const duplicate = { ...base.manifestEntries[0]!, category: "epic-ac" as const, relativePath: "Epic.md", criterionPreview: "An unrelated parent requirement" };
  const manifestEntries = [...base.manifestEntries, duplicate];
  const scope = buildAcceptedFeatureScope({ featFolderPath: root, featExternalId: "FEAT-FORM" }, { ...base, manifestEntries });
  const scoped = readinessModel({ ...base, manifestEntries, acceptedScope: scope });
  expect(scoped.manifestEntries).toHaveLength(1);
  expect(scope.criteria).toHaveLength(1);
});

it("keeps automated scope and fingerprint independent of manual cases, results and authoring issues", async () => {
  const { root, base } = fixture();
  const { recoveryEvidenceSnapshot } = await import("../src/manual-test-verification/recovery-evidence-snapshot.js");
  const context = { featFolderPath: root, featExternalId: "FEAT-FORM", projectRoot: root,
    store: new Proxy({}, { get() { throw new Error("Assessment must not request manual storage"); } }) } as never;
  const first = await recoveryEvidenceSnapshot(context, base);
  const changed = { ...base, tests: [{ id: "MT-LATER", sourceIds: ["AC-FORM-01"], steps: ["Open the form"] }],
    invalidManualTests: [{ id: "draft", errors: ["Prepare a later manual qualification"] }],
    coverageMap: base.coverageMap.map(entry => ({ ...entry, testIds: ["MT-LATER"], coverageStatus: "manual" })) } as unknown as ManualTestDeliveryModel;
  const second = await recoveryEvidenceSnapshot(context, changed);
  expect(second.fingerprint).toBe(first.fingerprint);
  expect(second.model.coverageMap).toEqual(first.model.coverageMap);
  expect(second.model.tests).toEqual([]);
  expect(second.model.recoveryContext).toMatchObject({ currentPackId: null, manualResults: [] });
});

it("retains retrieved assertion bodies across a chain longer than two reads", async () => {
  const { model, payload } = fixture();
  const { proposeCoverageReconciliation } = await import("../src/manual-test-verification/coverage-reconciliation-prompt.js");
  const bodies = ["export const route = sharedSave;", "export const sharedSave = persist;", "expect(persist()).toBe('saved');"];
  let calls = 0;
  const result = await proposeCoverageReconciliation(model, async prompt => {
    for (const body of bodies.slice(0, calls)) expect(prompt).toContain(body);
    if (calls++ === bodies.length) return featureAcceptanceExchange.encode(payload);
    return featureAcceptanceExchange.encode({ ...payload, criteria: [{ sourceId: "AC-FORM-01", status: "evidence_pending", contributions: [],
      evidenceNeed: { reason: "Follow the shared assertion", references: [`helper-${calls}.ts`], nextAction: "Read the helper" } }] });
  }, "", undefined, undefined, refs => bodies[Number(refs[0]!.match(/\d+/)![0]) - 1]!);
  expect(calls).toBe(4);
  expect(result.unresolved).toEqual([]);
});

it("keeps accepted allocation and advisory lessons in initial, retrieval and schema-correction prompts", async () => {
  const { root, model, payload, scope } = fixture();
  payload.improvements.push({ observation: "Offline retry is not implemented", rationale: "Offline retry is absent from the approved criteria; delivered Save and confirmation already fulfill the accepted scope.", references: ["FeatureDescription.md"] });
  const { proposeCoverageReconciliation } = await import("../src/manual-test-verification/coverage-reconciliation-prompt.js");
  const originalPlan = readFileSync(join(root, "FeatureDescription.md"), "utf8");
  let calls = 0;
  const result = await proposeCoverageReconciliation(model, async prompt => {
    expect(prompt).toContain("EPIC requirements -> EPIC acceptance criteria -> FEAT acceptance criteria -> Phase/Task tests -> implementation");
    expect(prompt).toContain("Browser Save plus component alternate-state assertions are the agreed approach.");
    expect(prompt).toContain("Do not make an additional historical browser journey mandatory");
    expect(prompt).toContain("Record every optional testing or product improvement in payload.improvements");
    expect(prompt).toContain("Readiness evaluates the work delivered for the approved scope.");
    expect(prompt).toContain("An optional improvement is not a fourth blocking state and cannot justify unmet or evidence_pending.");
    expect(prompt).toContain("missing context about optional work is not a blocker");
    expect(prompt).toContain("An unused historical report is not itself a gap");
    expect(prompt).toContain("EPIC -> FEAT -> PHASE -> TASK -> CODE");
    if (++calls === 1) return featureAcceptanceExchange.encode({ ...payload, criteria: [{
      sourceId: "AC-FORM-01", status: "evidence_pending", contributions: [],
      evidenceNeed: { reason: "Read the mapped alternate-state assertions", references: ["alternate.test.ts"], nextAction: "Retrieve the existing test" },
    }] });
    expect(prompt).toContain("expect(saveAlternate()).toEqual('saved');");
    if (calls === 2) return "invalid response";
    expect(prompt).toContain("Response schema correction");
    return featureAcceptanceExchange.encode(payload);
  }, "", undefined, undefined, () => "expect(saveAlternate()).toEqual('saved');");
  expect(calls).toBe(3);
  expect(result.unresolved).toEqual([]);
  expect(result.assessment?.criteria[0]?.status).toBe("satisfied");
  expect(result.improvements).toEqual(expect.arrayContaining([expect.objectContaining({ observation: "Offline retry is not implemented", status: "proposed-for-future-planning" })]));
  publishReadinessImprovements(root, "FEAT-FORM", { baselineId: scope.id, improvements: result.improvements } as CoverageRecoveryRecord);
  expect(readFileSync(join(root, "LessonsLearned/feat-form-readiness-improvements.md"), "utf8")).toContain("Consider another browser-only alternative");
  expect(readFileSync(join(root, "LessonsLearned/feat-form-readiness-improvements.md"), "utf8")).toContain("Offline retry is not implemented");
  expect(readFileSync(join(root, "FeatureDescription.md"), "utf8")).toBe(originalPlan);
});

it("retains satisfied decisions while resolving only pending accepted criteria", async () => {
  const { model, payload } = fixture();
  const { proposeCoverageReconciliation } = await import("../src/manual-test-verification/coverage-reconciliation-prompt.js");
  model.acceptedScope!.criteria.push({ ...model.acceptedScope!.criteria[0]!, sourceId: "AC-FORM-02", text: "Reopening shows the saved form." });
  model.manifestEntries.push({ ...model.manifestEntries[0]!, sourceId: "AC-FORM-02" });
  model.coverageMap.push({ ...model.coverageMap[0]!, sourceId: "AC-FORM-02" });
  let calls = 0;
  const result = await proposeCoverageReconciliation(model, async prompt => {
    calls++;
    if (calls === 1) return featureAcceptanceExchange.encode({ ...payload, criteria: [...payload.criteria,
      { sourceId: "AC-FORM-02", status: "evidence_pending", contributions: [], evidenceNeed: { reason: "Need the reopen assertion", references: ["reopen.ts"], nextAction: "Read the helper" } }] });
    const evidence = JSON.parse(prompt.match(/^Evidence: (.+)$/m)![1]!);
    expect(evidence.coverageMap.map((c: { sourceId: string }) => c.sourceId)).toEqual(["AC-FORM-02"]);
    return featureAcceptanceExchange.encode({ ...payload, criteria: [{ ...payload.criteria[0]!, sourceId: "AC-FORM-02" }] });
  }, "", undefined, undefined, () => "expect(reopen()).toEqual(savedForm);");
  expect(calls).toBe(2);
  expect(result.assessment?.criteria.map(c => [c.sourceId, c.status])).toEqual([["AC-FORM-01", "satisfied"], ["AC-FORM-02", "satisfied"]]);
  expect(result.proposal.links).toHaveLength(2);
});

it("stops repeated reference requests without interpreting missing context as a pass", async () => {
  const { model, payload } = fixture();
  const { proposeCoverageReconciliation } = await import("../src/manual-test-verification/coverage-reconciliation-prompt.js");
  let calls = 0;
  const result = await proposeCoverageReconciliation(model, async () => {
    calls++;
    return featureAcceptanceExchange.encode({ ...payload, criteria: [{ sourceId: "AC-FORM-01", status: "evidence_pending", contributions: [],
      evidenceNeed: { reason: "Cannot establish the delegated assertion", references: ["helper.ts"], nextAction: "Inspect the unresolved dependency" } }] });
  }, "", undefined, undefined, () => "export const value = 'inspected';");
  expect(calls).toBe(2);
  expect(result.proposal.links).toEqual([]);
  expect(result.unresolved).toHaveLength(1);
});

it("resolves document anchors and line ranges in explicitly admitted feature documents", async () => {
  const { root } = fixture(); const app = join(root, "app"), feature = join(root, "feature");
  mkdirSync(app); mkdirSync(feature); mkdirSync(join(feature, "Phases"));
  writeFileSync(join(feature, "FeatureDescription.md"), "## Verification matrix\nBrowser Save plus component alternatives.");
  writeFileSync(join(feature, "Phases/phase-design.md"), "## Task 2\nUse shared automated assertions.");
  writeFileSync(join(app, "form.test.ts"), "expect(save()).toEqual('saved');");
  const { readAcceptanceReferences } = await import("../src/manual-test-verification/phase-acceptance-context.js");
  const sources = readAcceptanceReferences(["FeatureDescription.md#verification-matrix", "Phases/phase-design.md: Task 2", "form.test.ts:10-20"], app, [feature]);
  expect(sources).toContain("Browser Save plus component alternatives.");
  expect(sources).toContain("Use shared automated assertions.");
  expect(sources).toContain("expect(save()).toEqual('saved');");
  expect(readAcceptanceReferences(["FeatureDescription.md#verification-matrix"], app)).toBe("");
});

it("reads requested files independently so a batch byte limit cannot silently drop later sources", async () => {
  const { root, model, payload } = fixture();
  const { readAcceptanceReferences } = await import("../src/manual-test-verification/phase-acceptance-context.js");
  const { proposeCoverageReconciliation } = await import("../src/manual-test-verification/coverage-reconciliation-prompt.js");
  writeFileSync(join(root, "route.ts"), "// source detail\n".repeat(7000) + "\nexport const route = save;\n");
  writeFileSync(join(root, "assertion.ts"), "// source detail\n".repeat(7000) + "\nexpect(save()).toBe('saved');\n");
  let calls = 0;
  const result = await proposeCoverageReconciliation(model, async prompt => {
    if (calls++ === 0) return featureAcceptanceExchange.encode({ ...payload, criteria: [{ sourceId: "AC-FORM-01", status: "evidence_pending", contributions: [],
      evidenceNeed: { reason: "Follow routing and assertions", references: ["route.ts", "assertion.ts"], nextAction: "Read both sources" } }] });
    expect(prompt).toContain("export const route = save;");
    expect(prompt).toContain("expect(save()).toBe('saved');");
    return featureAcceptanceExchange.encode(payload);
  }, "", undefined, { model: { contextWindow: 1_000_000, maxTokens: 16_000, reasoning: true }, counter: { encoding: "fixture", count: text => text.length } },
  refs => readAcceptanceReferences(refs, root));
  expect(calls).toBe(2);
  expect(result.unresolved).toEqual([]);
});

it("deduplicates file aliases without escaping the admitted root or dispatching an identical assessment", async () => {
  const { root, model, payload } = fixture();
  writeFileSync(join(root, "assertion.ts"), "export const save = delegated;");
  const { readAcceptanceReferences } = await import("../src/manual-test-verification/phase-acceptance-context.js");
  const { proposeCoverageReconciliation } = await import("../src/manual-test-verification/coverage-reconciliation-prompt.js");
  let calls = 0;
  const result = await proposeCoverageReconciliation(model, async () => {
    calls++;
    return featureAcceptanceExchange.encode({ ...payload, criteria: [{ sourceId: "AC-FORM-01", status: "evidence_pending", contributions: [],
      evidenceNeed: { reason: "Need delegated assertion", references: [`assertion.ts:${calls}`], nextAction: "Read assertion" } }] });
  }, "", undefined, undefined, refs => readAcceptanceReferences(refs, root));
  expect(calls).toBe(2);
  expect(result.proposal.links).toEqual([]);
});
