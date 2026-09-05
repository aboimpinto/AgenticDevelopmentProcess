import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  RUNTIME_EXECUTION_SCHEMA_VERSION,
  canonicalizeHandoffPlanV1,
  canonicalizeRuntimeJson,
  isRuntimeAttemptStartV1,
  isRuntimeAttemptV1,
  isRuntimeFeatureInvocationFilterV1,
  isOrchestratedRuntimeEvidenceV1,
  isRuntimeInvocationOpenV1,
  isRuntimeInvocationReceiptV1,
  isRuntimePhaseInvocationFilterV1,
  isRuntimeRouteChangeEventV1,
  runtimePersistenceRejection,
  type RuntimeAttemptStartV1,
  type RuntimeAttemptV1,
  type RuntimeFeatureInvocationFilterV1,
  type OrchestratedRuntimeEvidenceV1,
  type RuntimeInvocationOpenV1,
  type RuntimeInvocationReceiptV1,
  type RuntimePersistenceResultV1,
  type RuntimePhaseInvocationFilterV1,
  type RuntimePhaseInvocationStorePageV1,
  type RuntimeRouteChangeEventV1,
} from "@hepha/shared";
import {
  mapRuntimeAttemptRow,
  mapRuntimeInvocationReceiptRow,
  mapRuntimeRouteChangeEventRow,
  runtimeAttemptValues,
  runtimeReceiptInsertValues,
  runtimeRouteChangeEventValues,
  type RuntimeSqliteRow,
} from "./runtime-invocation-row-mapper.js";
import { ensureRuntimeInvocationSchema } from "./runtime-invocation-schema.js";

const INSERT_CHAIN = `insert into hepha_runtime_invocation_chains (
  invocation_id,schema_version,mode,root_invocation_id,parent_invocation_id,invocation_kind,plan_hash,
  action_id,action_type,role_id,prompt_version,policy_source,revision_id,primary_connection_id,
  primary_model_id,second_connection_id,second_model_id,project_id,card_key,workflow_run_id,
  workflow_node_id,phase_execution_contract_id,phase_number,task_id,correlation_id,
  selected_lesson_ids_json,attempt_ids_json,route_change_event_ids_json,status,opened_at,settled_at,
  duration_ms,failure_code
) values (${Array.from({ length: 33 }, () => "?").join(",")})`;
const INSERT_ATTEMPT = `insert into hepha_runtime_attempts (
  attempt_id,schema_version,invocation_id,attempt_index,attempt_kind,approved_connection_id,
  approved_model_id,actual_connection_id,actual_model_id,provider_id,authentication_connection_id,
  authentication_kind,credential_version,work_state,checkpoint_id,checkpoint_cursor,status,
  preparation_started_at,started_at,spawned_at,terminal_at,duration_ms,exit_code,timeout_marker,failure_code
) values (${Array.from({ length: 25 }, () => "?").join(",")})`;
const INSERT_EVENT = `insert into hepha_runtime_route_change_events (
  event_id,schema_version,invocation_id,event_index,source_invocation_id,source_attempt_id,
  target_invocation_id,target_attempt_id,kind,reason_code,occurred_at,source_connection_id,
  source_model_id,target_connection_id,target_model_id,result
) values (${Array.from({ length: 16 }, () => "?").join(",")})`;
const UPDATE_ATTEMPT = `update hepha_runtime_attempts set
  schema_version=?,invocation_id=?,attempt_index=?,attempt_kind=?,approved_connection_id=?,approved_model_id=?,
  actual_connection_id=?,actual_model_id=?,provider_id=?,authentication_connection_id=?,authentication_kind=?,
  credential_version=?,work_state=?,checkpoint_id=?,checkpoint_cursor=?,status=?,preparation_started_at=?,
  started_at=?,spawned_at=?,terminal_at=?,duration_ms=?,exit_code=?,timeout_marker=?,failure_code=? where attempt_id=?`;

