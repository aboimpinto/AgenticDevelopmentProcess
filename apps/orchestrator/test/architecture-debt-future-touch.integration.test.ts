// Behavior suite: architecture debt future-touch integration.
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { WorkItemCard } from "@hepha/shared";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { ArchitectureDebtSqliteStore, createArchitectureDebtRecordId, type ArchitectureDebtLocation } from "@hepha/db";
import {
  buildArchitectureDebtContext,
  evaluateFeatureDebtReadiness,
  recordArchitectureDebtTriage,
  recordFutureTouchDecision,
  validateArchitectureDebtTouchPlan,
} from "../src/architecture-debt-integration.js";
import { projectArchitectureDebtRegister } from "../src/architecture-debt-presentation.js";
import { resolveArchitectureDebtPrerequisiteStates } from "../src/application/features/refined-feature-readiness-application.js";

const roots: string[] = [];
const hash = (value: string) => value.repeat(64);
const authority = { actorId: "steward-067", verifiedRole: "ARCHITECTURE_STEWARD" as const };
const locations: readonly ArchitectureDebtLocation[] = [{ locationId: "location-067", relativePath: "apps/orchestrator/src/debt.ts", symbol: "evaluateDebt", ruleTags: ["architecture-debt"] }];
const rule = { ruleId: "architecture-debt", ruleVersion: "1", ruleHash: hash("a"), catalogHash: hash("b"), category: "architecture", sourceReference: ".hepha/architecture-rules.yaml" } as const;

function createOperation() {
  const projectId = "hepha";
  return {
    kind: "CREATE_PENDING" as const, expectedVersion: 0 as const,
    recordId: createArchitectureDebtRecordId({ projectId, rule, architecturalBoundary: "rule-scope:orchestrator", locations }), projectId,
    ownerId: "steward-067", rationale: "Deferred historical debt.", risk: "The historical boundary needs governance.", architecturalBoundary: "rule-scope:orchestrator", priority: "P2" as const, prioritySource: "AUTO_PENDING_DEFAULT" as const,
    futureTouchTrigger: { triggerId: "touch-observed-surface", name: "Touch observed surface", paths: ["apps/orchestrator/src/debt.ts"], symbols: ["evaluateDebt"], ruleTags: ["architecture-debt"] },
    discovery: { featureId: "feat-065", phaseNumber: 2, reviewGateId: "code-review", findingId: "finding-067", manifest: { artifactKind: "review_manifest" as const, artifactId: "manifest-067", contentHash: hash("c"), relativePath: "MemoryBank/manifest.json" }, observation: { artifactKind: "debt_observation" as const, artifactId: "observation-067", contentHash: hash("d"), relativePath: "MemoryBank/observation.json" }, currentFeatureImpact: "untouched_non_blocking" as const },
    rule, locations, createdAt: "2026-07-18T23:00:00.000Z",
  };
}
function plan() { return { schemaVersion: "hepha-architecture-debt-touch-plan/v1" as const, projectId: "hepha", featureId: "feat-099", paths: ["apps/orchestrator/src/debt.ts"], symbols: [], ruleTags: ["architecture-debt"] }; }
function selectors() { return ["location:location-067:path", "location:location-067:rule:architecture-debt", "trigger:touch-observed-surface:path:apps/orchestrator/src/debt.ts", "trigger:touch-observed-surface:rule:architecture-debt"]; }
function decision(kind: "REMEDIATE" | "PREREQUISITE" | "WAIVER" | "NON_INTERACTION", recordId: string, touchPlanHash: string, overrides: Record<string, unknown> = {}) {
  const base = { decisionId: `decision-${kind.toLowerCase()}`, projectId: "hepha", featureId: "feat-099", touchPlanHash, recordId, recordVersion: 0, selectorIds: selectors(), kind, actorId: authority.actorId, authorizedRole: "ARCHITECTURE_STEWARD" as const, reason: "The steward records an exact feature decision.", occurredAt: "2026-07-18T23:00:00.000Z" };
  if (kind === "REMEDIATE") return { ...base, owningPhaseTask: "phase-a.remediate", acceptanceObligation: "Remediate the matched debt in the named task.", ...overrides };
  if (kind === "PREREQUISITE") return { ...base, prerequisiteFeatureId: "feat-098", orderingEvidence: "feat-098 precedes feat-099.", completionCondition: "feat-098 is COMPLETED.", ...overrides };
  if (kind === "WAIVER") return { ...base, reconsiderationTrigger: "next-architecture-review", ...overrides };
  return { ...base, inspectedBoundary: "orchestrator debt boundary", explanation: "The planned change does not interact with the debt behavior.", ...overrides };
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "feat-067-integration-")); roots.push(root);
  const databasePath = join(root, "hepha.sqlite");
  const store = new ArchitectureDebtSqliteStore(databasePath);
  const created = store.commitArchitectureDebtOperation(createOperation());
  if (created.kind !== "committed") throw new Error("pending debt fixture must commit");
  const validated = validateArchitectureDebtTouchPlan(plan());
  if (validated.kind !== "valid") throw new Error("plan fixture must validate");
  const featureFolder = join(root, "MemoryBank", "Features", "02_READY_TO_DEVELOP", "feat-099");
  mkdirSync(featureFolder, { recursive: true });
  writeFileSync(join(featureFolder, "ArchitectureDebtTouchPlan.json"), `${JSON.stringify(plan(), null, 2)}\n`);
  writeFileSync(join(featureFolder, "PhaseExecutionContract.json"), JSON.stringify({ schemaVersion: "hepha-phase-execution/v1", phases: [{ id: "phase-a", order: 0, document: "Phases/phase-0-any-future-touch-name.md", role: "implementation", tasks: [{ id: "remediate", kind: "work", required: true }], developmentValidation: "focused", codeReview: "never", finalValidation: "none", failurePolicy: "repair_and_rerun" }] }));
  return { store, aggregate: created.aggregate, validated, featureFolder, databasePath };
}
afterEach(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); roots.length = 0; });

