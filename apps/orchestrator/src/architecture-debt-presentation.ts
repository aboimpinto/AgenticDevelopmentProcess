/**
 * FEAT-067 V1 safe architecture-debt register projection.
 *
 * Compatibility Decision: BREAKING CHANGE PERMITTED. This internal read-only
 * boundary accepts only reconstructed V1 structured state and never imports a
 * store, parses Markdown, resolves authority, or exposes an action.
 */
import type { ArchitectureDebtPriority, ArchitectureDebtState } from "@hepha/db";

export interface ArchitectureDebtLocationProjectionV1 {
  readonly locationId: string;
  readonly relativePath: string;
  readonly symbol?: string;
  readonly endpoint?: string;
  readonly ruleTags: readonly string[];
}

export interface ArchitectureDebtTriggerProjectionV1 {
  readonly triggerId: string;
  readonly name: string;
  readonly paths: readonly string[];
  readonly symbols: readonly string[];
  readonly ruleTags: readonly string[];
}

export interface ArchitectureDebtProjectionV1 {
  readonly recordId: string;
  readonly state: ArchitectureDebtState;
  readonly eventVersion: number;
  readonly ownerId: string;
  readonly priority: ArchitectureDebtPriority;
  readonly prioritySource: "AUTO_PENDING_DEFAULT" | "STEWARD_CONFIRMED";
  readonly rule: Readonly<{ ruleId: string; ruleVersion: string; category: string; sourceReference: string }>;
  readonly architecturalBoundary: string;
  readonly rationale: string;
  readonly risk: string;
  readonly locations: readonly ArchitectureDebtLocationProjectionV1[];
  readonly futureTouchTrigger: ArchitectureDebtTriggerProjectionV1;
  readonly discovery: Readonly<{ featureId: string; phaseNumber: number; reviewGateId: string; findingId: string }>;
  readonly duplicateOfRecordId?: string;
  readonly supersededByRecordId?: string;
  /** Phase 2 persists no decision rows yet; Phase 6 owns their durable composition. */
  readonly futureTouchDecisionSummaries: readonly [];
}

export interface ArchitectureDebtRegisterProjection {
  readonly kind: "projected";
  readonly authority: "presentation_only";
  readonly records: readonly ArchitectureDebtProjectionV1[];
}

export interface ArchitectureDebtPresentationRefusal {
  readonly kind: "refusal";
  readonly code: "invalid_input";
  readonly message: string;
}

export type ArchitectureDebtProjectionResult = ArchitectureDebtRegisterProjection | ArchitectureDebtPresentationRefusal;
export type RenderArchitectureDebtMarkdownResult =
  | Readonly<{ kind: "rendered"; markdown: string; projection: ArchitectureDebtRegisterProjection }>
  | ArchitectureDebtPresentationRefusal;

type RawRecord = Record<string, unknown>;

const RECORD_ID_RE = /^ARCH-DEBT-[a-f0-9]{32}$/;
const STATES = new Set<ArchitectureDebtState>(["PENDING_TRIAGE", "CONFIRMED", "DEFERRED", "ACCEPTED_RISK", "PLANNED", "CLOSED", "REJECTED", "MERGED", "SUPERSEDED"]);
const PRIORITIES = new Set<ArchitectureDebtPriority>(["P0", "P1", "P2", "P3"]);
const SECRET_LIKE = [/(?:api[_-]?key|authorization|bearer|password|secret|token)\s*[:=]\s*\S+/i, /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/, /sk-[A-Za-z0-9_-]{12,}/];
const RAW_HTML = /<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/;
const ACTIVE_MARKDOWN_URI = /(?:!?\[[^\]]*\]\(\s*|<\s*)(?:javascript|data|vbscript)\s*:/i;

/** Contract-fixed UTF-16 code-unit order; never consult the host locale. */
function codeUnitCompare(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function locationCompare(
  left: Pick<ArchitectureDebtLocationProjectionV1, "locationId" | "relativePath" | "symbol">,
  right: Pick<ArchitectureDebtLocationProjectionV1, "locationId" | "relativePath" | "symbol">,
): number {
  return codeUnitCompare(left.relativePath, right.relativePath)
    || codeUnitCompare(left.symbol ?? "", right.symbol ?? "")
    || codeUnitCompare(left.locationId, right.locationId);
}

function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: RawRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function safeText(value: unknown, maximumLength = 4096): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength
    && !value.includes("\0") && !/[\x00-\x1F\x7F]/.test(value)
    && !SECRET_LIKE.some((pattern) => pattern.test(value))
    && !RAW_HTML.test(value) && !ACTIVE_MARKDOWN_URI.test(value);
}