/** Owns transactional normalized SQLite writes and guarded canonical read-back for runtime evidence. */
export class RuntimeInvocationStore {
  private readonly database: DatabaseSync;

  constructor(readonly databasePath: string) {
    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec("pragma foreign_keys = on; pragma busy_timeout = 5000;");
    if (databasePath !== ":memory:") this.database.exec("pragma journal_mode = WAL;");
    ensureRuntimeInvocationSchema(this.database);
    this.validateInstalledEvidence();
  }

  static createInMemory(): RuntimeInvocationStore { return new RuntimeInvocationStore(":memory:"); }
  close(): void { this.database.close(); }

  openInvocation(raw: unknown): RuntimePersistenceResultV1<RuntimeInvocationReceiptV1> {
    if (!isRuntimeInvocationOpenV1(raw)) return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
    const input: RuntimeInvocationOpenV1 = raw;
    const canonicalPlan = canonicalizeHandoffPlanV1(input.plan);
    const hash = canonicalPlan === null ? null : createHash("sha256").update(canonicalPlan, "utf8").digest("hex");
    if (hash !== input.receipt.planHash) return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
    try {
      const current = this.readReceipt(input.receipt.invocationId, true);
      if (current) return same(current, input.receipt)
        ? { ok: true, value: current }
        : runtimePersistenceRejection("RUNTIME_PERSISTENCE_CONFLICT");
      if (input.receipt.invocationKind === "nested") {
        const parent = input.receipt.parentInvocationId ? this.readEvidence(input.receipt.parentInvocationId) : null;
        if (!parent || parent.receipt.rootInvocationId !== input.receipt.rootInvocationId
          || parent.receipt.correlationId !== input.receipt.correlationId
          || parent.receipt.projectId !== input.receipt.projectId) return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
      }
      this.run(INSERT_CHAIN, runtimeReceiptInsertValues(input.receipt));
      return { ok: true, value: input.receipt };
    } catch { return runtimePersistenceRejection("RUNTIME_PERSISTENCE_CONFLICT"); }
  }

  startAttempt(raw: unknown): RuntimePersistenceResultV1<RuntimeAttemptV1> {
    if (!isRuntimeAttemptStartV1(raw)) return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
    const input: RuntimeAttemptStartV1 = raw;
    try {
      const receipt = this.readReceipt(input.attempt.invocationId, true);
      if (!receipt || !atOrAfter(input.attempt.preparationStartedAt, receipt.openedAt)) return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
      const existing = this.readAttempt(input.attempt.attemptId);
      if (existing) {
        const eventReplayMatches = input.attempt.attemptIndex === 0 || (input.routeChangeEvent !== null
          && same(this.readEvent(input.routeChangeEvent.eventId), input.routeChangeEvent));
        return same(existing, input.attempt) && eventReplayMatches
          ? { ok: true, value: existing }
          : runtimePersistenceRejection("RUNTIME_PERSISTENCE_CONFLICT");
      }
      if (input.attempt.attemptIndex === 0) {
        if (receipt.attemptIds[0] !== input.attempt.attemptId
          || !sameRoute(input.attempt.approvedRoute, receipt.approvedPrimaryRoute)) return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
        this.run(INSERT_ATTEMPT, runtimeAttemptValues(input.attempt));
      } else {
        const event = input.routeChangeEvent!;
        const primary = this.readAttempt(receipt.attemptIds[0]!);
        if (!primary || !validSameChainAttemptStart(receipt, primary, input.attempt, event)) return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
        this.transaction(() => {
          this.run(INSERT_ATTEMPT, runtimeAttemptValues(input.attempt));
          this.run(INSERT_EVENT, runtimeRouteChangeEventValues(event));
          this.run("update hepha_runtime_invocation_chains set attempt_ids_json=?,route_change_event_ids_json=? where invocation_id=?", [JSON.stringify([...receipt.attemptIds, input.attempt.attemptId]), JSON.stringify([event.eventId]), receipt.invocationId]);
        });
      }
      return { ok: true, value: input.attempt };
    } catch { return runtimePersistenceRejection("RUNTIME_PERSISTENCE_CONFLICT"); }
  }

