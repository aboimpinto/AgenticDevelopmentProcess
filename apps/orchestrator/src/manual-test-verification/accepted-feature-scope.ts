import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import type { ManualTestDeliveryModel } from "./delivery-model.js";
import type { ManualTestAdapterContext } from "./adapter-context.js";
import { readManualTestObligations } from "../manual-test-obligation.js";
import { stripCompletionRecoverySection } from "../memorybank/completion-recovery-section.js";
import { normalizeSourceItems } from "../manual-test-verification-policy.js";
import { type SourceDiscoveryOptions, discoverSources } from "./source-discovery.js";
import { extractAcceptanceCriteria } from "./source-discovery.js";
import { writeFileAtomic } from "./artifact-storage.js";

export interface AcceptedFeatureScope {
  schemaVersion: "accepted-feature-scope/v1";
  id: string;
  featureId: string;
  criteria: { sourceId: string; category: string; text: string; sourcePath: string; sourceHash: string; verification: "manual" | "collective" }[];
  documents: { path: string; hash: string; content: string }[];
  authority: "implementation-plan";
}
export interface ReadinessImprovement {
  id: string;
  observation: string;
  rationale: string;
  references: string[];
  status: "proposed-for-future-planning";
}
export const scopeHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const acceptedScopePath = (folder: string) => resolve(folder, "manual-test-verification", "accepted-feature-scope.json");

/** Compatibility projection of the implementation plan. Reports describe the agreed
 * approach; they never supply execution or grant approval. Parent links are context. */
export function buildAcceptedFeatureScope(context: Pick<ManualTestAdapterContext, "featFolderPath" | "featExternalId">, model: ManualTestDeliveryModel, authorizedPlanningAmendment = false): AcceptedFeatureScope {
  const documents = ["FeatureDescription.md", "FeatureTasks.md", "acceptance-test-report.md", "TestPlan.md"]
    .flatMap(path => {
      const file = resolve(context.featFolderPath, path);
      if (!existsSync(file)) return [];
      const content = stripCompletionRecoverySection(readFileSync(file, "utf8"));
      // Execution records and generated recovery sections cannot add acceptance.
      return [{ path, hash: scopeHash(content), content }];
    });
  const feature = documents.find(d => d.path === "FeatureDescription.md")?.content ?? "";
  const clauses = extractAcceptanceCriteria(feature, "FEAT");
  const fullClause = (entry: ManualTestDeliveryModel["manifestEntries"][number]) => {
    const paths = [resolve(context.featFolderPath, entry.relativePath), resolve(entry.relativePath)];
    const content = paths.find(path => existsSync(path));
    const candidates = entry.category === "feat-ac" ? clauses : content ? extractAcceptanceCriteria(readFileSync(content, "utf8"), "EPIC") : [];
    return candidates.find(text => normalizeSourceItems([{ category: entry.category, relativePath: entry.relativePath, text }])[0]?.contentHash === entry.contentHash)
      ?? candidates.find(text => text.split(/[^A-Za-z0-9_-]+/).includes(entry.sourceId)) ?? entry.criterionPreview ?? entry.sourceId;
  };
  const obligations = readManualTestObligations(context.featFolderPath)?.obligations ?? [];
  const manualIds = new Set(obligations.map(o => o.id));
  const own = (model.manifestEntries ?? []).filter(e => e.category === "feat-ac" || e.category === "phase-ac");
  // Parent criteria participate only when an own accepted clause explicitly names
  // their stable ID. Merely linking an EPIC never imports all its requirements.
  const assigned = (model.manifestEntries ?? []).filter(e => !own.includes(e) && !own.some(o => o.sourceId === e.sourceId) && own.some(o =>
    fullClause(o).split(/[^A-Za-z0-9_-]+/).includes(e.sourceId)));
  const criteria = [...own, ...assigned].map(e => {
    const manual = obligations.find(o => o.id === e.sourceId);
    const text = manual ? [manual.title, manual.reason, ...manual.steps, manual.expectedResult].join("\n")
      : fullClause(e);
    return { sourceId: e.sourceId, category: e.category, text, sourcePath: e.category === "feat-ac" ? "FeatureDescription.md" : e.category === "phase-ac" ? "ManualTestObligations.json" : relative(context.featFolderPath, resolve(e.relativePath)), sourceHash: e.contentHash,
      verification: manualIds.has(e.sourceId) ? "manual" as const : "collective" as const };
  });
  const body = { schemaVersion: "accepted-feature-scope/v1" as const, featureId: context.featExternalId, criteria, documents, authority: "implementation-plan" as const };
  const scope = { ...body, id: scopeHash(body) };
  const saved = acceptedScopePath(context.featFolderPath);
  if (existsSync(saved)) {
    const previous = JSON.parse(readFileSync(saved, "utf8")) as AcceptedFeatureScope;
    const { id, ...original } = previous;
    if (id !== scopeHash(original) || previous.featureId !== scope.featureId) throw new Error("Accepted feature baseline is invalid; restore the recorded plan.");
    if (scopeHash(previous.criteria) !== scopeHash(scope.criteria)) {
      if (authorizedPlanningAmendment) return scope;
      throw new Error("Accepted criteria changed after admission; reconcile the authorized planning amendment.");
    }
    return previous;
  }
  return scope;
}