function identifier(value: unknown, maximumLength = 256): value is string {
  return safeText(value, maximumLength);
}

function path(value: unknown): value is string {
  return safeText(value, 1024) && !value.includes("\\") && !value.startsWith("/")
    && !/^[A-Za-z]:/.test(value) && !value.split("/").some((segment) => !segment || segment === "." || segment === "..");
}

function hash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1] < value);
}

function textList(value: unknown, pathEntry = false): value is readonly string[] {
  return Array.isArray(value) && value.length <= 128 && value.every((entry) => pathEntry ? path(entry) : safeText(entry))
    && sortedUnique(value as readonly string[]);
}

function reference(value: unknown, kind: "debt_observation" | "review_manifest"): boolean {
  return isRecord(value) && exactKeys(value, ["artifactKind", "artifactId", "contentHash", "relativePath"])
    && value.artifactKind === kind && identifier(value.artifactId) && hash(value.contentHash) && path(value.relativePath);
}

function location(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = ["locationId", "relativePath", "symbol", "endpoint", "ruleTags"].filter((key) => value[key] !== undefined);
  return exactKeys(value, keys) && identifier(value.locationId) && path(value.relativePath)
    && (value.symbol === undefined || identifier(value.symbol)) && (value.endpoint === undefined || identifier(value.endpoint))
    && textList(value.ruleTags);
}

function trigger(value: unknown): boolean {
  return isRecord(value) && exactKeys(value, ["triggerId", "name", "paths", "symbols", "ruleTags"])
    && identifier(value.triggerId) && safeText(value.name) && textList(value.paths, true)
    && textList(value.symbols) && textList(value.ruleTags)
    && value.paths.length + value.symbols.length + value.ruleTags.length > 0;
}

function discovery(value: unknown): boolean {
  return isRecord(value) && exactKeys(value, ["featureId", "phaseNumber", "reviewGateId", "findingId", "manifest", "observation", "currentFeatureImpact"])
    && identifier(value.featureId) && Number.isInteger(value.phaseNumber) && (value.phaseNumber as number) >= 0
    && identifier(value.reviewGateId) && identifier(value.findingId) && reference(value.manifest, "review_manifest")
    && reference(value.observation, "debt_observation") && value.currentFeatureImpact === "untouched_non_blocking";
}

function rule(value: unknown): boolean {
  return isRecord(value) && exactKeys(value, ["ruleId", "ruleVersion", "ruleHash", "catalogHash", "category", "sourceReference"])
    && identifier(value.ruleId) && identifier(value.ruleVersion) && hash(value.ruleHash) && hash(value.catalogHash)
    && identifier(value.category, 128) && path(value.sourceReference);
}

function sameReference(left: RawRecord, right: RawRecord): boolean {
  return left.artifactKind === right.artifactKind && left.artifactId === right.artifactId
    && left.contentHash === right.contentHash && left.relativePath === right.relativePath;
}