  markAttemptSpawned(raw: unknown): RuntimePersistenceResultV1<RuntimeAttemptV1> {
    return this.updateAttempt(raw, isSpawnedPostState, (before, after) => before.status === "preparing" && isSpawnedPostState(after)
      && after.actualRoute !== null && sameAttemptIdentity(before, after) && stablePreparedAuth(before, after));
  }

  markSubstantiveWorkStarted(raw: unknown): RuntimePersistenceResultV1<RuntimeAttemptV1> {
    return this.updateAttempt(raw, isWorkStartedPostState, (before, after) => before.status === "running"
      && before.workState === "none" && isWorkStartedPostState(after) && sameAttemptExceptWork(before, after));
  }

  recordCheckpoint(raw: unknown): RuntimePersistenceResultV1<RuntimeAttemptV1> {
    return this.updateAttempt(raw, isCheckpointedPostState, (before, after) => before.status === "running"
      && before.workState === "started" && isCheckpointedPostState(after) && sameAttemptExceptWork(before, after));
  }

  appendRouteChange(raw: unknown): RuntimePersistenceResultV1<RuntimeRouteChangeEventV1> {
    if (!isRuntimeRouteChangeEventV1(raw)) return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
    try {
      const existing = this.readEvent(raw.eventId);
      if (existing) {
        if (same(existing, raw)) return this.readEvidence(raw.invocationId)
          ? { ok: true, value: existing }
          : runtimePersistenceRejection("RUNTIME_PERSISTENCE_CORRUPT");
        if (existing.result === "started" && (raw.result === "completed" || raw.result === "failed")
          && sameEventExceptResult(existing, raw)) {
          const target = this.readAttempt(raw.targetAttemptId);
          const resultMatchesTarget = raw.result === "completed" ? target?.status === "completed"
            : target !== null && target !== undefined && (target.status === "failed" || target.status === "timed_out" || target.status === "cancelled");
          if (!resultMatchesTarget) return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
          this.run("update hepha_runtime_route_change_events set result=? where event_id=?", [raw.result, raw.eventId]);
          return { ok: true, value: raw };
        }
        return runtimePersistenceRejection("RUNTIME_PERSISTENCE_CONFLICT");
      }
      return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
    } catch { return runtimePersistenceRejection("RUNTIME_PERSISTENCE_CONFLICT"); }
  }

  settleAttempt(raw: unknown): RuntimePersistenceResultV1<RuntimeAttemptV1> {
    return this.updateAttempt(raw, isTerminalAttempt, (before, after) => isTerminalAttempt(after)
      && (before.status === "preparing" || before.status === "running") && sameAttemptIdentity(before, after)
      && stableRouteAndAuth(before, after) && sameProcessFacts(before, after) && sameWorkFacts(before, after));
  }