/** Persist at an authorized boundary, never in a read-only status projection. */
export function captureAcceptedFeatureScope(folder: string, scope: AcceptedFeatureScope, authorizedPlanningAmendment = false) {
  const path = acceptedScopePath(folder);
  if (existsSync(path)) {
    const previous = JSON.parse(readFileSync(path, "utf8")) as AcceptedFeatureScope;
    const { id, ...body } = previous;
    if (id !== scopeHash(body) || previous.featureId !== scope.featureId) throw new Error("Accepted feature baseline is invalid; restore its recorded planning artifact.");
    if (scopeHash(previous.criteria) !== scopeHash(scope.criteria)) {
      if (!authorizedPlanningAmendment) throw new Error("Accepted criteria changed after implementation admission. Reconcile the authorized planning amendment before assessing the changed obligation.");
      writeFileAtomic(resolve(folder, "manual-test-verification", "accepted-scope-history", `${previous.id}.json`), JSON.stringify(previous, null, 2));
      writeFileAtomic(path, JSON.stringify(scope, null, 2));
      return scope;
    }
    return previous;
  }
  writeFileAtomic(path, JSON.stringify(scope, null, 2));
  return scope;
}

export function readinessModel<T extends ManualTestDeliveryModel>(model: T): T {
  const ids = model.acceptedScope ? new Set(model.acceptedScope.criteria.filter(c => c.verification !== "manual").map(c => `${c.category}:${c.sourceId}`)) : null;
  return { ...model,
    manifestEntries: ids ? (model.manifestEntries ?? []).filter(c => ids.has(`${c.category}:${c.sourceId}`)) : model.manifestEntries,
    // The canonical manual package remains separate from automated acceptance.
    tests: [], invalidManualTests: [], deferredSurfaces: [],
    coverageMap: ids ? (model.coverageMap ?? []).filter(c => ids.has(`${c.category}:${c.sourceId}`)).map(c => ({ ...c, coverageStatus: "uncovered" as const, testIds: [] })) : model.coverageMap,
  };
}

/** Invoked only after the existing Start Implementation authorization checks. */
export function captureImplementationPlan(folder: string, featureId: string, sourceOptions?: SourceDiscoveryOptions, authorizedPlanningAmendment = false) {
  if (!existsSync(resolve(folder, "FeatureDescription.md"))) return;
  const manifestEntries = normalizeSourceItems(discoverSources(sourceOptions ?? { featDescriptionPath: resolve(folder, "FeatureDescription.md"), epicDescriptionPath: null, epicAcceptanceTestsPath: null, gherkinPaths: [] }));
  const scope = buildAcceptedFeatureScope({ featFolderPath: folder, featExternalId: featureId }, { manifestEntries, coverageMap: [], tests: [], invalidManualTests: [], automatedEvidence: [], deferredSurfaces: [], applicability: "not_applicable" }, authorizedPlanningAmendment);
  captureAcceptedFeatureScope(folder, scope, authorizedPlanningAmendment);
}