function aggregate(value: unknown): value is RawRecord {
  if (!isRecord(value)) return false;
  const keys = ["schemaVersion", "recordId", "projectId", "eventVersion", "state", "ownerId", "rationale", "risk", "architecturalBoundary", "priority", "prioritySource", "futureTouchTrigger", "discovery", "rule", "locations", "observationReferences", "duplicateOfRecordId", "supersededByRecordId"].filter((key) => value[key] !== undefined);
  if (!exactKeys(value, keys) || value.schemaVersion !== 1 || typeof value.recordId !== "string" || !RECORD_ID_RE.test(value.recordId)
    || !identifier(value.projectId) || !Number.isInteger(value.eventVersion) || (value.eventVersion as number) < 0
    || typeof value.state !== "string" || !STATES.has(value.state as ArchitectureDebtState) || !identifier(value.ownerId)
    || !safeText(value.rationale) || !safeText(value.risk) || !identifier(value.architecturalBoundary)
    || typeof value.priority !== "string" || !PRIORITIES.has(value.priority as ArchitectureDebtPriority)
    || (value.prioritySource !== "AUTO_PENDING_DEFAULT" && value.prioritySource !== "STEWARD_CONFIRMED")
    || !trigger(value.futureTouchTrigger) || !discovery(value.discovery) || !rule(value.rule)
    || !Array.isArray(value.locations) || value.locations.length === 0 || value.locations.length > 128 || !value.locations.every(location)
    || !Array.isArray(value.observationReferences) || value.observationReferences.length === 0 || value.observationReferences.length > 128
    || !value.observationReferences.every((entry) => reference(entry, "debt_observation"))) return false;

  const locationIds = value.locations.map((entry) => (entry as RawRecord).locationId);
  const locationTuples = value.locations.map((entry) => {
    const locationValue = entry as RawRecord;
    return `${locationValue.relativePath}\0${locationValue.symbol ?? ""}`;
  });
  // Observation references are append-only discovery/link evidence, not one
  // record per triage event. A valid triage transition therefore retains the
  // initial reference while its event version advances.
  if (new Set(locationIds).size !== locationIds.length || new Set(locationTuples).size !== locationTuples.length
    || value.observationReferences.length === 0) return false;

  const firstObservation = value.observationReferences[0];
  if (!isRecord(value.discovery) || !isRecord(firstObservation) || !sameReference(value.discovery.observation as RawRecord, firstObservation)) return false;
  const duplicateValid = value.duplicateOfRecordId === undefined || (typeof value.duplicateOfRecordId === "string" && RECORD_ID_RE.test(value.duplicateOfRecordId) && value.duplicateOfRecordId !== value.recordId);
  const supersessionValid = value.supersededByRecordId === undefined || (typeof value.supersededByRecordId === "string" && RECORD_ID_RE.test(value.supersededByRecordId) && value.supersededByRecordId !== value.recordId);
  if (!duplicateValid || !supersessionValid) return false;
  return (value.state === "MERGED") === (value.duplicateOfRecordId !== undefined)
    && (value.state === "SUPERSEDED") === (value.supersededByRecordId !== undefined)
    && !(value.duplicateOfRecordId !== undefined && value.supersededByRecordId !== undefined);
}

function freezeCopy<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((entry) => freezeCopy(entry))) as T;
  if (isRecord(value)) {
    const copy: RawRecord = {};
    for (const [key, entry] of Object.entries(value)) copy[key] = freezeCopy(entry);
    return Object.freeze(copy) as T;
  }
  return value;
}

function refusal(): ArchitectureDebtPresentationRefusal {
  return freezeCopy({
    kind: "refusal" as const,
    code: "invalid_input" as const,
    message: "Architecture-debt register is unavailable for safe presentation.",
  });
}

function projectionRule(value: unknown): boolean {
  return isRecord(value) && exactKeys(value, ["ruleId", "ruleVersion", "category", "sourceReference"])
    && identifier(value.ruleId) && identifier(value.ruleVersion) && identifier(value.category, 128) && path(value.sourceReference);
}

function projectionRecord(source: RawRecord): ArchitectureDebtProjectionV1 {
  const sourceRule = source.rule as RawRecord;
  const sourceTrigger = source.futureTouchTrigger as RawRecord;
  const sourceDiscovery = source.discovery as RawRecord;
  const locations = (source.locations as readonly RawRecord[]).map((entry) => ({
    locationId: entry.locationId as string,
    relativePath: entry.relativePath as string,
    ...(entry.symbol === undefined ? {} : { symbol: entry.symbol as string }),
    ...(entry.endpoint === undefined ? {} : { endpoint: entry.endpoint as string }),
    ruleTags: [...(entry.ruleTags as readonly string[])],
  })).sort(locationCompare);
  return {
    recordId: source.recordId as string,
    state: source.state as ArchitectureDebtState,
    eventVersion: source.eventVersion as number,
    ownerId: source.ownerId as string,
    priority: source.priority as ArchitectureDebtPriority,
    prioritySource: source.prioritySource as "AUTO_PENDING_DEFAULT" | "STEWARD_CONFIRMED",
    rule: { ruleId: sourceRule.ruleId as string, ruleVersion: sourceRule.ruleVersion as string, category: sourceRule.category as string, sourceReference: sourceRule.sourceReference as string },
    architecturalBoundary: source.architecturalBoundary as string,
    rationale: source.rationale as string,
    risk: source.risk as string,
    locations,
    futureTouchTrigger: { triggerId: sourceTrigger.triggerId as string, name: sourceTrigger.name as string, paths: [...(sourceTrigger.paths as readonly string[])], symbols: [...(sourceTrigger.symbols as readonly string[])], ruleTags: [...(sourceTrigger.ruleTags as readonly string[])] },
    discovery: { featureId: sourceDiscovery.featureId as string, phaseNumber: sourceDiscovery.phaseNumber as number, reviewGateId: sourceDiscovery.reviewGateId as string, findingId: sourceDiscovery.findingId as string },
    ...(source.duplicateOfRecordId === undefined ? {} : { duplicateOfRecordId: source.duplicateOfRecordId as string }),
    ...(source.supersededByRecordId === undefined ? {} : { supersededByRecordId: source.supersededByRecordId as string }),
    futureTouchDecisionSummaries: [],
  };
}