  settleInvocation(raw: unknown): RuntimePersistenceResultV1<RuntimeInvocationReceiptV1> {
    if (!isRuntimeInvocationReceiptV1(raw) || raw.status === "running") return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
    try {
      const current = this.readReceipt(raw.invocationId);
      if (!current) return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
      if (same(current, raw)) {
        const evidence = this.readEvidence(raw.invocationId);
        return evidence ? { ok: true, value: current } : runtimePersistenceRejection("RUNTIME_PERSISTENCE_CORRUPT");
      }
      if (current.status !== "running" || !sameOpenFacts(current, raw)
        || !same(current.attemptIds, raw.attemptIds) || !same(current.routeChangeEventIds, raw.routeChangeEventIds)) return runtimePersistenceRejection("RUNTIME_PERSISTENCE_CONFLICT");
      const attempts = this.readAttempts(raw.invocationId);
      const events = this.readEvents(raw.invocationId);
      const finalAttempt = attempts.at(-1);
      if (attempts.length !== raw.attemptIds.length || attempts.some((attempt) => !isTerminalAttempt(attempt))
        || !finalAttempt || !chainMatchesFinalAttempt(raw, finalAttempt) || raw.settledAt === null
        || attempts.some((attempt) => attempt.terminalAt === null || !atOrAfter(raw.settledAt!, attempt.terminalAt))
        || events.some((event) => !atOrAfter(raw.settledAt!, event.occurredAt))
        || (attempts.length === 2 && (events.length !== 1 || !eventMatchesFinalAttempt(events[0], finalAttempt)))) return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
      this.run("update hepha_runtime_invocation_chains set status=?,settled_at=?,duration_ms=?,failure_code=? where invocation_id=?", [raw.status, raw.settledAt, raw.durationMs, raw.failureCode, raw.invocationId]);
      return { ok: true, value: raw };
    } catch { return runtimePersistenceRejection("RUNTIME_PERSISTENCE_CONFLICT"); }
  }

  getInvocation(invocationId: unknown): RuntimePersistenceResultV1<OrchestratedRuntimeEvidenceV1 | null> {
    if (typeof invocationId !== "string" || invocationId.length === 0 || invocationId.length > 512) return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
    try { return { ok: true, value: this.readEvidence(invocationId) }; }
    catch { return runtimePersistenceRejection("RUNTIME_PERSISTENCE_CORRUPT"); }
  }

  listFeatureInvocations(raw: unknown): RuntimePersistenceResultV1<readonly OrchestratedRuntimeEvidenceV1[]> {
    if (runtimeHistoryLimitExceeded(raw)) return runtimePersistenceRejection("RUNTIME_EVIDENCE_HISTORY_LIMIT");
    if (!isRuntimeFeatureInvocationFilterV1(raw)) return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
    const filter: RuntimeFeatureInvocationFilterV1 = raw;
    try {
      this.validateInstalledEvidence();
      const sql = filter.cardKey === null
        ? "select invocation_id from hepha_runtime_invocation_chains where project_id=? and card_key is null order by opened_at,invocation_id limit ?"
        : "select invocation_id from hepha_runtime_invocation_chains where project_id=? and card_key=? order by opened_at,invocation_id limit ?";
      const params = filter.cardKey === null ? [filter.projectId, filter.limit + 1] : [filter.projectId, filter.cardKey, filter.limit + 1];
      const rows = this.all(sql, params);
      if (rows.length > filter.limit) return runtimePersistenceRejection("RUNTIME_EVIDENCE_HISTORY_LIMIT");
      const values = rows.map((row) => this.readEvidence(rowString(row.invocation_id))).filter((value): value is OrchestratedRuntimeEvidenceV1 => value !== null);
      return { ok: true, value: values };
    } catch { return runtimePersistenceRejection("RUNTIME_PERSISTENCE_CORRUPT"); }
  }

  listPhaseInvocations(raw: unknown): RuntimePersistenceResultV1<RuntimePhaseInvocationStorePageV1> {
    if (!isRuntimePhaseInvocationFilterV1(raw)) return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
    const filter: RuntimePhaseInvocationFilterV1 = raw;
    try {
      const cursorClause = filter.afterOpenedAt === null
        ? ""
        : " and (opened_at > ? or (opened_at = ? and invocation_id > ?))";
      const sql = `select invocation_id from hepha_runtime_invocation_chains
        where project_id=? and card_key=? and phase_execution_contract_id=?${cursorClause}
        order by opened_at,invocation_id limit ?`;
      const params: (string | number)[] = [filter.projectId, filter.cardKey, filter.phaseExecutionContractId];
      if (filter.afterOpenedAt !== null && filter.afterInvocationId !== null) {
        params.push(filter.afterOpenedAt, filter.afterOpenedAt, filter.afterInvocationId);
      }
      params.push(filter.limit + 1);
      const rows = this.all(sql, params);
      const hasMore = rows.length > filter.limit;
      const invocations = rows.slice(0, filter.limit)
        .map((row) => this.readEvidence(rowString(row.invocation_id)))
        .filter((value): value is OrchestratedRuntimeEvidenceV1 => value !== null);
      if (invocations.length !== Math.min(rows.length, filter.limit)) throw new Error("RUNTIME_PERSISTENCE_CORRUPT");
      return { ok: true, value: { invocations, hasMore } };
    } catch { return runtimePersistenceRejection("RUNTIME_PERSISTENCE_CORRUPT"); }
  }

