/**
 * FEAT-067 V1 authoritative architecture-debt persistence.
 *
 * Compatibility Decision: BREAKING CHANGE PERMITTED. Structured SQLite rows
 * are authoritative; Markdown and in-memory policy outcomes are not.
 */
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA_VERSION = 2;
const HASH_RE = /^[a-f0-9]{64}$/;
const RECORD_ID_RE = /^ARCH-DEBT-[a-f0-9]{32}$/;
const UTC_RE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
const OPEN_STATES = new Set<ArchitectureDebtState>(["PENDING_TRIAGE", "CONFIRMED", "DEFERRED", "ACCEPTED_RISK", "PLANNED"]);
const STATES = new Set<ArchitectureDebtState>([...OPEN_STATES, "CLOSED", "REJECTED", "MERGED", "SUPERSEDED"]);
const PRIORITIES = new Set<ArchitectureDebtPriority>(["P0", "P1", "P2", "P3"]);
const SECRET_LIKE = [/(?:api[_-]?key|authorization|bearer|password|secret|token)\s*[:=]\s*\S+/i, /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/, /sk-[A-Za-z0-9_-]{12,}/];

export type ArchitectureDebtState = "PENDING_TRIAGE" | "CONFIRMED" | "DEFERRED" | "ACCEPTED_RISK" | "PLANNED" | "CLOSED" | "REJECTED" | "MERGED" | "SUPERSEDED";
export type ArchitectureDebtPriority = "P0" | "P1" | "P2" | "P3";
export type ArchitectureDebtStoreRefusalCode = "invalid_input" | "stale_version" | "persistence_failed";
export type ArchitectureDebtReadResult<T> =
  | { readonly kind: "success"; readonly values: readonly T[] }
  | { readonly kind: "refusal"; readonly code: "invalid_input" | "persistence_failed" };

export interface ArchitectureDebtArtifactReference { readonly artifactKind: "debt_observation" | "review_manifest"; readonly artifactId: string; readonly contentHash: string; readonly relativePath: string; }
export interface ArchitectureDebtLocation { readonly locationId: string; readonly relativePath: string; readonly symbol?: string; readonly endpoint?: string; readonly ruleTags: readonly string[]; }
export interface ArchitectureDebtTrigger { readonly triggerId: string; readonly name: string; readonly paths: readonly string[]; readonly symbols: readonly string[]; readonly ruleTags: readonly string[]; }
export interface ArchitectureDebtDiscovery { readonly featureId: string; readonly phaseNumber: number; readonly reviewGateId: string; readonly findingId: string; readonly manifest: ArchitectureDebtArtifactReference; readonly observation: ArchitectureDebtArtifactReference; readonly currentFeatureImpact: "untouched_non_blocking"; }
export interface ArchitectureDebtRule { readonly ruleId: string; readonly ruleVersion: string; readonly ruleHash: string; readonly catalogHash: string; readonly category: string; readonly sourceReference: string; }
export interface ArchitectureDebtAggregateV1 { readonly schemaVersion: 1; readonly recordId: string; readonly projectId: string; readonly eventVersion: number; readonly state: ArchitectureDebtState; readonly ownerId: string; readonly rationale: string; readonly risk: string; readonly architecturalBoundary: string; readonly priority: ArchitectureDebtPriority; readonly prioritySource: "AUTO_PENDING_DEFAULT" | "STEWARD_CONFIRMED"; readonly futureTouchTrigger: ArchitectureDebtTrigger; readonly discovery: ArchitectureDebtDiscovery; readonly rule: ArchitectureDebtRule; readonly locations: readonly ArchitectureDebtLocation[]; readonly observationReferences: readonly ArchitectureDebtArtifactReference[]; readonly duplicateOfRecordId?: string; readonly supersededByRecordId?: string; }
export interface CreatePendingArchitectureDebtOperation { readonly kind: "CREATE_PENDING"; readonly expectedVersion: 0; readonly recordId: string; readonly projectId: string; readonly ownerId: string; readonly rationale: string; readonly risk: string; readonly architecturalBoundary: string; readonly priority: "P2"; readonly prioritySource: "AUTO_PENDING_DEFAULT"; readonly futureTouchTrigger: ArchitectureDebtTrigger; readonly discovery: ArchitectureDebtDiscovery; readonly rule: ArchitectureDebtRule; readonly locations: readonly ArchitectureDebtLocation[]; readonly createdAt: string; }
export interface LinkObservationArchitectureDebtOperation { readonly kind: "LINK_OBSERVATION"; readonly expectedVersion: number; readonly projectId: string; readonly recordId: string; readonly observation: ArchitectureDebtArtifactReference; readonly linkedAt: string; }
export interface ApplyArchitectureDebtTriageOperation { readonly kind: "APPLY_TRIAGE"; readonly expectedVersion: number; readonly projectId: string; readonly recordId: string; readonly event: unknown; readonly nextAggregate: ArchitectureDebtAggregateV1; }
export interface RecordArchitectureDebtTouchDecisionOperation { readonly kind: "RECORD_TOUCH_DECISION"; readonly projectId: string; readonly featureId: string; readonly touchPlanHash: string; readonly touchPlan: unknown; readonly decision: unknown; }
export type ArchitectureDebtOperation = CreatePendingArchitectureDebtOperation | LinkObservationArchitectureDebtOperation | ApplyArchitectureDebtTriageOperation | RecordArchitectureDebtTouchDecisionOperation;
export type ArchitectureDebtCommitResult = { readonly kind: "committed"; readonly aggregate: ArchitectureDebtAggregateV1 } | { readonly kind: "decision_committed" } | { readonly kind: "refusal"; readonly code: ArchitectureDebtStoreRefusalCode; readonly message: string };