function validProjectionRecord(value: unknown): value is ArchitectureDebtProjectionV1 {
  if (!isRecord(value)) return false;
  const keys = ["recordId", "state", "eventVersion", "ownerId", "priority", "prioritySource", "rule", "architecturalBoundary", "rationale", "risk", "locations", "futureTouchTrigger", "discovery", "duplicateOfRecordId", "supersededByRecordId", "futureTouchDecisionSummaries"].filter((key) => value[key] !== undefined);
  if (!exactKeys(value, keys) || typeof value.recordId !== "string" || !RECORD_ID_RE.test(value.recordId)
    || typeof value.state !== "string" || !STATES.has(value.state as ArchitectureDebtState) || !Number.isInteger(value.eventVersion) || (value.eventVersion as number) < 0
    || !identifier(value.ownerId) || typeof value.priority !== "string" || !PRIORITIES.has(value.priority as ArchitectureDebtPriority)
    || (value.prioritySource !== "AUTO_PENDING_DEFAULT" && value.prioritySource !== "STEWARD_CONFIRMED") || !projectionRule(value.rule)
    || !identifier(value.architecturalBoundary) || !safeText(value.rationale) || !safeText(value.risk)
    || !Array.isArray(value.locations) || value.locations.length === 0 || value.locations.length > 128 || !value.locations.every(location)
    || !trigger(value.futureTouchTrigger) || !isRecord(value.discovery)
    || !exactKeys(value.discovery, ["featureId", "phaseNumber", "reviewGateId", "findingId"])
    || !identifier(value.discovery.featureId) || !Number.isInteger(value.discovery.phaseNumber) || (value.discovery.phaseNumber as number) < 0
    || !identifier(value.discovery.reviewGateId) || !identifier(value.discovery.findingId)
    || !Array.isArray(value.futureTouchDecisionSummaries) || value.futureTouchDecisionSummaries.length !== 0) return false;
  const locationIds = value.locations.map((entry) => (entry as RawRecord).locationId);
  const locationTuples = value.locations.map((entry) => {
    const entryValue = entry as RawRecord;
    return `${entryValue.relativePath}\0${entryValue.symbol ?? ""}`;
  });
  const duplicateValid = value.duplicateOfRecordId === undefined || (typeof value.duplicateOfRecordId === "string" && RECORD_ID_RE.test(value.duplicateOfRecordId) && value.duplicateOfRecordId !== value.recordId);
  const supersessionValid = value.supersededByRecordId === undefined || (typeof value.supersededByRecordId === "string" && RECORD_ID_RE.test(value.supersededByRecordId) && value.supersededByRecordId !== value.recordId);
  return new Set(locationIds).size === locationIds.length && new Set(locationTuples).size === locationTuples.length
    && duplicateValid && supersessionValid
    && (value.state === "MERGED") === (value.duplicateOfRecordId !== undefined)
    && (value.state === "SUPERSEDED") === (value.supersededByRecordId !== undefined)
    && !(value.duplicateOfRecordId !== undefined && value.supersededByRecordId !== undefined);
}

function validProjection(value: unknown): value is ArchitectureDebtRegisterProjection {
  return isRecord(value) && exactKeys(value, ["kind", "authority", "records"])
    && value.kind === "projected" && value.authority === "presentation_only" && Array.isArray(value.records)
    && value.records.length <= 512 && value.records.every(validProjectionRecord)
    && new Set(value.records.map((recordValue) => (recordValue as ArchitectureDebtProjectionV1).recordId)).size === value.records.length;
}

