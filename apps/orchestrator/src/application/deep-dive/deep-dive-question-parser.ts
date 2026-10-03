import type { DeepDiveQuestion } from "@hepha/shared";

/** Hosted JSON cannot silently turn a malformed question into interview closure. */
export function parseHostedDeepDiveQuestions(output: string): DeepDiveQuestion[] {
  let parsed: unknown;
  try { parsed = JSON.parse(output); } catch { throw new Error("MCP_DEEP_DIVE_QUESTIONS_INVALID"); }
  const questions = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).questions : undefined;
  if (!Array.isArray(questions) || questions.length > 1) throw new Error("MCP_DEEP_DIVE_QUESTIONS_INVALID");
  const normalized = parseGeneratedDeepDiveQuestions(output);
  if (normalized.length !== questions.length || questions.some(question => {
    const options = question?.options;
    return !Array.isArray(options) || options.length < 3 || options.length > 4
      || options.some(option => !option || typeof option.label !== "string" || !option.label.trim()
        || typeof option.description !== "string" || !option.description.trim())
      || !options.some(option => option.label === question.recommendedOptionLabel);
  })) throw new Error("MCP_DEEP_DIVE_QUESTIONS_INVALID");
  return normalized;
}

export function parseGeneratedDeepDiveQuestions(output: string): DeepDiveQuestion[] {
  const normalizedOutput = stripMarkdownFence(output);
  const jsonStart = normalizedOutput.indexOf("{");
  const jsonEnd = normalizedOutput.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return [];

  const parsed = JSON.parse(normalizedOutput.slice(jsonStart, jsonEnd + 1)) as unknown;
  const rawQuestions = parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).questions)
    ? (parsed as Record<string, unknown>).questions as unknown[]
    : [];

  return rawQuestions
    .map(normalizeQuestion)
    .filter((question): question is DeepDiveQuestion => Boolean(question));
}

function normalizeQuestion(value: unknown, index: number): DeepDiveQuestion | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const topic = typeof raw.topic === "string" ? raw.topic.trim() : "";
  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  if (!topic || !prompt || !Array.isArray(raw.options)) return null;

  const options = raw.options
    .map(normalizeOption)
    .filter((option): option is DeepDiveQuestion["options"][number] => Boolean(option))
    .slice(0, 4);
  if (options.length < 3) return null;

  return {
    answerText: null,
    chatMessages: [],
    id: `q-${index + 1}`,
    options,
    prompt,
    recommendedOptionId: getRecommendedOptionId(raw, options),
    selectedOptionId: null,
    status: "pending",
    topic,
  };
}

function getRecommendedOptionId(
  rawQuestion: Record<string, unknown>,
  options: DeepDiveQuestion["options"],
): string | null {
  const recommendedLabel = typeof rawQuestion.recommendedOptionLabel === "string"
    ? rawQuestion.recommendedOptionLabel.trim().toLowerCase()
    : "";
  return options.find((option) => option.label.trim().toLowerCase() === recommendedLabel)?.id
    ?? options[0]?.id
    ?? null;
}

function normalizeOption(value: unknown, index: number): DeepDiveQuestion["options"][number] | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (!label || !description) return null;
  return { description, id: `option-${index + 1}-${slugify(label)}`, label };
}

function stripMarkdownFence(value: string): string {
  return value.trim().replace(/^```(?:markdown)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "option";
}