type RawRow = Record<string, unknown>;
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
function text(value: unknown, max = 4096): value is string { return typeof value === "string" && value.length > 0 && value.length <= max && !value.includes("\0") && !/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value) && !SECRET_LIKE.some((pattern) => pattern.test(value)); }
function identifier(value: unknown, max = 256): value is string { return text(value, max); }
function utc(value: unknown): value is string { return typeof value === "string" && UTC_RE.test(value) && Number.isFinite(Date.parse(value)); }
function path(value: unknown): value is string { return text(value, 1024) && !value.includes("\\") && !value.startsWith("/") && !/^[A-Za-z]:/.test(value) && !value.split("/").some((part) => !part || part === "." || part === ".."); }
function hash(value: unknown): value is string { return typeof value === "string" && HASH_RE.test(value); }
function sortedUnique(values: readonly string[]): boolean { return values.every((value, index) => index === 0 || values[index - 1] < value); }
function stringList(value: unknown, item: (value: unknown) => value is string = (value): value is string => text(value)): value is readonly string[] { return Array.isArray(value) && value.length <= 128 && value.every(item) && sortedUnique(value as readonly string[]); }
function reference(value: unknown, kinds: readonly string[] = ["debt_observation", "review_manifest"]): value is ArchitectureDebtArtifactReference { return isRecord(value) && exactKeys(value, ["artifactKind", "artifactId", "contentHash", "relativePath"]) && typeof value.artifactKind === "string" && kinds.includes(value.artifactKind) && identifier(value.artifactId) && hash(value.contentHash) && path(value.relativePath); }
function location(value: unknown): value is ArchitectureDebtLocation { return isRecord(value) && exactKeys(value, ["locationId", "relativePath", "symbol", "endpoint", "ruleTags"].filter((key) => value[key] !== undefined)) && identifier(value.locationId) && path(value.relativePath) && (value.symbol === undefined || identifier(value.symbol)) && (value.endpoint === undefined || identifier(value.endpoint)) && stringList(value.ruleTags); }
function trigger(value: unknown): value is ArchitectureDebtTrigger { return isRecord(value) && exactKeys(value, ["triggerId", "name", "paths", "symbols", "ruleTags"]) && identifier(value.triggerId) && text(value.name) && stringList(value.paths, path) && stringList(value.symbols) && stringList(value.ruleTags) && value.paths.length + value.symbols.length + value.ruleTags.length > 0; }
function discovery(value: unknown): value is ArchitectureDebtDiscovery { return isRecord(value) && exactKeys(value, ["featureId", "phaseNumber", "reviewGateId", "findingId", "manifest", "observation", "currentFeatureImpact"]) && identifier(value.featureId) && Number.isInteger(value.phaseNumber) && (value.phaseNumber as number) >= 0 && identifier(value.reviewGateId) && identifier(value.findingId) && reference(value.manifest, ["review_manifest"]) && reference(value.observation, ["debt_observation"]) && value.currentFeatureImpact === "untouched_non_blocking"; }
function rule(value: unknown): value is ArchitectureDebtRule { return isRecord(value) && exactKeys(value, ["ruleId", "ruleVersion", "ruleHash", "catalogHash", "category", "sourceReference"]) && identifier(value.ruleId) && identifier(value.ruleVersion) && hash(value.ruleHash) && hash(value.catalogHash) && identifier(value.category, 128) && path(value.sourceReference); }
function sameReference(left: ArchitectureDebtArtifactReference, right: ArchitectureDebtArtifactReference): boolean { return left.artifactKind === right.artifactKind && left.artifactId === right.artifactId && left.contentHash === right.contentHash && left.relativePath === right.relativePath; }
function validAggregate(value: unknown): value is ArchitectureDebtAggregateV1 {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "recordId", "projectId", "eventVersion", "state", "ownerId", "rationale", "risk", "architecturalBoundary", "priority", "prioritySource", "futureTouchTrigger", "discovery", "rule", "locations", "observationReferences", "duplicateOfRecordId", "supersededByRecordId"].filter((key) => value[key] !== undefined))) return false;
  return value.schemaVersion === 1 && typeof value.recordId === "string" && RECORD_ID_RE.test(value.recordId) && identifier(value.projectId) && Number.isInteger(value.eventVersion) && (value.eventVersion as number) >= 0 && typeof value.state === "string" && STATES.has(value.state as ArchitectureDebtState) && identifier(value.ownerId) && text(value.rationale) && text(value.risk) && identifier(value.architecturalBoundary) && typeof value.priority === "string" && PRIORITIES.has(value.priority as ArchitectureDebtPriority) && (value.prioritySource === "AUTO_PENDING_DEFAULT" || value.prioritySource === "STEWARD_CONFIRMED") && trigger(value.futureTouchTrigger) && discovery(value.discovery) && rule(value.rule) && Array.isArray(value.locations) && value.locations.length > 0 && value.locations.length <= 128 && value.locations.every(location) && new Set(value.locations.map((entry) => entry.locationId)).size === value.locations.length && Array.isArray(value.observationReferences) && value.observationReferences.length > 0 && value.observationReferences.length <= 128 && value.observationReferences.every((entry) => reference(entry, ["debt_observation"])) && (value.duplicateOfRecordId === undefined || (typeof value.duplicateOfRecordId === "string" && RECORD_ID_RE.test(value.duplicateOfRecordId))) && (value.supersededByRecordId === undefined || (typeof value.supersededByRecordId === "string" && RECORD_ID_RE.test(value.supersededByRecordId)));
}
function canonicalLocationTuples(locations: readonly ArchitectureDebtLocation[]): string[] { return locations.map((entry) => `${entry.relativePath}\0${entry.symbol ?? ""}`).sort(); }
export function createArchitectureDebtRecordId(input: { projectId: string; rule: Pick<ArchitectureDebtRule, "ruleId" | "ruleVersion" | "ruleHash">; architecturalBoundary: string; locations: readonly ArchitectureDebtLocation[] }): string { return `ARCH-DEBT-${createHash("sha256").update(JSON.stringify({ projectId: input.projectId, ruleId: input.rule.ruleId, ruleVersion: input.rule.ruleVersion, ruleHash: input.rule.ruleHash, architecturalBoundary: input.architecturalBoundary, locations: canonicalLocationTuples(input.locations) }), "utf8").digest("hex").slice(0, 32)}`; }
function validCreate(value: unknown): value is CreatePendingArchitectureDebtOperation { return isRecord(value) && exactKeys(value, ["kind", "expectedVersion", "recordId", "projectId", "ownerId", "rationale", "risk", "architecturalBoundary", "priority", "prioritySource", "futureTouchTrigger", "discovery", "rule", "locations", "createdAt"]) && value.kind === "CREATE_PENDING" && value.expectedVersion === 0 && typeof value.recordId === "string" && RECORD_ID_RE.test(value.recordId) && identifier(value.projectId) && identifier(value.ownerId) && text(value.rationale) && text(value.risk) && identifier(value.architecturalBoundary) && value.priority === "P2" && value.prioritySource === "AUTO_PENDING_DEFAULT" && trigger(value.futureTouchTrigger) && discovery(value.discovery) && rule(value.rule) && Array.isArray(value.locations) && value.locations.length > 0 && value.locations.every(location) && new Set(value.locations.map((entry) => entry.locationId)).size === value.locations.length && new Set(canonicalLocationTuples(value.locations)).size === value.locations.length && utc(value.createdAt) && value.recordId === createArchitectureDebtRecordId({ projectId: value.projectId, rule: value.rule, architecturalBoundary: value.architecturalBoundary, locations: value.locations }); }
function validLink(value: unknown): value is LinkObservationArchitectureDebtOperation { return isRecord(value) && exactKeys(value, ["kind", "expectedVersion", "projectId", "recordId", "observation", "linkedAt"]) && value.kind === "LINK_OBSERVATION" && Number.isInteger(value.expectedVersion) && (value.expectedVersion as number) >= 0 && identifier(value.projectId) && typeof value.recordId === "string" && RECORD_ID_RE.test(value.recordId) && reference(value.observation, ["debt_observation"]) && utc(value.linkedAt); }
function validTriage(value: unknown): value is ApplyArchitectureDebtTriageOperation { return isRecord(value) && exactKeys(value, ["kind", "expectedVersion", "projectId", "recordId", "event", "nextAggregate"]) && value.kind === "APPLY_TRIAGE" && Number.isInteger(value.expectedVersion) && (value.expectedVersion as number) >= 0 && identifier(value.projectId) && typeof value.recordId === "string" && RECORD_ID_RE.test(value.recordId) && isRecord(value.event) && validAggregate(value.nextAggregate); }
function validDecisionOperation(value: unknown): value is RecordArchitectureDebtTouchDecisionOperation {
  return isRecord(value) && exactKeys(value, ["kind", "projectId", "featureId", "touchPlanHash", "touchPlan", "decision"])
    && value.kind === "RECORD_TOUCH_DECISION" && identifier(value.projectId) && identifier(value.featureId)
    && hash(value.touchPlanHash) && isRecord(value.touchPlan) && validPersistedFutureTouchDecision(value.decision);
}
/** Validates the complete persisted V1 decision envelope before it crosses a storage read boundary. */
function validPersistedFutureTouchDecision(value: unknown): value is Record<string, unknown> {
  const commonKeys = ["decisionId", "projectId", "featureId", "touchPlanHash", "recordId", "recordVersion", "selectorIds", "kind", "actorId", "authorizedRole", "reason", "occurredAt"];
  if (!isRecord(value) || !identifier(value.decisionId) || !identifier(value.projectId) || !identifier(value.featureId)
    || !hash(value.touchPlanHash) || typeof value.recordId !== "string" || !RECORD_ID_RE.test(value.recordId)
    || !Number.isInteger(value.recordVersion) || (value.recordVersion as number) < 0
    || !stringList(value.selectorIds) || value.selectorIds.length === 0 || !identifier(value.actorId)
    || value.authorizedRole !== "ARCHITECTURE_STEWARD" || !text(value.reason) || !utc(value.occurredAt)) return false;
  if (value.kind === "REMEDIATE") return exactKeys(value, [...commonKeys, "owningPhaseTask", "acceptanceObligation"])
    && identifier(value.owningPhaseTask) && text(value.acceptanceObligation);
  if (value.kind === "PREREQUISITE") return exactKeys(value, [...commonKeys, "prerequisiteFeatureId", "orderingEvidence", "completionCondition"])
    && identifier(value.prerequisiteFeatureId) && text(value.orderingEvidence) && text(value.completionCondition);
  if (value.kind === "WAIVER") return exactKeys(value, [...commonKeys, ...["waiverExpiry", "reconsiderationTrigger"].filter((key) => value[key] !== undefined)])
    && (value.waiverExpiry === undefined || utc(value.waiverExpiry))
    && (value.reconsiderationTrigger === undefined || identifier(value.reconsiderationTrigger))
    && (value.waiverExpiry !== undefined || value.reconsiderationTrigger !== undefined);
  return value.kind === "NON_INTERACTION" && exactKeys(value, [...commonKeys, "inspectedBoundary", "explanation"])
    && identifier(value.inspectedBoundary) && text(value.explanation);
}
function refusal(code: ArchitectureDebtStoreRefusalCode): Extract<ArchitectureDebtCommitResult, { kind: "refusal" }> { return { kind: "refusal", code, message: code === "stale_version" ? "Architecture-debt record version is stale." : code === "persistence_failed" ? "Architecture-debt storage could not persist the operation." : "Architecture-debt input is invalid." }; }
function parseJson(value: unknown): unknown | null { if (typeof value !== "string") return null; try { return JSON.parse(value) as unknown; } catch { return null; } }