describe("E013-AD-004: future-touch refinement and readiness integration", () => {
  it("does not require a configured steward when the valid plan matches no open debt", () => {
    const root = mkdtempSync(join(tmpdir(), "feat-067-empty-readiness-")); roots.push(root);
    const store = new ArchitectureDebtSqliteStore(join(root, "hepha.sqlite"));
    const featureFolder = join(root, "feature");
    mkdirSync(featureFolder, { recursive: true });
    writeFileSync(join(featureFolder, "ArchitectureDebtTouchPlan.json"), `${JSON.stringify(plan(), null, 2)}\n`);

    expect(evaluateFeatureDebtReadiness({
      featureFolderPath: featureFolder,
      projectId: "hepha",
      featureId: "feat-099",
      authority: null,
      store,
      prerequisiteStates: [],
      clockNow: "2026-07-18T23:10:00.000Z",
    })).toMatchObject({ kind: "ready", context: { matchedDebt: [] } });
    store.close();
  });

  it("sorts symbol query facts independently from touch-plan relative-path order", () => {
    const root = mkdtempSync(join(tmpdir(), "feat-067-symbol-order-")); roots.push(root);
    const store = new ArchitectureDebtSqliteStore(join(root, "hepha.sqlite"));
    const featureFolder = join(root, "feature");
    mkdirSync(featureFolder, { recursive: true });
    writeFileSync(join(featureFolder, "ArchitectureDebtTouchPlan.json"), `${JSON.stringify({
      schemaVersion: "hepha-architecture-debt-touch-plan/v1",
      projectId: "hepha",
      featureId: "feat-099",
      paths: ["apps/a.ts", "apps/z.ts"],
      symbols: [
        { relativePath: "apps/a.ts", symbol: "ZuluBoundary" },
        { relativePath: "apps/z.ts", symbol: "AlphaBoundary" },
      ],
      ruleTags: [],
    }, null, 2)}\n`);

    expect(evaluateFeatureDebtReadiness({
      featureFolderPath: featureFolder,
      projectId: "hepha",
      featureId: "feat-099",
      authority: null,
      store,
      prerequisiteStates: [],
      clockNow: "2026-07-18T23:10:00.000Z",
    })).toMatchObject({ kind: "ready", context: { matchedDebt: [] } });
    store.close();
  });

  it("requires a configured steward when the valid plan matches open debt", () => {
    const { store, featureFolder } = fixture();
    expect(evaluateFeatureDebtReadiness({
      featureFolderPath: featureFolder,
      projectId: "hepha",
      featureId: "feat-099",
      authority: null,
      store,
      prerequisiteStates: [],
      clockNow: "2026-07-18T23:10:00.000Z",
    })).toMatchObject({ kind: "blocked", code: "readiness_blocked" });
    store.close();
  });

  it("denies a matching refined feature until one persisted exact decision exists, then returns bounded context", () => {
    const { store, aggregate, validated, featureFolder } = fixture();
    expect(evaluateFeatureDebtReadiness({ featureFolderPath: featureFolder, projectId: "hepha", featureId: "feat-099", authority, store, prerequisiteStates: [], clockNow: "2026-07-18T23:10:00.000Z" })).toMatchObject({ kind: "blocked", code: "readiness_blocked" });
    const persistedDecision = decision("NON_INTERACTION", aggregate.recordId, validated.touchPlanHash);
    expect(recordFutureTouchDecision({ touchPlan: plan(), decision: persistedDecision, authority, store })).toEqual({ kind: "committed" });
    expect(store.getFutureTouchDecisions({ projectId: "hepha", featureId: "feat-099", touchPlanHash: validated.touchPlanHash })).toEqual({ kind: "success", values: [persistedDecision] });
    const readiness = evaluateFeatureDebtReadiness({ featureFolderPath: featureFolder, projectId: "hepha", featureId: "feat-099", authority, store, prerequisiteStates: [], clockNow: "2026-07-18T23:10:00.000Z" });
    expect(readiness).toMatchObject({ kind: "ready", context: { kind: "architecture_debt_context/v1", matchedDebt: [{ recordId: aggregate.recordId, recordVersion: 0, decisionKind: "NON_INTERACTION" }] } });
    if (readiness.kind === "ready") expect(JSON.stringify(readiness.context)).not.toContain("contentHash");
    store.close();
  });

  it("persists policy-valid triage read-back and rejects malformed, foreign, or partial decision evidence without readiness promotion", () => {
    const { store, aggregate, validated, featureFolder } = fixture();
    const triage = recordArchitectureDebtTriage({ aggregate, authority, store, action: { operation: "CONFIRM", projectId: "hepha", recordId: aggregate.recordId, expectedVersion: 0, reason: "Confirm the owned debt.", occurredAt: "2026-07-18T23:01:00.000Z", ownerId: "owner-067", rationale: "Confirmed debt.", risk: "Confirmed risk.", architecturalBoundary: "orchestrator-policy", priority: "P1", futureTouchTrigger: { triggerId: "policy-touch", name: "Policy touch", paths: ["apps/orchestrator/src/debt.ts"], symbols: [], ruleTags: ["architecture-debt"] } } });
    expect(triage).toMatchObject({ kind: "committed", aggregate: { state: "CONFIRMED", eventVersion: 1, priority: "P1" } });
    const partial = { ...decision("NON_INTERACTION", aggregate.recordId, validated.touchPlanHash), recordVersion: 1, selectorIds: [selectors()[0]!] };
    expect(recordFutureTouchDecision({ touchPlan: plan(), decision: partial, authority, store })).toMatchObject({ kind: "refusal", code: "policy_refusal" });
    expect(recordFutureTouchDecision({ touchPlan: plan(), decision: { ...decision("NON_INTERACTION", aggregate.recordId, validated.touchPlanHash), recordVersion: 1, projectId: "foreign" }, authority, store })).toMatchObject({ kind: "refusal", code: "invalid_input" });
    expect(evaluateFeatureDebtReadiness({ featureFolderPath: featureFolder, projectId: "hepha", featureId: "feat-099", authority, store, prerequisiteStates: [], clockNow: "2026-07-18T23:10:00.000Z" })).toMatchObject({ kind: "blocked", code: "readiness_blocked" });
    store.close();
  });

  it("validates every decision kind through the public persistence boundary and enforces remediate/prerequisite constraints", () => {
    for (const kind of ["REMEDIATE", "PREREQUISITE", "WAIVER", "NON_INTERACTION"] as const) {
      const { store, aggregate, validated, featureFolder } = fixture();
      expect(recordFutureTouchDecision({ touchPlan: plan(), decision: decision(kind, aggregate.recordId, validated.touchPlanHash), authority, store })).toEqual({ kind: "committed" });
      const prerequisiteStates = kind === "PREREQUISITE" ? [{ featureId: "feat-098", state: "COMPLETED" }] : [];
      expect(evaluateFeatureDebtReadiness({ featureFolderPath: featureFolder, projectId: "hepha", featureId: "feat-099", authority, store, prerequisiteStates, clockNow: "2026-07-18T23:10:00.000Z" }).kind).toBe("ready");
      store.close();
    }
  });

  it("returns invalid_input for malformed or duplicate prerequisite state collections", () => {
    const { store, featureFolder } = fixture();
    const input = { featureFolderPath: featureFolder, projectId: "hepha", featureId: "feat-099", authority, store, clockNow: "2026-07-18T23:10:00.000Z" };
    expect(evaluateFeatureDebtReadiness({ ...input, prerequisiteStates: [{ featureId: "feat-098", state: "COMPLETED" }, { featureId: "feat-098", state: "COMPLETED" }] })).toMatchObject({ kind: "blocked", code: "invalid_input" });
    expect(evaluateFeatureDebtReadiness({ ...input, prerequisiteStates: [{ featureId: "feat-098", state: "UNKNOWN" }] })).toMatchObject({ kind: "blocked", code: "invalid_input" });
    store.close();
  });

  it("distinguishes an absent touch plan from malformed persisted JSON", () => {
    const { store, featureFolder } = fixture();
    expect(evaluateFeatureDebtReadiness({ featureFolderPath: join(featureFolder, "missing"), projectId: "hepha", featureId: "feat-099", authority, store, prerequisiteStates: [], clockNow: "2026-07-18T23:10:00.000Z" })).toMatchObject({ kind: "blocked", code: "touch_plan_missing" });
    writeFileSync(join(featureFolder, "ArchitectureDebtTouchPlan.json"), "{ malformed");
    expect(evaluateFeatureDebtReadiness({ featureFolderPath: featureFolder, projectId: "hepha", featureId: "feat-099", authority, store, prerequisiteStates: [], clockNow: "2026-07-18T23:10:00.000Z" })).toMatchObject({ kind: "blocked", code: "touch_plan_invalid" });
    store.close();
  });

  it("fails closed when a valid-plan read reaches a closed store or corrupt aggregate", () => {
    const { store, featureFolder } = fixture();
    store.close();
    expect(evaluateFeatureDebtReadiness({ featureFolderPath: featureFolder, projectId: "hepha", featureId: "feat-099", authority, store, prerequisiteStates: [], clockNow: "2026-07-18T23:10:00.000Z" })).toMatchObject({ kind: "blocked", code: "store_unavailable" });
    const corrupt = fixture();
    const database = new DatabaseSync(corrupt.databasePath);
    try {
      database.exec("drop trigger trg_hepha_architecture_debt_no_update;");
      database.prepare("update hepha_architecture_debt set rule_json='{}' where record_id=?").run(corrupt.aggregate.recordId);
    } finally { database.close(); }
    expect(evaluateFeatureDebtReadiness({ featureFolderPath: corrupt.featureFolder, projectId: "hepha", featureId: "feat-099", authority, store: corrupt.store, prerequisiteStates: [], clockNow: "2026-07-18T23:10:00.000Z" })).toMatchObject({ kind: "blocked", code: "store_unavailable" });
    corrupt.store.close();
  });

  it("maps a parseable but incomplete persisted V1 decision row to store_unavailable with no ready context", () => {
    const { store, aggregate, validated, featureFolder, databasePath } = fixture();
    const database = new DatabaseSync(databasePath);
    try {
      database.prepare("insert into hepha_architecture_debt_touch_plans(touch_plan_hash,project_id,feature_id,payload_json) values (?,?,?,?)").run(validated.touchPlanHash, "hepha", "feat-099", JSON.stringify(plan()));
      const incompleteDecision = {
        decisionId: "incomplete-decision", projectId: "hepha", featureId: "feat-099", touchPlanHash: validated.touchPlanHash,
        recordId: aggregate.recordId, recordVersion: 0, selectorIds: selectors(),
      };
      database.prepare("insert into hepha_architecture_debt_touch_decisions(decision_id,record_id,payload_json) values (?,?,?)").run(incompleteDecision.decisionId, aggregate.recordId, JSON.stringify(incompleteDecision));
    } finally { database.close(); }
    expect(evaluateFeatureDebtReadiness({ featureFolderPath: featureFolder, projectId: "hepha", featureId: "feat-099", authority, store, prerequisiteStates: [], clockNow: "2026-07-18T23:10:00.000Z" })).toEqual({ kind: "blocked", code: "store_unavailable", message: "Architecture-debt storage is unavailable." });
    store.close();
  });

  it("wires the real post-refinement host to the mandatory V1 gate before confirmation", () => {
    const source = readFileSync(new URL("../src/application/features/refined-feature-readiness-application.ts", import.meta.url), "utf8");
    const confirmation = source.slice(source.indexOf("async confirm"), source.indexOf("async assertArchitectureDebtReady"));
    expect(source).toContain("await this.dependencies.scanProject(project)");
    expect(source).toContain("resolveArchitectureDebtPrerequisiteStates");
    expect(source).not.toContain("existsSync(resolve(feature.folderPath");
    expect(confirmation.indexOf("await this.assertArchitectureDebtReady(input.feature, input.project)")).toBeLessThan(confirmation.indexOf("confirmReadinessSource"));
  });

  it("derives canonical current prerequisite state from the real host scanner shape", () => {
    const completed = { kind: "feature", externalId: "FEAT-098", stateFolder: "04_COMPLETED" } as WorkItemCard;
    const submitted = { kind: "feature", externalId: "FEAT-097", stateFolder: "01_SUBMITTED" } as WorkItemCard;
    expect(resolveArchitectureDebtPrerequisiteStates([completed, submitted])).toEqual([
      { featureId: "feat-097", state: "SUBMITTED" },
      { featureId: "feat-098", state: "COMPLETED" },
    ]);
    expect(() => resolveArchitectureDebtPrerequisiteStates([completed, { ...completed }])).toThrow(/ambiguous/);
  });

  it("rejects malformed plans and never creates an approved context from a raw aggregate", () => {
    const { store, aggregate, validated, featureFolder } = fixture();
    expect(validateArchitectureDebtTouchPlan({ ...plan(), paths: ["apps/z.ts", "apps/a.ts"] })).toMatchObject({ kind: "refusal", code: "touch_plan_invalid" });
    expect(evaluateFeatureDebtReadiness({ featureFolderPath: join(featureFolder, "missing"), projectId: "hepha", featureId: "feat-099", authority, store, prerequisiteStates: [], clockNow: "2026-07-18T23:10:00.000Z" })).toMatchObject({ kind: "blocked", code: "touch_plan_missing" });
    const projection = projectArchitectureDebtRegister({ records: [aggregate] });
    expect(buildArchitectureDebtContext({ projection, featureId: "feat-099", touchPlanHash: validated.touchPlanHash, matches: [{ recordId: aggregate.recordId, recordVersion: 0, selectorIds: selectors(), decision: decision("NON_INTERACTION", aggregate.recordId, validated.touchPlanHash) }] })).not.toBeNull();
    expect(buildArchitectureDebtContext({ projection: { kind: "projected", records: [aggregate] }, featureId: "feat-099", touchPlanHash: validated.touchPlanHash, matches: [] })).toBeNull();
    store.close();
  });
});
