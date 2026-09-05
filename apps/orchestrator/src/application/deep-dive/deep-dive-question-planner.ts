import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { DeepDiveQuestion, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import type { PiPromptRunOptions } from "../../runtime/pi/pi-argument-builder.js";
import { parseGeneratedDeepDiveQuestions } from "./deep-dive-question-parser.js";
import type { DeepDivePreparationSource } from "./deep-dive-preparation-source.js";

interface DeepDiveQuestionPlannerDependencies {
  renderLessons(project: StoredProject): string;
  runPrompt(prompt: string, plan: import("@hepha/shared").HandoffPlanV1, options?: PiPromptRunOptions): Promise<string>;
  sessionDirectory: string;
  stallTimeoutMs: number;
  warn?: (message: string, error: unknown) => void;
}

export class DeepDiveQuestionPlanner {
  constructor(private readonly dependencies: DeepDiveQuestionPlannerDependencies) {}

  async create(
    project: StoredProject,
    item: WorkItemCard,
    options: { plan: import("@hepha/shared").HandoffPlanV1; preparationSource?: DeepDivePreparationSource; workflowRunId?: string },
  ): Promise<DeepDiveQuestion[]> {
    const sourceMarkdown = options.preparationSource?.promptMarkdown ?? item.specMarkdown;
    const validationTopics = extractNeedsValidationTopics(sourceMarkdown);

    try {
      const generatedQuestions = parseGeneratedDeepDiveQuestions(
        await this.dependencies.runPrompt(
          buildDeepDiveQuestionPrompt(
            item,
            validationTopics,
            this.dependencies.renderLessons(project),
            options.preparationSource,
          ),
          options.plan,
          {
            cwd: project.rootPath,
            implementationProfile: true,
            sessionFile: resolve(
              this.dependencies.sessionDirectory,
              `${options.workflowRunId ?? `deep-dive-${randomUUID()}`}-deep-dive-questions.json`,
            ),
            maxRuntimeMs: null,
            stallTimeoutMs: this.dependencies.stallTimeoutMs,
            timeoutLabel: "Deep-Dive question Pi run",
            workflowRunId: options.workflowRunId,
          },
        ),
      );

      if (generatedQuestions.length === 1) return generatedQuestions;
      if (generatedQuestions.length > 1) {
        throw new Error("Adaptive Deep-Dive opening generation must return exactly one question.");
      }
      throw new Error("Deep-Dive question generation returned no valid questions.");
    } catch (error) {
      this.dependencies.warn?.(
        "Deep-Dive question generation failed; no synthetic question round was substituted.",
        error,
      );
      throw error;
    }
  }
}

export function buildDeepDiveQuestionPrompt(
  item: WorkItemCard,
  validationTopics: Array<{ detail: string; heading: string }>,
  lessonsContext: string,
  preparationSource?: DeepDivePreparationSource,
) {
  const itemLabel = formatWorkItemKind(item.kind);
  const readinessGoal = item.kind === "epic"
    ? "FEAT extraction"
    : "feature refinement, design decisions, and implementation planning";

  return [
    `Prepare the opening adaptive Deep-Dive question for HEPHA ${item.externalId}.`,
    "This is Deep-Dive stage 1 only. Do not update files, ask interactively, invoke another command, or record completion.",
    `Analyze the ${itemLabel} document and choose the single highest-priority unresolved decision before ${readinessGoal} can proceed.`,
    "Return JSON only. Do not include Markdown fences or commentary.",
    "",
    "JSON shape:",
    "{",
    '  "questions": [',
    "    {",
    '      "topic": "short topic name",',
    '      "prompt": "clear question for the user",',
    '      "recommendedOptionLabel": "exact label of the option you recommend",',
    '      "options": [',
    '        { "label": "short option", "description": "decision consequence" }',
    "      ]",
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- Return exactly one opening question in the questions array.",
    "- When validation markers exist, choose the highest-risk unresolved marker as the opening; later adaptive turns will continue coverage.",
    `- Use the opening to begin closure of every unresolved target decision needed for ${readinessGoal}; total interview length has no arbitrary limit.`,
    "- Do not defer decisions to refinement, implementation, human sign-off, owner attestation, CODEOWNER approval, or manual phase acceptance.",
    "- For a FEAT, cover every product, technical, security, compatibility, ownership, edge-case, and acceptance decision an autonomous developer needs to execute deterministically.",
    "- If the user delegates a decision class to the autonomous developer, ask for and record a deterministic decision rule rather than a future approval gate.",
    "- Each question must have 3 or 4 mutually exclusive options.",
    "- Options must be actionable decisions, not generic yes/no labels.",
    "- Include recommendedOptionLabel for the option you think is best.",
    "- Use Project LessonsLearned context to ask questions that prevent repeated planning or implementation failure patterns.",
    "- Keep prompts concise and specific to the authoritative preparation documents.",
    "- Identify contradictions and unresolved decisions across the Feature Description and design documents.",
    "",
    lessonsContext,
    "",
    `Work item: ${item.externalId} - ${item.title}`,
    `Type: ${item.kind}`,
    "",
    "Detected validation topics:",
    validationTopics.length > 0
      ? validationTopics.map((topic) => `- ${topic.heading}: ${topic.detail}`).join("\n")
      : "- none",
    "",
    preparationSource && preparationSource.documents.length > 1
      ? "Authoritative preparation documents:"
      : "Source document:",
    "```markdown",
    preparationSource?.promptMarkdown ?? item.specMarkdown,
    "```",
  ].join("\n");
}

export function extractNeedsValidationTopics(markdown: string) {
  const topics: Array<{ detail: string; heading: string }> = [];
  const lines = markdown.split(/\r?\n/);
  let currentHeading = "Uncategorized";

  for (const line of lines) {
    const heading = line.match(/^(#{2,4})\s+(.+)/);
    if (heading?.[2]) currentHeading = cleanInlineMarkdown(heading[2]);
    if (!/\[NEEDS VALIDATION\]/i.test(line)) continue;
    topics.push({
      detail: cleanInlineMarkdown(line.replace(/\[NEEDS VALIDATION\]/gi, "")).replace(/^[-*]\s*/, ""),
      heading: currentHeading,
    });
  }

  return topics;
}

function cleanInlineMarkdown(value: string) {
  return value
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/_/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
}

function formatWorkItemKind(kind: WorkItemCard["kind"]) {
  return kind === "epic" ? "EPIC" : "FEAT";
}