  private validateInstalledEvidence(): void {
    for (const row of this.all("select invocation_id from hepha_runtime_invocation_chains order by opened_at,invocation_id", [])) {
      this.readEvidence(rowString(row.invocation_id));
    }
  }

  private updateAttempt(raw: unknown, validPostState: (value: RuntimeAttemptV1) => boolean, transition: (before: RuntimeAttemptV1, after: RuntimeAttemptV1) => boolean): RuntimePersistenceResultV1<RuntimeAttemptV1> {
    if (!isRuntimeAttemptV1(raw)) return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
    try {
      const current = this.readAttempt(raw.attemptId);
      if (!current) return runtimePersistenceRejection("RUNTIME_INVALID_RECEIPT");
      if (same(current, raw)) return validPostState(current)
        ? { ok: true, value: current }
        : runtimePersistenceRejection("RUNTIME_PERSISTENCE_CONFLICT");
      if (!transition(current, raw)) return runtimePersistenceRejection("RUNTIME_PERSISTENCE_CONFLICT");
      const values = runtimeAttemptValues(raw);
      this.run(UPDATE_ATTEMPT, [...values.slice(1), raw.attemptId]);
      return { ok: true, value: raw };
    } catch { return runtimePersistenceRejection("RUNTIME_PERSISTENCE_CONFLICT"); }
  }

  private readEvidence(invocationId: string): OrchestratedRuntimeEvidenceV1 | null {
    const receipt = this.readReceipt(invocationId);
    if (!receipt) return null;
    const evidence: unknown = { schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, mode: "orchestrated", receipt, attempts: this.readAttempts(invocationId), routeChangeEvents: this.readEvents(invocationId) };
    if (!isOrchestratedRuntimeEvidenceV1(evidence, {
      isRegisteredAction: () => true,
      isTrustedDirectInstrumentation: () => false,
    })) throw new Error("RUNTIME_PERSISTENCE_CORRUPT");
    return evidence;
  }

  private readReceipt(invocationId: string, allowPendingPrimary = false): RuntimeInvocationReceiptV1 | null {
    const row = this.get("select * from hepha_runtime_invocation_chains where invocation_id=?", [invocationId]);
    if (!row) return null;
    if (row.mode !== "orchestrated") throw new Error("RUNTIME_PERSISTENCE_CORRUPT");
    const storedAttemptIds = parseIds(row.attempt_ids_json);
    const storedEventIds = parseIds(row.route_change_event_ids_json);
    const queriedAttemptIds = this.all("select attempt_id from hepha_runtime_attempts where invocation_id=? order by attempt_index,attempt_id", [invocationId]).map((item) => rowString(item.attempt_id));
    const queriedEventIds = this.all("select event_id from hepha_runtime_route_change_events where invocation_id=? order by event_index,event_id", [invocationId]).map((item) => rowString(item.event_id));
    const pendingPrimary = allowPendingPrimary && storedAttemptIds.length === 1 && queriedAttemptIds.length === 0;
    if ((!pendingPrimary && !same(storedAttemptIds, queriedAttemptIds)) || !same(storedEventIds, queriedEventIds)) throw new Error("RUNTIME_PERSISTENCE_CORRUPT");
    return mapRuntimeInvocationReceiptRow(row, storedAttemptIds, storedEventIds);
  }

