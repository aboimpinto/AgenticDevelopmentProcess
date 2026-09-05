// Behavior suite: architecture debt.
import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  ArchitectureDebtSqliteStore,
  createArchitectureDebtRecordId,
  type ArchitectureDebtLocation,
} from "../src/architecture-debt-store.js";

const hash = (character: string) => character.repeat(64);
const locations: readonly ArchitectureDebtLocation[] = [{
  locationId: "location-1", relativePath: "apps/orchestrator/src/debt.ts", symbol: "ingestDebt", ruleTags: ["architecture-governance"],
}];
function createOperation() {
  const rule = { ruleId: "architecture-governance", ruleVersion: "1", ruleHash: hash("a"), catalogHash: hash("b"), category: "architecture", sourceReference: ".hepha/architecture-rules.yaml#architecture-governance" } as const;
  const projectId = "hepha";
  return {
    kind: "CREATE_PENDING" as const, expectedVersion: 0 as const,
    recordId: createArchitectureDebtRecordId({ projectId, rule, architecturalBoundary: "rule-scope:orchestrator", locations }), projectId,
    ownerId: "paulo", rationale: "Historical boundary needs triage.", risk: "Deferred architecture governance risk.", architecturalBoundary: "rule-scope:orchestrator",
    priority: "P2" as const, prioritySource: "AUTO_PENDING_DEFAULT" as const,
    futureTouchTrigger: { triggerId: "touch-observed-surface", name: "Touch observed surface", paths: ["apps/orchestrator/src/debt.ts"], symbols: ["ingestDebt"], ruleTags: ["architecture-governance"] },
    discovery: {
      featureId: "feat-065", phaseNumber: 3, reviewGateId: "code-review", findingId: "finding-debt",
      manifest: { artifactKind: "review_manifest" as const, artifactId: "manifest-1", contentHash: hash("c"), relativePath: "MemoryBank/manifest.json" },
      observation: { artifactKind: "debt_observation" as const, artifactId: "observation-1", contentHash: hash("d"), relativePath: "MemoryBank/observation.json" },
      currentFeatureImpact: "untouched_non_blocking" as const,
    }, rule, locations, createdAt: "2026-07-18T15:00:00.000Z",
  };
}
function query(store: ArchitectureDebtSqliteStore, input: Parameters<ArchitectureDebtSqliteStore["queryOpenArchitectureDebt"]>[0]) {
  const result = store.queryOpenArchitectureDebt(input);
  if (result.kind !== "success") throw new Error(`Expected healthy query, received ${result.code}`);
  return result.values;
}
function withStore(test: (store: ArchitectureDebtSqliteStore, databasePath: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "feat-067-debt-store-"));
  const databasePath = join(directory, "hepha.sqlite");
  const store = new ArchitectureDebtSqliteStore(databasePath);
  try { test(store, databasePath); } finally { try { store.close(); } catch { /* restart test already closed it */ } rmSync(directory, { recursive: true, force: true }); }
}