const BASE_SCHEMA = `
create table if not exists hepha_architecture_debt_schema_migrations (version integer primary key, applied_at text not null);
create table if not exists hepha_architecture_debt (record_id text primary key, project_id text not null, owner_id text not null, rationale text not null, risk text not null, architectural_boundary text not null, priority text not null, priority_source text not null, trigger_json text not null, discovery_json text not null, rule_json text not null, created_at text not null, unique(project_id, record_id));
create table if not exists hepha_architecture_debt_locations (record_id text not null references hepha_architecture_debt(record_id), location_id text not null, relative_path text not null, symbol text, endpoint text, rule_tags_json text not null, primary key(record_id, location_id), unique(record_id, relative_path, symbol));
create table if not exists hepha_architecture_debt_observations (record_id text not null references hepha_architecture_debt(record_id), content_hash text not null, artifact_id text not null, relative_path text not null, linked_at text not null, primary key(record_id, content_hash), unique(record_id, artifact_id, relative_path));
create table if not exists hepha_architecture_debt_events (record_id text not null references hepha_architecture_debt(record_id), event_version integer not null check(event_version >= 0), event_kind text not null, state text not null, occurred_at text not null, payload_json text, primary key(record_id,event_version));
create table if not exists hepha_architecture_debt_touch_plans (touch_plan_hash text primary key, project_id text not null, feature_id text not null, payload_json text not null);
create table if not exists hepha_architecture_debt_touch_decisions (decision_id text primary key, record_id text not null references hepha_architecture_debt(record_id), payload_json text not null);
create index if not exists idx_arch_debt_location_path on hepha_architecture_debt_locations(relative_path);
create index if not exists idx_arch_debt_decision_record on hepha_architecture_debt_touch_decisions(record_id);
`;
const APPEND_ONLY_TABLES = ["hepha_architecture_debt", "hepha_architecture_debt_locations", "hepha_architecture_debt_observations", "hepha_architecture_debt_events", "hepha_architecture_debt_touch_plans", "hepha_architecture_debt_touch_decisions"] as const;
function appendOnlySql(): string { return APPEND_ONLY_TABLES.flatMap((table) => [`create trigger if not exists trg_${table}_no_update before update on ${table} begin select raise(abort, 'append-only'); end;`, `create trigger if not exists trg_${table}_no_delete before delete on ${table} begin select raise(abort, 'append-only'); end;`]).join("\n"); }