  private readAttempt(id: string): RuntimeAttemptV1 | null { const row = this.get("select * from hepha_runtime_attempts where attempt_id=?", [id]); return row ? mapRuntimeAttemptRow(row) : null; }
  private readEvent(id: string): RuntimeRouteChangeEventV1 | null { const row = this.get("select * from hepha_runtime_route_change_events where event_id=?", [id]); return row ? mapRuntimeRouteChangeEventRow(row) : null; }
  private readAttempts(id: string): RuntimeAttemptV1[] { return this.all("select * from hepha_runtime_attempts where invocation_id=? order by attempt_index,attempt_id", [id]).map(mapRuntimeAttemptRow); }
  private readEvents(id: string): RuntimeRouteChangeEventV1[] { return this.all("select * from hepha_runtime_route_change_events where invocation_id=? order by event_index,event_id", [id]).map(mapRuntimeRouteChangeEventRow); }
  private get(sql: string, values: readonly (string | number | null)[]): RuntimeSqliteRow | null { return (this.database.prepare(sql).get(...values) as RuntimeSqliteRow | undefined) ?? null; }
  private all(sql: string, values: readonly (string | number | null)[]): RuntimeSqliteRow[] { return this.database.prepare(sql).all(...values) as RuntimeSqliteRow[]; }
  private run(sql: string, values: readonly (string | number | null)[]): void { this.database.prepare(sql).run(...values); }
  private transaction(work: () => void): void { this.database.exec("begin immediate"); try { work(); this.database.exec("commit"); } catch (error) { this.database.exec("rollback"); throw error; } }
}