describe("E013-AD-001: ArchitectureDebtSqliteStore", () => {
  it("commits a deterministic pending aggregate, links exact new evidence, and reconstructs it after restart", () => withStore((store, databasePath) => {
    const created = store.commitArchitectureDebtOperation(createOperation());
    expect(created).toMatchObject({ kind: "committed", aggregate: { schemaVersion: 1, state: "PENDING_TRIAGE", eventVersion: 0, priority: "P2", prioritySource: "AUTO_PENDING_DEFAULT" } });
    if (created.kind !== "committed") throw new Error("create must commit");
    const linked = store.commitArchitectureDebtOperation({ kind: "LINK_OBSERVATION", projectId: "hepha", recordId: created.aggregate.recordId, expectedVersion: 0, observation: { artifactKind: "debt_observation", artifactId: "observation-2", contentHash: hash("e"), relativePath: "MemoryBank/observation-2.json" }, linkedAt: "2026-07-18T15:01:00.000Z" });
    expect(linked).toMatchObject({ kind: "committed", aggregate: { eventVersion: 1, observationReferences: [{ artifactId: "observation-1" }, { artifactId: "observation-2" }] } });
    store.close();
    const restarted = new ArchitectureDebtSqliteStore(databasePath);
    try {
      expect(restarted.getArchitectureDebtAggregate({ projectId: "hepha", recordId: created.aggregate.recordId })).toEqual((linked as Extract<typeof linked, { kind: "committed" }>).aggregate);
      expect(query(restarted, { projectId: "hepha", paths: ["apps/orchestrator/src"], symbols: [], ruleTags: [] })).toHaveLength(1);
    } finally { restarted.close(); }
  }));

  it("refuses malformed input, stale links, duplicate evidence, and ambiguous caller input without writes", () => withStore((store) => {
    expect(store.commitArchitectureDebtOperation(null)).toMatchObject({ kind: "refusal", code: "invalid_input" });
    const created = store.commitArchitectureDebtOperation(createOperation());
    if (created.kind !== "committed") throw new Error("create must commit");
    const duplicate = store.commitArchitectureDebtOperation({ kind: "LINK_OBSERVATION", projectId: "hepha", recordId: created.aggregate.recordId, expectedVersion: 0, observation: created.aggregate.observationReferences[0], linkedAt: "2026-07-18T15:01:00.000Z" });
    expect(duplicate).toEqual({ kind: "committed", aggregate: created.aggregate });
    expect(store.commitArchitectureDebtOperation({ kind: "LINK_OBSERVATION", projectId: "hepha", recordId: created.aggregate.recordId, expectedVersion: 4, observation: { artifactKind: "debt_observation", artifactId: "observation-2", contentHash: hash("e"), relativePath: "MemoryBank/observation-2.json" }, linkedAt: "2026-07-18T15:01:00.000Z" })).toMatchObject({ kind: "refusal", code: "stale_version" });
    expect(store.getArchitectureDebtAggregate({ projectId: "hepha", recordId: created.aggregate.recordId })).toEqual(created.aggregate);
  }));

  it("uses database append-only triggers and rolls back a failed transaction", () => withStore((store, databasePath) => {
    const created = store.commitArchitectureDebtOperation(createOperation());
    if (created.kind !== "committed") throw new Error("create must commit");
    const database = new DatabaseSync(databasePath);
    try {
      expect(() => database.prepare("update hepha_architecture_debt set owner_id='other' where record_id=?").run(created.aggregate.recordId)).toThrow(/append-only/);
      database.exec("create trigger fail_arch_debt_link before insert on hepha_architecture_debt_observations when new.content_hash = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' begin select raise(abort, 'injected'); end;");
    } finally { database.close(); }
    expect(store.commitArchitectureDebtOperation({ kind: "LINK_OBSERVATION", projectId: "hepha", recordId: created.aggregate.recordId, expectedVersion: 0, observation: { artifactKind: "debt_observation", artifactId: "observation-2", contentHash: hash("e"), relativePath: "MemoryBank/observation-2.json" }, linkedAt: "2026-07-18T15:01:00.000Z" })).toMatchObject({ kind: "refusal", code: "persistence_failed" });
    expect(store.getArchitectureDebtAggregate({ projectId: "hepha", recordId: created.aggregate.recordId })).toEqual(created.aggregate);
  }));

  it("concurrent-stale-link-refusal and transaction-refusal-closes-lock use the locked aggregate version", () => withStore((store, databasePath) => {
    const created = store.commitArchitectureDebtOperation(createOperation());
    if (created.kind !== "committed") throw new Error("create must commit");
    expect(store.commitArchitectureDebtOperation({ kind: "LINK_OBSERVATION", projectId: "hepha", recordId: created.aggregate.recordId, expectedVersion: 0, observation: { artifactKind: "debt_observation", artifactId: "observation-winner", contentHash: hash("f"), relativePath: "MemoryBank/observation-winner.json" }, linkedAt: "2026-07-18T15:01:00.000Z" })).toMatchObject({ kind: "committed", aggregate: { eventVersion: 1 } });
    const second = new ArchitectureDebtSqliteStore(databasePath);
    try {
      expect(second.commitArchitectureDebtOperation({ kind: "LINK_OBSERVATION", projectId: "hepha", recordId: created.aggregate.recordId, expectedVersion: 0, observation: { artifactKind: "debt_observation", artifactId: "observation-loser", contentHash: hash("a"), relativePath: "MemoryBank/observation-loser.json" }, linkedAt: "2026-07-18T15:02:00.000Z" })).toMatchObject({ kind: "refusal", code: "stale_version" });
      expect(second.commitArchitectureDebtOperation({ kind: "LINK_OBSERVATION", projectId: "hepha", recordId: created.aggregate.recordId, expectedVersion: 1, observation: { artifactKind: "debt_observation", artifactId: "observation-next", contentHash: hash("b"), relativePath: "MemoryBank/observation-next.json" }, linkedAt: "2026-07-18T15:03:00.000Z" })).toMatchObject({ kind: "committed", aggregate: { eventVersion: 2 } });
      expect(second.commitArchitectureDebtOperation(createOperation())).toMatchObject({ kind: "refusal", code: "invalid_input" });
    } finally { second.close(); }
  }));

  it("restart-event-sequence-rejections, restart-root-identity-rejections, and store-invalid-create-zero-write fail closed", () => withStore((store, databasePath) => {
    const created = store.commitArchitectureDebtOperation(createOperation());
    if (created.kind !== "committed") throw new Error("create must commit");
    const database = new DatabaseSync(databasePath);
    try {
      database.exec("drop trigger trg_hepha_architecture_debt_events_no_update; drop trigger trg_hepha_architecture_debt_no_update;");
      database.prepare("update hepha_architecture_debt_events set occurred_at='not-a-timestamp' where record_id=? and event_version=0").run(created.aggregate.recordId);
      expect(store.getArchitectureDebtAggregate({ projectId: "hepha", recordId: created.aggregate.recordId })).toBeNull();
      expect(store.queryOpenArchitectureDebt({ projectId: "hepha", paths: [], symbols: [], ruleTags: [] })).toMatchObject({ kind: "refusal", code: "persistence_failed" });
      const before = database.prepare("select count(*) as count from hepha_architecture_debt").get() as { count: number };
      expect(store.commitArchitectureDebtOperation({ ...createOperation(), risk: "token=unsafe-value" })).toMatchObject({ kind: "refusal", code: "invalid_input" });
      expect(store.commitArchitectureDebtOperation({ ...createOperation(), locations: [{ ...locations[0], relativePath: "../unsafe.ts" }] })).toMatchObject({ kind: "refusal", code: "invalid_input" });
      const after = database.prepare("select count(*) as count from hepha_architecture_debt").get() as { count: number };
      expect(after.count).toBe(before.count);
    } finally { database.close(); }
  }));

  it("restart-nested-and-reference-rejections omit malformed nested rows and cardinality drift", () => withStore((store, databasePath) => {
    const created = store.commitArchitectureDebtOperation(createOperation());
    if (created.kind !== "committed") throw new Error("create must commit");
    const database = new DatabaseSync(databasePath);
    try {
      database.exec("drop trigger trg_hepha_architecture_debt_no_update;");
      database.prepare("update hepha_architecture_debt set rule_json='{}' where record_id=?").run(created.aggregate.recordId);
      expect(store.getArchitectureDebtAggregate({ projectId: "hepha", recordId: created.aggregate.recordId })).toBeNull();
      expect(store.queryOpenArchitectureDebt({ projectId: "hepha", paths: [], symbols: [], ruleTags: [] })).toMatchObject({ kind: "refusal", code: "persistence_failed" });
    } finally { database.close(); }
  }));

  it("restart-event-reference-cardinality rejection never returns a partial aggregate", () => withStore((store, databasePath) => {
    const created = store.commitArchitectureDebtOperation(createOperation());
    if (created.kind !== "committed") throw new Error("create must commit");
    const database = new DatabaseSync(databasePath);
    try {
      database.prepare("insert into hepha_architecture_debt_observations(record_id,content_hash,artifact_id,relative_path,linked_at) values (?,?,?,?,?)").run(created.aggregate.recordId, hash("f"), "observation-extra", "MemoryBank/observation-extra.json", "2026-07-18T15:02:00.000Z");
      expect(store.getArchitectureDebtAggregate({ projectId: "hepha", recordId: created.aggregate.recordId })).toBeNull();
      expect(store.queryOpenArchitectureDebt({ projectId: "hepha", paths: [], symbols: [], ruleTags: [] })).toMatchObject({ kind: "refusal", code: "persistence_failed" });
    } finally { database.close(); }
  }));

  it("isolates foreign decision corruption before payload parsing and refuses selected-project corruption", () => withStore((store, databasePath) => {
    const a = store.commitArchitectureDebtOperation(createOperation());
    if (a.kind !== "committed") throw new Error("project A must commit");
    const source = createOperation();
    const bOperation = { ...source, projectId: "project-b", recordId: createArchitectureDebtRecordId({ projectId: "project-b", rule: source.rule, architecturalBoundary: source.architecturalBoundary, locations }) };
    const b = store.commitArchitectureDebtOperation(bOperation);
    if (b.kind !== "committed") throw new Error("project B must commit");
    const validA = { decisionId: "decision-a", projectId: "hepha", featureId: "feat-068", touchPlanHash: hash("a"), recordId: a.aggregate.recordId, recordVersion: 0, selectorIds: ["selector-a"], kind: "REMEDIATE", actorId: "steward-068", authorizedRole: "ARCHITECTURE_STEWARD", reason: "Remediate the selected record.", occurredAt: "2026-07-20T06:34:23.140Z", owningPhaseTask: "phase-2", acceptanceObligation: "Public route evidence." };
    const database = new DatabaseSync(databasePath);
    try {
      const validB = { ...validA, decisionId: "decision-b", projectId: "project-b", recordId: b.aggregate.recordId, touchPlanHash: hash("b"), selectorIds: ["selector-b"] };
      database.prepare("insert into hepha_architecture_debt_touch_decisions(decision_id,record_id,payload_json) values (?,?,?)").run(validA.decisionId, a.aggregate.recordId, JSON.stringify(validA));
      database.prepare("insert into hepha_architecture_debt_touch_decisions(decision_id,record_id,payload_json) values (?,?,?)").run(validB.decisionId, b.aggregate.recordId, JSON.stringify(validB));
      expect(store.listFutureTouchDecisionsByProject("hepha")).toEqual({ kind: "success", values: [validA] });
      expect(store.listFutureTouchDecisionsByProject("project-b")).toEqual({ kind: "success", values: [validB] });
      expect(store.listFutureTouchDecisionsByProject("project-empty")).toEqual({ kind: "success", values: [] });
      // A corrupt B row must remain invisible to A: it is selected by the
      // authoritative record-to-project join before its contradictory payload
      // is parsed. B itself fails closed.
      database.prepare("insert into hepha_architecture_debt_touch_decisions(decision_id,record_id,payload_json) values (?,?,?)").run("decision-b-project-mismatch", b.aggregate.recordId, JSON.stringify({ ...validB, decisionId: "decision-b-project-mismatch", projectId: "hepha" }));
      expect(store.listFutureTouchDecisionsByProject("hepha")).toEqual({ kind: "success", values: [validA] });
      expect(store.listFutureTouchDecisionsByProject("project-b")).toMatchObject({ kind: "refusal", code: "persistence_failed" });
      // The selected A payload cannot disagree about its authoritative record.
      database.prepare("insert into hepha_architecture_debt_touch_decisions(decision_id,record_id,payload_json) values (?,?,?)").run("decision-a-record-mismatch", a.aggregate.recordId, JSON.stringify({ ...validA, decisionId: "decision-a-record-mismatch", recordId: b.aggregate.recordId }));
      expect(store.listFutureTouchDecisionsByProject("hepha")).toMatchObject({ kind: "refusal", code: "persistence_failed" });
    } finally { database.close(); }
  }));

  it("distinguishes healthy empty reads from invalid input and incomplete persisted V1 decision rows", () => withStore((store, databasePath) => {
    expect(store.queryOpenArchitectureDebt({ projectId: "hepha", paths: [], symbols: [], ruleTags: [] })).toEqual({ kind: "success", values: [] });
    expect(store.queryOpenArchitectureDebt({ projectId: "hepha", paths: "invalid", symbols: [], ruleTags: [] })).toEqual({ kind: "refusal", code: "invalid_input" });
    const created = store.commitArchitectureDebtOperation(createOperation());
    if (created.kind !== "committed") throw new Error("create must commit");
    const database = new DatabaseSync(databasePath);
    try {
      database.prepare("insert into hepha_architecture_debt_touch_plans(touch_plan_hash,project_id,feature_id,payload_json) values (?,?,?,?)").run(hash("f"), "hepha", "feat-099", "{}");
      const incompleteDecision = {
        decisionId: "malformed-decision", projectId: "hepha", featureId: "feat-099", touchPlanHash: hash("f"),
        recordId: created.aggregate.recordId, recordVersion: 0, selectorIds: ["location:location-1:path"],
      };
      database.prepare("insert into hepha_architecture_debt_touch_decisions(decision_id,record_id,payload_json) values (?,?,?)").run(incompleteDecision.decisionId, created.aggregate.recordId, JSON.stringify(incompleteDecision));
      expect(store.getFutureTouchDecisions({ projectId: "hepha", featureId: "feat-099", touchPlanHash: hash("f") })).toEqual({ kind: "refusal", code: "persistence_failed" });
    } finally { database.close(); }
  }));
});