export class ArchitectureDebtSqliteStore {
  private readonly database: DatabaseSync;
  constructor(databasePath: string) { if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true }); this.database = new DatabaseSync(databasePath); this.database.exec("pragma foreign_keys = on; pragma busy_timeout = 5000;"); if (databasePath !== ":memory:") this.database.exec("pragma journal_mode = wal;"); this.ensureSchema(); }
  close(): void { this.database.close(); }
  private rollback(): void { try { this.database.exec("rollback"); } catch { /* no active transaction */ } }
  private ensureSchema(): void {
    try {
      this.database.exec("begin immediate");
      this.database.exec(BASE_SCHEMA);
      const columns = this.database.prepare("pragma table_info(hepha_architecture_debt_events)").all() as RawRow[];
      if (!columns.some((column) => column.name === "payload_json")) this.database.exec("alter table hepha_architecture_debt_events add column payload_json text");
      this.database.exec(appendOnlySql());
      const current = this.database.prepare("select max(version) as version from hepha_architecture_debt_schema_migrations").get() as RawRow | undefined;
      if (typeof current?.version !== "number" || current.version < SCHEMA_VERSION) this.database.prepare("insert or replace into hepha_architecture_debt_schema_migrations(version, applied_at) values (?,?)").run(SCHEMA_VERSION, new Date().toISOString());
      this.database.exec("commit");
    } catch { this.rollback(); throw new Error("ARCHITECTURE_DEBT_SCHEMA_FAILED"); }
  }
  /**
   * Commits one operation only after an optional same-connection read-back.
   * The callback runs before commit, so a rejected post-write projection rolls
   * back the append rather than returning a failure after durable mutation.
   */
  commitArchitectureDebtOperation(rawInput: unknown, verifyReadBack?: (aggregate: ArchitectureDebtAggregateV1) => boolean): ArchitectureDebtCommitResult {
    if (!validCreate(rawInput) && !validLink(rawInput) && !validTriage(rawInput) && !validDecisionOperation(rawInput)) return refusal("invalid_input");
    if (verifyReadBack !== undefined && typeof verifyReadBack !== "function") return refusal("invalid_input");
    try {
      this.database.exec("begin immediate");
      if (rawInput.kind === "RECORD_TOUCH_DECISION") return this.commitDecision(rawInput);
      const existing = this.getArchitectureDebtAggregate({ projectId: rawInput.projectId, recordId: rawInput.recordId });
      if (rawInput.kind === "CREATE_PENDING") { if (existing) { this.rollback(); return refusal("invalid_input"); } this.insertCreate(rawInput); }
      else {
        if (!existing) { this.rollback(); return refusal("invalid_input"); }
        if (existing.eventVersion !== rawInput.expectedVersion) { this.rollback(); return refusal("stale_version"); }
        if (rawInput.kind === "LINK_OBSERVATION") {
          if (existing.observationReferences.some((entry) => entry.contentHash === rawInput.observation.contentHash)) { this.database.exec("commit"); return { kind: "committed", aggregate: existing }; }
          this.insertLink(rawInput, existing);
        } else {
          if (rawInput.nextAggregate.projectId !== existing.projectId || rawInput.nextAggregate.recordId !== existing.recordId || rawInput.nextAggregate.eventVersion !== existing.eventVersion + 1 || rawInput.nextAggregate.observationReferences.length !== existing.observationReferences.length || !rawInput.nextAggregate.observationReferences.every((entry, index) => sameReference(entry, existing.observationReferences[index]!))) { this.rollback(); return refusal("invalid_input"); }
          this.database.prepare("insert into hepha_architecture_debt_events(record_id,event_version,event_kind,state,occurred_at,payload_json) values (?,?,?,?,?,?)").run(existing.recordId, existing.eventVersion + 1, "TRIAGE", rawInput.nextAggregate.state, this.eventOccurredAt(rawInput.event), JSON.stringify({ event: rawInput.event, nextAggregate: rawInput.nextAggregate }));
        }
      }
      const aggregate = this.getArchitectureDebtAggregate({ projectId: rawInput.projectId, recordId: rawInput.recordId });
      if (!aggregate || (verifyReadBack !== undefined && !verifyReadBack(aggregate))) throw new Error("readback");
      this.database.exec("commit"); return { kind: "committed", aggregate };
    } catch { this.rollback(); return refusal("persistence_failed"); }
  }
  private eventOccurredAt(event: unknown): string { return isRecord(event) && utc(event.occurredAt) ? event.occurredAt : new Date(0).toISOString(); }
  private commitDecision(input: RecordArchitectureDebtTouchDecisionOperation): ArchitectureDebtCommitResult {
    const decision = input.decision;
    if (!validPersistedFutureTouchDecision(decision) || decision.projectId !== input.projectId || decision.featureId !== input.featureId || decision.touchPlanHash !== input.touchPlanHash) { this.rollback(); return refusal("invalid_input"); }
    const aggregate = this.getArchitectureDebtAggregate({ projectId: input.projectId, recordId: decision.recordId });
    if (!aggregate || decision.recordVersion !== aggregate.eventVersion) { this.rollback(); return refusal("invalid_input"); }
    const knownPlan = this.database.prepare("select project_id,feature_id,payload_json from hepha_architecture_debt_touch_plans where touch_plan_hash=?").get(input.touchPlanHash) as RawRow | undefined;
    if (knownPlan && (knownPlan.project_id !== input.projectId || knownPlan.feature_id !== input.featureId || knownPlan.payload_json !== JSON.stringify(input.touchPlan))) { this.rollback(); return refusal("invalid_input"); }
    if (!knownPlan) this.database.prepare("insert into hepha_architecture_debt_touch_plans(touch_plan_hash,project_id,feature_id,payload_json) values (?,?,?,?)").run(input.touchPlanHash, input.projectId, input.featureId, JSON.stringify(input.touchPlan));
    this.database.prepare("insert into hepha_architecture_debt_touch_decisions(decision_id,record_id,payload_json) values (?,?,?)").run(String(decision.decisionId), String(decision.recordId), JSON.stringify(decision));
    this.database.exec("commit"); return { kind: "decision_committed" };
  }
  private insertCreate(input: CreatePendingArchitectureDebtOperation): void {
    this.database.prepare("insert into hepha_architecture_debt(record_id,project_id,owner_id,rationale,risk,architectural_boundary,priority,priority_source,trigger_json,discovery_json,rule_json,created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)").run(input.recordId, input.projectId, input.ownerId, input.rationale, input.risk, input.architecturalBoundary, input.priority, input.prioritySource, JSON.stringify(input.futureTouchTrigger), JSON.stringify(input.discovery), JSON.stringify(input.rule), input.createdAt);
    const insertLocation = this.database.prepare("insert into hepha_architecture_debt_locations(record_id,location_id,relative_path,symbol,endpoint,rule_tags_json) values (?,?,?,?,?,?)");
    for (const entry of input.locations) insertLocation.run(input.recordId, entry.locationId, entry.relativePath, entry.symbol ?? null, entry.endpoint ?? null, JSON.stringify(entry.ruleTags));
    this.database.prepare("insert into hepha_architecture_debt_observations(record_id,content_hash,artifact_id,relative_path,linked_at) values (?,?,?,?,?)").run(input.recordId, input.discovery.observation.contentHash, input.discovery.observation.artifactId, input.discovery.observation.relativePath, input.createdAt);
    this.database.prepare("insert into hepha_architecture_debt_events(record_id,event_version,event_kind,state,occurred_at,payload_json) values (?,?,?,?,?,null)").run(input.recordId, 0, "CREATE_PENDING", "PENDING_TRIAGE", input.createdAt);
  }
  private insertLink(input: LinkObservationArchitectureDebtOperation, existing: ArchitectureDebtAggregateV1): void { this.database.prepare("insert into hepha_architecture_debt_observations(record_id,content_hash,artifact_id,relative_path,linked_at) values (?,?,?,?,?)").run(input.recordId, input.observation.contentHash, input.observation.artifactId, input.observation.relativePath, input.linkedAt); this.database.prepare("insert into hepha_architecture_debt_events(record_id,event_version,event_kind,state,occurred_at,payload_json) values (?,?,?,?,?,null)").run(input.recordId, existing.eventVersion + 1, "LINK_OBSERVATION", existing.state, input.linkedAt); }
  getArchitectureDebtAggregate(rawInput: unknown): ArchitectureDebtAggregateV1 | null {
    if (!isRecord(rawInput) || !exactKeys(rawInput, ["projectId", "recordId"]) || !identifier(rawInput.projectId) || typeof rawInput.recordId !== "string" || !RECORD_ID_RE.test(rawInput.recordId)) return null;
    try {
      const root = this.database.prepare("select * from hepha_architecture_debt where project_id=? and record_id=?").get(rawInput.projectId, rawInput.recordId) as RawRow | undefined;
      if (!root || !this.validRoot(root)) return null;
      const locations = this.readLocations(root.record_id); const observations = this.readObservations(root.record_id); const events = this.database.prepare("select * from hepha_architecture_debt_events where record_id=? order by event_version").all(root.record_id) as RawRow[];
      const triggerValue = parseJson(root.trigger_json); const discoveryValue = parseJson(root.discovery_json); const ruleValue = parseJson(root.rule_json);
      if (!locations || !observations || !trigger(triggerValue) || !discovery(discoveryValue) || !rule(ruleValue) || !sameReference(discoveryValue.observation, observations[0]!)) return null;
      if (root.record_id !== createArchitectureDebtRecordId({ projectId: root.project_id, rule: ruleValue, architecturalBoundary: root.architectural_boundary, locations })) return null;
      const base: ArchitectureDebtAggregateV1 = { schemaVersion: 1, recordId: root.record_id, projectId: root.project_id, eventVersion: 0, state: "PENDING_TRIAGE", ownerId: root.owner_id, rationale: root.rationale, risk: root.risk, architecturalBoundary: root.architectural_boundary, priority: root.priority as ArchitectureDebtPriority, prioritySource: root.priority_source as "AUTO_PENDING_DEFAULT", futureTouchTrigger: triggerValue, discovery: discoveryValue, rule: ruleValue, locations, observationReferences: observations };
      return this.reconstruct(base, events);
    } catch { return null; }
  }
  private reconstruct(base: ArchitectureDebtAggregateV1, events: RawRow[]): ArchitectureDebtAggregateV1 | null {
    if (events.length === 0) return null;
    let current: ArchitectureDebtAggregateV1 = base; let linkCount = 0;
    for (const [index, event] of events.entries()) {
      if (!exactKeys(event, ["record_id", "event_version", "event_kind", "state", "occurred_at", "payload_json"]) || event.record_id !== base.recordId || event.event_version !== index || !utc(event.occurred_at) || typeof event.event_kind !== "string" || typeof event.state !== "string" || !STATES.has(event.state as ArchitectureDebtState)) return null;
      if (index === 0) { if (event.event_kind !== "CREATE_PENDING" || event.state !== "PENDING_TRIAGE" || event.payload_json !== null) return null; continue; }
      if (event.event_kind === "LINK_OBSERVATION") { if (event.payload_json !== null || event.state !== current.state) return null; linkCount += 1; current = { ...current, eventVersion: index }; continue; }
      if (event.event_kind !== "TRIAGE" || typeof event.payload_json !== "string") return null;
      const payload = parseJson(event.payload_json);
      if (!isRecord(payload) || !exactKeys(payload, ["event", "nextAggregate"]) || !isRecord(payload.event) || !validAggregate(payload.nextAggregate) || payload.nextAggregate.recordId !== base.recordId || payload.nextAggregate.projectId !== base.projectId || payload.nextAggregate.eventVersion !== index || payload.nextAggregate.state !== event.state || payload.nextAggregate.observationReferences.length !== base.observationReferences.length) return null;
      current = { ...payload.nextAggregate, observationReferences: base.observationReferences };
    }
    if (linkCount !== base.observationReferences.length - 1 || current.eventVersion !== events.length - 1 || !validAggregate(current)) return null;
    return current;
  }
  private validRoot(row: RawRow): row is { record_id: string; project_id: string; owner_id: string; rationale: string; risk: string; architectural_boundary: string; priority: string; priority_source: string; trigger_json: string; discovery_json: string; rule_json: string; created_at: string } { return exactKeys(row, ["record_id", "project_id", "owner_id", "rationale", "risk", "architectural_boundary", "priority", "priority_source", "trigger_json", "discovery_json", "rule_json", "created_at"]) && typeof row.record_id === "string" && RECORD_ID_RE.test(row.record_id) && identifier(row.project_id) && identifier(row.owner_id) && text(row.rationale) && text(row.risk) && identifier(row.architectural_boundary) && PRIORITIES.has(row.priority as ArchitectureDebtPriority) && row.priority_source === "AUTO_PENDING_DEFAULT" && utc(row.created_at) && typeof row.trigger_json === "string" && typeof row.discovery_json === "string" && typeof row.rule_json === "string"; }
  private readLocations(recordId: string): ArchitectureDebtLocation[] | null { const rows = this.database.prepare("select * from hepha_architecture_debt_locations where record_id=? order by relative_path,symbol,location_id").all(recordId) as RawRow[]; const values: ArchitectureDebtLocation[] = []; for (const row of rows) { if (!exactKeys(row, ["record_id", "location_id", "relative_path", "symbol", "endpoint", "rule_tags_json"]) || row.record_id !== recordId || !identifier(row.location_id) || !path(row.relative_path) || !(row.symbol === null || identifier(row.symbol)) || !(row.endpoint === null || identifier(row.endpoint))) return null; const tags = parseJson(row.rule_tags_json); const value: ArchitectureDebtLocation = { locationId: row.location_id, relativePath: row.relative_path, ...(row.symbol === null ? {} : { symbol: row.symbol }), ...(row.endpoint === null ? {} : { endpoint: row.endpoint }), ruleTags: tags as readonly string[] }; if (!location(value)) return null; values.push(value); } return values.length > 0 && new Set(values.map((entry) => entry.locationId)).size === values.length && new Set(canonicalLocationTuples(values)).size === values.length ? values : null; }
  private readObservations(recordId: string): ArchitectureDebtArtifactReference[] | null { const rows = this.database.prepare("select * from hepha_architecture_debt_observations where record_id=? order by linked_at,content_hash").all(recordId) as RawRow[]; const values: ArchitectureDebtArtifactReference[] = []; for (const row of rows) { if (!exactKeys(row, ["record_id", "content_hash", "artifact_id", "relative_path", "linked_at"]) || row.record_id !== recordId || !hash(row.content_hash) || !identifier(row.artifact_id) || !path(row.relative_path) || !utc(row.linked_at)) return null; const value: ArchitectureDebtArtifactReference = { artifactKind: "debt_observation", contentHash: row.content_hash, artifactId: row.artifact_id, relativePath: row.relative_path }; if (!reference(value, ["debt_observation"])) return null; values.push(value); } return values.length > 0 && new Set(values.map((entry) => `${entry.contentHash}\0${entry.artifactId}\0${entry.relativePath}`)).size === values.length ? values : null; }
  /**
   * Enumerate reconstructed records for one exact project. Any malformed row
   * refuses the complete read rather than silently omitting it.
   */
  listArchitectureDebtByProject(rawProjectId: unknown): ArchitectureDebtReadResult<ArchitectureDebtAggregateV1> {
    if (!identifier(rawProjectId)) return { kind: "refusal", code: "invalid_input" };
    try {
      const rows = this.database.prepare("select record_id from hepha_architecture_debt where project_id=? order by record_id").all(rawProjectId) as RawRow[];
      const values: ArchitectureDebtAggregateV1[] = [];
      for (const row of rows) {
        if (!exactKeys(row, ["record_id"]) || typeof row.record_id !== "string" || !RECORD_ID_RE.test(row.record_id)) return { kind: "refusal", code: "persistence_failed" };
        const aggregate = this.getArchitectureDebtAggregate({ projectId: rawProjectId, recordId: row.record_id });
        if (!aggregate) return { kind: "refusal", code: "persistence_failed" };
        values.push(aggregate);
      }
      return { kind: "success", values };
    } catch { return { kind: "refusal", code: "persistence_failed" }; }
  }
  queryOpenArchitectureDebt(rawInput: unknown): ArchitectureDebtReadResult<ArchitectureDebtAggregateV1> {
    if (!isRecord(rawInput) || !exactKeys(rawInput, ["projectId", "paths", "symbols", "ruleTags"]) || !identifier(rawInput.projectId) || !stringList(rawInput.paths, path) || !stringList(rawInput.symbols) || !stringList(rawInput.ruleTags)) return { kind: "refusal", code: "invalid_input" };
    try {
      const rows = this.database.prepare("select record_id from hepha_architecture_debt where project_id=? order by record_id").all(rawInput.projectId) as RawRow[];
      const aggregates: ArchitectureDebtAggregateV1[] = [];
      for (const row of rows) {
        if (!exactKeys(row, ["record_id"]) || typeof row.record_id !== "string" || !RECORD_ID_RE.test(row.record_id)) return { kind: "refusal", code: "persistence_failed" };
        const aggregate = this.getArchitectureDebtAggregate({ projectId: rawInput.projectId, recordId: row.record_id });
        if (!aggregate) return { kind: "refusal", code: "persistence_failed" };
        if (OPEN_STATES.has(aggregate.state) && matches(aggregate, rawInput.paths, rawInput.symbols, rawInput.ruleTags)) aggregates.push(aggregate);
      }
      return { kind: "success", values: aggregates };
    } catch { return { kind: "refusal", code: "persistence_failed" }; }
  }
  /**
   * Validates every persisted decision belonging to one project before a
   * dashboard read may proceed. Legacy payloads without the required
   * server-owned timestamp are malformed and fail closed.
   */
  listFutureTouchDecisionsByProject(rawProjectId: unknown): ArchitectureDebtReadResult<unknown> {
    if (!identifier(rawProjectId)) return { kind: "refusal", code: "invalid_input" };
    try {
      const rows = this.database.prepare(`
        select decision.decision_id, decision.record_id, decision.payload_json, debt.project_id
        from hepha_architecture_debt_touch_decisions decision
        join hepha_architecture_debt debt on debt.record_id = decision.record_id
        where debt.project_id = ? order by decision.decision_id
      `).all(rawProjectId) as RawRow[];
      const values: unknown[] = [];
      for (const row of rows) {
        if (!exactKeys(row, ["decision_id", "record_id", "payload_json", "project_id"])
          || !identifier(row.decision_id) || typeof row.record_id !== "string" || !RECORD_ID_RE.test(row.record_id)
          || row.project_id !== rawProjectId) return { kind: "refusal", code: "persistence_failed" };
        const value = parseJson(row.payload_json);
        if (!validPersistedFutureTouchDecision(value)
          || value.projectId !== rawProjectId || value.recordId !== row.record_id) return { kind: "refusal", code: "persistence_failed" };
        const aggregate = this.getArchitectureDebtAggregate({ projectId: rawProjectId, recordId: row.record_id });
        if (!aggregate) return { kind: "refusal", code: "persistence_failed" };
        values.push(value);
      }
      return { kind: "success", values };
    } catch { return { kind: "refusal", code: "persistence_failed" }; }
  }
  getFutureTouchDecisions(rawInput: unknown): ArchitectureDebtReadResult<unknown> {
    if (!isRecord(rawInput) || !exactKeys(rawInput, ["projectId", "featureId", "touchPlanHash"]) || !identifier(rawInput.projectId) || !identifier(rawInput.featureId) || !hash(rawInput.touchPlanHash)) return { kind: "refusal", code: "invalid_input" };
    try {
      const plan = this.database.prepare("select project_id,feature_id,payload_json from hepha_architecture_debt_touch_plans where touch_plan_hash=?").get(rawInput.touchPlanHash) as RawRow | undefined;
      if (!plan) return { kind: "success", values: [] };
      if (!exactKeys(plan, ["project_id", "feature_id", "payload_json"]) || plan.project_id !== rawInput.projectId || plan.feature_id !== rawInput.featureId || !isRecord(parseJson(plan.payload_json))) return { kind: "refusal", code: "persistence_failed" };
      const values: unknown[] = [];
      const rows = this.database.prepare("select decision_id,payload_json from hepha_architecture_debt_touch_decisions order by decision_id").all() as RawRow[];
      for (const row of rows) {
        if (!exactKeys(row, ["decision_id", "payload_json"]) || !identifier(row.decision_id)) return { kind: "refusal", code: "persistence_failed" };
        const value = parseJson(row.payload_json);
        if (!validPersistedFutureTouchDecision(value)) return { kind: "refusal", code: "persistence_failed" };
        if (value.projectId === rawInput.projectId && value.featureId === rawInput.featureId && value.touchPlanHash === rawInput.touchPlanHash) values.push(value);
      }
      return { kind: "success", values };
    } catch { return { kind: "refusal", code: "persistence_failed" }; }
  }
}
function overlaps(left: string, right: string): boolean { return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`); }
function matches(record: ArchitectureDebtAggregateV1, paths: readonly string[], symbols: readonly string[], ruleTags: readonly string[]): boolean { return record.locations.some((entry) => paths.some((candidate) => overlaps(entry.relativePath, candidate)) || (entry.symbol !== undefined && symbols.includes(entry.symbol)) || entry.ruleTags.some((tag) => ruleTags.includes(tag))) || record.futureTouchTrigger.paths.some((entry) => paths.some((candidate) => overlaps(entry, candidate))) || record.futureTouchTrigger.symbols.some((entry) => symbols.includes(entry)) || record.futureTouchTrigger.ruleTags.some((entry) => ruleTags.includes(entry)); }
export function commitArchitectureDebtOperation(store: ArchitectureDebtSqliteStore, rawInput: unknown): ArchitectureDebtCommitResult { return store.commitArchitectureDebtOperation(rawInput); }
export function getArchitectureDebtAggregate(store: ArchitectureDebtSqliteStore, rawInput: unknown): ArchitectureDebtAggregateV1 | null { return store.getArchitectureDebtAggregate(rawInput); }
export function listArchitectureDebtByProject(store: ArchitectureDebtSqliteStore, projectId: unknown): ArchitectureDebtReadResult<ArchitectureDebtAggregateV1> { return store.listArchitectureDebtByProject(projectId); }
export function queryOpenArchitectureDebt(store: ArchitectureDebtSqliteStore, rawInput: unknown): ArchitectureDebtReadResult<ArchitectureDebtAggregateV1> { return store.queryOpenArchitectureDebt(rawInput); }