function runtimeHistoryLimitExceeded(value: unknown): boolean { return typeof value === "object" && value !== null && !Array.isArray(value) && typeof (value as { limit?: unknown }).limit === "number" && (value as { limit: number }).limit > 256; }
function rowString(value: unknown): string { if (typeof value !== "string") throw new Error("RUNTIME_PERSISTENCE_CORRUPT"); return value; }
function parseIds(value: unknown): string[] { if (typeof value !== "string") throw new Error("RUNTIME_PERSISTENCE_CORRUPT"); const parsed: unknown = JSON.parse(value); if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) throw new Error("RUNTIME_PERSISTENCE_CORRUPT"); return parsed; }
function same(left: unknown, right: unknown): boolean { return canonicalizeRuntimeJson(left) === canonicalizeRuntimeJson(right); }
function sameRoute(left: { connectionId: string; modelId: string }, right: { connectionId: string; modelId: string }): boolean { return left.connectionId === right.connectionId && left.modelId === right.modelId; }
function sameOpenFacts(left: RuntimeInvocationReceiptV1, right: RuntimeInvocationReceiptV1): boolean { const omitMutable = ({ attemptIds: _a, routeChangeEventIds: _e, status: _s, settledAt: _t, durationMs: _d, failureCode: _f, ...facts }: RuntimeInvocationReceiptV1) => facts; return same(omitMutable(left), omitMutable(right)); }
function sameAttemptIdentity(left: RuntimeAttemptV1, right: RuntimeAttemptV1): boolean { return left.attemptId === right.attemptId && left.invocationId === right.invocationId && left.attemptIndex === right.attemptIndex && left.attemptKind === right.attemptKind && sameRoute(left.approvedRoute, right.approvedRoute) && left.preparationStartedAt === right.preparationStartedAt; }
function sameAttemptExceptWork(left: RuntimeAttemptV1, right: RuntimeAttemptV1): boolean { const omit = ({ workState: _w, checkpointId: _i, checkpointCursor: _c, ...rest }: RuntimeAttemptV1) => rest; return same(omit(left), omit(right)); }
function stablePreparedAuth(left: RuntimeAttemptV1, right: RuntimeAttemptV1): boolean { return left.providerId === right.providerId && left.authenticationConnectionId === right.authenticationConnectionId && left.authenticationKind === right.authenticationKind && left.credentialVersion === right.credentialVersion; }
function sameEventExceptResult(left: RuntimeRouteChangeEventV1, right: RuntimeRouteChangeEventV1): boolean { const omit = ({ result: _result, ...event }: RuntimeRouteChangeEventV1) => event; return same(omit(left), omit(right)); }
function chainMatchesFinalAttempt(receipt: RuntimeInvocationReceiptV1, attempt: RuntimeAttemptV1): boolean { if (attempt.status === "completed") return receipt.status === "completed" && receipt.failureCode === null; if (attempt.status === "timed_out") return receipt.status === "timed_out" && receipt.failureCode === "timed_out"; if (attempt.status === "cancelled") return receipt.status === "cancelled" && receipt.failureCode === "cancelled"; return receipt.status === "failed" && receipt.failureCode === attempt.failureCode; }
function eventMatchesFinalAttempt(event: RuntimeRouteChangeEventV1 | undefined, attempt: RuntimeAttemptV1): boolean { return event !== undefined && (attempt.status === "completed" ? event.result === "completed" : event.result === "failed"); }
function sameProcessFacts(left: RuntimeAttemptV1, right: RuntimeAttemptV1): boolean { return left.startedAt === right.startedAt && left.spawnedAt === right.spawnedAt; }
function sameWorkFacts(left: RuntimeAttemptV1, right: RuntimeAttemptV1): boolean { return left.workState === right.workState && left.checkpointId === right.checkpointId && left.checkpointCursor === right.checkpointCursor; }
function stableRouteAndAuth(left: RuntimeAttemptV1, right: RuntimeAttemptV1): boolean { return same(left.actualRoute, right.actualRoute) && left.providerId === right.providerId && left.authenticationConnectionId === right.authenticationConnectionId && left.authenticationKind === right.authenticationKind && left.credentialVersion === right.credentialVersion; }
function isTerminalAttempt(value: RuntimeAttemptV1): boolean { return value.status === "completed" || value.status === "failed" || value.status === "timed_out" || value.status === "cancelled"; }
function isSpawnedPostState(value: RuntimeAttemptV1): boolean { return value.status === "running" && value.actualRoute !== null && value.workState === "none"; }
function isWorkStartedPostState(value: RuntimeAttemptV1): boolean { return value.status === "running" && value.workState === "started"; }
function isCheckpointedPostState(value: RuntimeAttemptV1): boolean { return value.status === "running" && value.workState === "checkpointed"; }
function atOrAfter(candidate: string, baseline: string): boolean { return new Date(candidate).getTime() >= new Date(baseline).getTime(); }
function validSameChainAttemptStart(receipt: RuntimeInvocationReceiptV1, primary: RuntimeAttemptV1, target: RuntimeAttemptV1, event: RuntimeRouteChangeEventV1): boolean {
  return receipt.status === "running" && receipt.approvedSecondRoute !== null && receipt.attemptIds.length === 1
    && receipt.routeChangeEventIds.length === 0 && isTerminalAttempt(primary) && primary.status !== "completed"
    && primary.failureCode !== null && primary.invocationId === receipt.invocationId
    && event.result === "started" && event.invocationId === receipt.invocationId
    && event.sourceInvocationId === receipt.invocationId && event.targetInvocationId === receipt.invocationId
    && event.sourceAttemptId === primary.attemptId && event.targetAttemptId === target.attemptId
    && event.kind === target.attemptKind && event.reasonCode === primary.failureCode
    && primary.terminalAt !== null && atOrAfter(event.occurredAt, primary.terminalAt)
    && atOrAfter(target.preparationStartedAt, event.occurredAt)
    && (event.kind === "fallback" ? primary.workState === "none" : event.kind === "recovery" && primary.workState === "checkpointed")
    && sameRoute(target.approvedRoute, receipt.approvedSecondRoute)
    && sameRoute(event.sourceApprovedRoute, primary.approvedRoute)
    && sameRoute(event.targetApprovedRoute, target.approvedRoute);
}