/**
 * Projects reconstructed V1 aggregates into a detached, allowlisted read model.
 * Markdown, stores, raw artifact content, identity/authority inputs, and action
 * controls are deliberately not accepted at this boundary.
 */
export function projectArchitectureDebtRegister(rawInput: unknown): ArchitectureDebtProjectionResult {
  if (!isRecord(rawInput) || !exactKeys(rawInput, ["records"]) || !Array.isArray(rawInput.records)
    || rawInput.records.length > 512 || !rawInput.records.every(aggregate)) return refusal();
  const recordIds = rawInput.records.map((recordValue) => (recordValue as RawRecord).recordId);
  if (new Set(recordIds).size !== recordIds.length) return refusal();
  return freezeCopy({
    kind: "projected" as const,
    authority: "presentation_only" as const,
    records: rawInput.records.map((recordValue) => projectionRecord(recordValue as RawRecord)).sort((left, right) => codeUnitCompare(left.recordId, right.recordId)),
  });
}

function escapeMarkdown(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/([\\`*_\[\]{}()#!|~])/g, "\\$1").replace(/[\r\n]/g, " ");
}

/** Renders only a successful safe projection; Markdown is presentation evidence, never state. */
export function renderArchitectureDebtMarkdown(rawProjection: unknown): RenderArchitectureDebtMarkdownResult {
  if (!validProjection(rawProjection)) return refusal();
  const projection = freezeCopy(rawProjection);
  const lines = [
    "## Architecture Debt Register",
    "",
    "> **Presentation evidence only:** This Markdown is derived from authoritative structured state. It cannot create, triage, approve, close, supersede, or otherwise mutate architecture-debt state.",
  ];
  for (const record of [...projection.records].sort((left, right) => codeUnitCompare(left.recordId, right.recordId))) {
    lines.push(
      "",
      `### ${escapeMarkdown(record.recordId)}`,
      "",
      `- **State:** ${record.state}`,
      `- **Event Version:** ${record.eventVersion}`,
      `- **Owner:** ${escapeMarkdown(record.ownerId)}`,
      `- **Priority:** ${record.priority} (${record.prioritySource})`,
      `- **Rule:** ${escapeMarkdown(record.rule.ruleId)} / ${escapeMarkdown(record.rule.ruleVersion)} / ${escapeMarkdown(record.rule.category)} / ${escapeMarkdown(record.rule.sourceReference)}`,
      `- **Architectural Boundary:** ${escapeMarkdown(record.architecturalBoundary)}`,
      `- **Rationale:** ${escapeMarkdown(record.rationale)}`,
      `- **Risk:** ${escapeMarkdown(record.risk)}`,
      `- **Future-Touch Trigger:** ${escapeMarkdown(record.futureTouchTrigger.triggerId)} / ${escapeMarkdown(record.futureTouchTrigger.name)}`,
      `- **Trigger Paths:** ${record.futureTouchTrigger.paths.map(escapeMarkdown).join(", ") || "none"}`,
      `- **Trigger Symbols:** ${record.futureTouchTrigger.symbols.map(escapeMarkdown).join(", ") || "none"}`,
      `- **Trigger Rule Tags:** ${record.futureTouchTrigger.ruleTags.map(escapeMarkdown).join(", ") || "none"}`,
      `- **Discovery:** ${escapeMarkdown(record.discovery.featureId)} / Phase ${record.discovery.phaseNumber} / ${escapeMarkdown(record.discovery.reviewGateId)} / ${escapeMarkdown(record.discovery.findingId)}`,
      `- **Duplicate Of:** ${record.duplicateOfRecordId ?? "none"}`,
      `- **Superseded By:** ${record.supersededByRecordId ?? "none"}`,
      `- **Future-Touch Decision Summaries:** ${record.futureTouchDecisionSummaries.length}`,
      "",
      "| Location ID | Relative Path | Symbol | Endpoint | Rule Tags |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const locationValue of [...record.locations].sort(locationCompare)) lines.push(`| ${escapeMarkdown(locationValue.locationId)} | ${escapeMarkdown(locationValue.relativePath)} | ${locationValue.symbol === undefined ? "" : escapeMarkdown(locationValue.symbol)} | ${locationValue.endpoint === undefined ? "" : escapeMarkdown(locationValue.endpoint)} | ${locationValue.ruleTags.map(escapeMarkdown).join(", ")} |`);
  }
  return freezeCopy({ kind: "rendered" as const, markdown: lines.join("\n"), projection });
}
