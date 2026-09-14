import type { AcceptanceCoverageLink, ContextCompactionActivity } from "@hepha/shared";
import type { CoverageContextPolicy } from "./coverage-reconciliation-prompt.js";
import { progressiveContextBudget, contextCompactionLevel } from "../runtime/pi/progressive-context-policy.js";
import { getModelTokenCounter } from "../runtime/pi/model-token-counter.js";
import { ASSESSMENT_PROMPT_LIMIT } from "./coverage-response-correction.js";
import { compactSourceDocuments } from "./coverage-context-compaction.js";
import { selectCoverageSourceContext } from "./coverage-source-selection.js";
import type { CoverageAssessmentCheckpoint } from "./coverage-assessment-checkpoints.js";
import { assertInputSpending, inputSpendingLimit } from "../runtime/pi/input-spending-policy.js";

/** A wire projection, never a new coverage link or approval. Preserve distinct assertions. */
export function groupedPartialCoverage(links: readonly AcceptanceCoverageLink[]) {
  const grouped = new Map<string, Omit<AcceptanceCoverageLink, "explanation"> & { explanations: string[] }>();
  for (const { explanation, ...link } of links) {
    const key = JSON.stringify([link.sourceId, link.kind, link.evidenceId, link.stepNumbers]);
    const entry = grouped.get(key) ?? { ...link, explanations: [] };
    if (!entry.explanations.includes(explanation)) entry.explanations.push(explanation);
    grouped.set(key, entry);
  }
  return [...grouped.values()];
}

/** Same pinned model/counter as coverage assessment; no provider or feature constants. */
export function routingContextBudget(policy?: CoverageContextPolicy) {
  const model = policy && progressiveContextBudget(policy.model);
  const measure = policy ? (policy.counter ?? getModelTokenCounter(policy.model)).count : (text: string) => text.length;
  const hardLimit = model ? model.availableInputTokens - 2048 - 1800 : ASSESSMENT_PROMPT_LIMIT;
  if (hardLimit < 4096) throw new Error("Verification routing has insufficient model input capacity after output, wrapper and correction reserves.");
  let spent = 0;
  const spendingLimit = inputSpendingLimit("refresh");
  return { model, measure, hardLimit, dispatch: (run: (prompt: string) => Promise<string>) => async (prompt: string) => {
    const size = measure(prompt);
    const charge = (policy ? size : getModelTokenCounter().count(prompt)) + 2048;
    if (size > hardLimit + 1800) throw new Error("Verification routing request exceeds the model input budget; no request sent.");
    assertInputSpending("refresh", spent, charge, spendingLimit);
    spent += charge;
    return run(prompt);
  } };
}

export async function planRoutingContext<T extends { sourceId: string }>(entries: T[], source: string,
  build: (entries: T[], source: unknown) => string, budget: ReturnType<typeof routingContextBudget>,
  run: (prompt: string) => Promise<string>, checkpoint?: CoverageAssessmentCheckpoint,
  criteria: readonly { sourceId: string; criterionPreview?: string }[] = [], policy?: CoverageContextPolicy) {
  const { measure, model, hardLimit } = budget;
  const original = build(entries, source), beforeTokens = measure(original);
  const level = model ? contextCompactionLevel(beforeTokens + 2048, model) : beforeTokens > hardLimit ? "strong" : "none";
  if (level === "none" && beforeTokens <= hardLimit) return [{ entries, prompt: original }];
  let activity: ContextCompactionActivity | undefined;
  const notify = (state: ContextCompactionActivity["state"], afterTokens?: number) => {
    if (!policy) return;
    activity = { state, level: level === "strong" ? "strong" : "light", beforeTokens, afterTokens,
      modelId: policy.model.id, contextWindowTokens: policy.model.contextWindow, updatedAt: new Date().toISOString() };
    policy.onCompaction?.(activity);
  };
  notify("running");
  try {
    const compact = compactSourceDocuments(source);
    const sourceValue = measure(build(entries, compact)) < beforeTokens ? compact : source;
    const limit = level === "strong" && model ? Math.min(hardLimit, model.targetTokens - 2048 - 1800) : hardLimit;
    let sourceFor = (_entries: T[]): unknown => sourceValue;
    // If a single criterion still cannot fit, reuse bounded, validated source-fact
    // extraction. Every source page/criterion is accounted for; no prefix truncation.
    if (entries.some(entry => measure(build([entry], sourceFor([entry]))) > limit)) {
      if (entries.some(entry => measure(build([entry], "")) > limit))
        throw new Error("Verification routing non-source context exceeds the model budget for one criterion; no source extraction was dispatched and no evidence was discarded.");
      const selected = await selectCoverageSourceContext({ manifestEntries: entries.map(entry => ({ sourceId: entry.sourceId,
        criterionPreview: criteria.find(c => c.sourceId === entry.sourceId)?.criterionPreview })) }, source, run, checkpoint, limit, measure);
      sourceFor = group => selected.forCriteria(group.map(entry => entry.sourceId));
    }
    const plans: { entries: T[]; prompt: string }[] = [];
    let group: T[] = [];
    for (const entry of entries) {
      const trial = [...group, entry];
      if (group.length && measure(build(trial, sourceFor(trial))) > limit) {
        plans.push({ entries: group, prompt: build(group, sourceFor(group)) }); group = [];
      }
      group.push(entry);
    }
    if (group.length) plans.push({ entries: group, prompt: build(group, sourceFor(group)) });
    if (plans.length > 24 || plans.some(plan => measure(plan.prompt) > limit))
      throw new Error("Verification routing cannot fit complete criterion context after lossless compaction and source extraction; evidence is preserved. Narrow the phase verification context without removing obligations.");
    notify("completed", Math.max(...plans.map(plan => measure(plan.prompt))));
    return plans;
  } catch (error) { if (activity) notify("failed"); throw error; }
}
