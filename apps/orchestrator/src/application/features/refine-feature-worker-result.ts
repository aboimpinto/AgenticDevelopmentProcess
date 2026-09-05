import type { DeepDiveQuestion } from "@hepha/shared";
import { parseGeneratedDeepDiveQuestions } from "../deep-dive/deep-dive-question-parser.js";

export type RefineFeatureWorkerResult =
  | Readonly<{ kind: "completed"; files: readonly string[]; summary: string }>
  | Readonly<{ kind: "needs_deep_dive"; questions: readonly DeepDiveQuestion[]; reason: string }>;

/** Parses the complete V1 result emitted by the RefineFeature worker. */
export function parseRefineFeatureWorkerResult(output: string): RefineFeatureWorkerResult {
  const normalized = stripMarkdownFence(output);
  let value: unknown;
  try {
    value = JSON.parse(normalized);
  } catch {
    throw invalidResult("response must be one JSON object with no commentary");
  }
  if (!isRecord(value) || typeof value.outcome !== "string") {
    throw invalidResult("outcome must be COMPLETED or NEEDS_DEEP_DIVE");
  }

  if (value.outcome === "COMPLETED") return parseCompleted(value);
  if (value.outcome === "NEEDS_DEEP_DIVE") return parseNeedsDeepDive(value);
  throw invalidResult(`unsupported outcome ${JSON.stringify(value.outcome)}`);
}

function parseCompleted(value: Record<string, unknown>): RefineFeatureWorkerResult {
  assertExactKeys(value, ["outcome", "summary", "files"], "COMPLETED");
  const summary = requiredText(value.summary, "COMPLETED.summary");
  if (!Array.isArray(value.files) || value.files.some((file) => typeof file !== "string" || !file || file !== file.trim())) {
    throw invalidResult("COMPLETED.files must be a non-empty array of relative artifact paths");
  }
  const files = value.files as string[];
  if (new Set(files).size !== files.length) {
    throw invalidResult("COMPLETED.files must not contain duplicate artifact paths");
  }
  if (files.some((file) => !isAllowedArtifactPath(file))) {
    throw invalidResult("COMPLETED.files contains an unsupported artifact path");
  }
  if (!hasRequiredArtifacts(files)) {
    throw invalidResult("COMPLETED.files must name FeatureTasks.md, planning-analysis-report.md, PhaseExecutionContract.json, ArchitectureDebtTouchPlan.json, and at least one Phases/phase-<number> Markdown document");
  }
  return { files, kind: "completed", summary };
}

function parseNeedsDeepDive(value: Record<string, unknown>): RefineFeatureWorkerResult {
  assertExactKeys(value, ["outcome", "reason", "questions"], "NEEDS_DEEP_DIVE");
  const reason = requiredText(value.reason, "NEEDS_DEEP_DIVE.reason");
  if (!Array.isArray(value.questions) || value.questions.length === 0 || value.questions.length > 8) {
    throw invalidResult("NEEDS_DEEP_DIVE.questions must contain between one and eight questions");
  }
  value.questions.forEach(assertRawQuestion);
  const questions = parseGeneratedDeepDiveQuestions(JSON.stringify({ questions: value.questions }));
  if (questions.length !== value.questions.length) {
    throw invalidResult("every Deep-Dive question requires a topic, prompt, recommended option, and three or four labelled options with descriptions");
  }
  return { kind: "needs_deep_dive", questions, reason };
}

function hasRequiredArtifacts(files: readonly string[]) {
  const names = new Set(files);
  return names.has("FeatureTasks.md") && names.has("planning-analysis-report.md") &&
    names.has("PhaseExecutionContract.json") && names.has("ArchitectureDebtTouchPlan.json") &&
    files.some((file) => /^Phases\/phase-[0-9]+(?:-[^/]+)?\.md$/.test(file));
}

function isAllowedArtifactPath(file: string) {
  return file === "FeatureTasks.md" || file === "planning-analysis-report.md" ||
    file === "PhaseExecutionContract.json" || file === "ArchitectureDebtTouchPlan.json" ||
    file === "ManualTestObligations.json" ||
    /^Phases\/phase-[0-9]+(?:-[^/]+)?\.md$/.test(file);
}

function assertRawQuestion(value: unknown, index: number) {
  if (!isRecord(value)) throw invalidResult(`NEEDS_DEEP_DIVE.questions[${index}] must be an object`);
  assertExactKeys(value, ["topic", "prompt", "recommendedOptionLabel", "options"], `NEEDS_DEEP_DIVE.questions[${index}]`);
  requiredText(value.topic, `NEEDS_DEEP_DIVE.questions[${index}].topic`);
  requiredText(value.prompt, `NEEDS_DEEP_DIVE.questions[${index}].prompt`);
  const recommendedLabel = requiredText(
    value.recommendedOptionLabel,
    `NEEDS_DEEP_DIVE.questions[${index}].recommendedOptionLabel`,
  );
  if (!Array.isArray(value.options) || value.options.length < 3 || value.options.length > 4) {
    throw invalidResult(`NEEDS_DEEP_DIVE.questions[${index}].options must contain three or four options`);
  }
  const optionLabels = value.options.map((option, optionIndex) => {
    if (!isRecord(option)) {
      throw invalidResult(`NEEDS_DEEP_DIVE.questions[${index}].options[${optionIndex}] must be an object`);
    }
    assertExactKeys(option, ["label", "description"], `NEEDS_DEEP_DIVE.questions[${index}].options[${optionIndex}]`);
    const label = requiredText(option.label, `NEEDS_DEEP_DIVE.questions[${index}].options[${optionIndex}].label`);
    requiredText(option.description, `NEEDS_DEEP_DIVE.questions[${index}].options[${optionIndex}].description`);
    return label.toLowerCase();
  });
  if (!optionLabels.includes(recommendedLabel.toLowerCase())) {
    throw invalidResult(`NEEDS_DEEP_DIVE.questions[${index}].recommendedOptionLabel must match an option label`);
  }
}

function assertExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[], field: string) {
  const actualKeys = Object.keys(value);
  const unexpected = actualKeys.filter((key) => !expectedKeys.includes(key));
  const missing = expectedKeys.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (unexpected.length > 0 || missing.length > 0) {
    throw invalidResult(`${field} must contain exactly ${expectedKeys.join(", ")}`);
  }
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw invalidResult(`${field} must be a non-empty string`);
  return value.trim();
}

function stripMarkdownFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalidResult(detail: string) {
  return new Error(`REFINE_FEATURE_RESULT_V1_INVALID: ${detail}.`);
}
