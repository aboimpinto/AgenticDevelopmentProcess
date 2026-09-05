import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { StoredDeepDiveSession } from "@hepha/db";
import type { DeepDiveQuestion, WorkItemCard } from "@hepha/shared";
import { sanitizeValidationMarkerReferences } from "../../work-item-validation.js";
import type { PiPromptRunOptions } from "../../runtime/pi/pi-argument-builder.js";

interface DeepDiveDocumentUpdaterDependencies {
  maxModelRewriteCharacters: number;
  now?: () => Date;
  runPrompt(prompt: string, plan: import("@hepha/shared").HandoffPlanV1, options?: PiPromptRunOptions): Promise<string>;
  sessionDirectory: string;
  timeoutMs: number;
  warn?: (message: string, error: unknown) => void;
}

export class DeepDiveDocumentUpdater {
  constructor(private readonly dependencies: DeepDiveDocumentUpdaterDependencies) {}

  async update(
    session: StoredDeepDiveSession,
    questions: DeepDiveQuestion[],
    options: { cwd?: string; plan: import("@hepha/shared").HandoffPlanV1; preparationContext?: string; workflowRunId?: string },
  ): Promise<string> {
    if (session.originalDocument.length > this.dependencies.maxModelRewriteCharacters) {
      return createDeterministicDeepDiveDocumentUpdate(
        session,
        questions,
        new Error(
          `Source document is ${session.originalDocument.length} characters; deterministic update is used above ${this.dependencies.maxModelRewriteCharacters} characters.`,
        ),
        this.dependencies.now,
      );
    }

    try {
      const output = await this.dependencies.runPrompt(
        buildDeepDiveDocumentUpdatePrompt(session, questions, options.preparationContext),
        options.plan,
        {
          cwd: options.cwd,
          implementationProfile: true,
          sessionFile: resolve(
            this.dependencies.sessionDirectory,
            `${options.workflowRunId ?? `deep-dive-${randomUUID()}`}-deep-dive-document-update.json`,
          ),
          timeoutLabel: "Deep-Dive document update Pi run",
          timeoutMs: this.dependencies.timeoutMs,
          workflowRunId: options.workflowRunId,
        },
      );

      return cleanResolvedValidationMarkerText(stripMarkdownFence(output));
    } catch (error) {
      this.dependencies.warn?.(
        "Deep-dive document update agent unavailable; falling back to deterministic document update.",
        error,
      );
      return createDeterministicDeepDiveDocumentUpdate(session, questions, error, this.dependencies.now);
    }
  }
}

export function createDeterministicDeepDiveDocumentUpdate(
  session: StoredDeepDiveSession,
  questions: DeepDiveQuestion[],
  error: unknown,
  now: () => Date = () => new Date(),
) {
  const originalMarkdown = cleanResolvedValidationMarkerText(session.originalDocument)
    .replace(/\[NEEDS VALIDATION\]/gi, "")
    .replace(/[ \t]+$/gm, "")
    .trimEnd();
  const decisionSection = renderHephaDeepDiveDecisionSection(session, questions, error, now);

  return `${upsertMarkdownSection(originalMarkdown, "Hepha Deep-Dive Decisions", decisionSection).trimEnd()}\n`;
}

export function renderHephaDeepDiveDecisionSection(
  _session: StoredDeepDiveSession,
  questions: DeepDiveQuestion[],
  error: unknown,
  now: () => Date = () => new Date(),
) {
  const fallbackReason = error instanceof Error ? error.message : String(error);
  const lines = [
    "## Hepha Deep-Dive Decisions",
    "",
    `Recorded: ${now().toISOString()}`,
    "",
    "Hepha applied these saved Deep-Dive answers directly because the full-document model rewrite did not finish.",
    `Fallback reason: ${fallbackReason}`,
    "",
  ];

  for (const question of questions) {
    const selectedOption = question.options.find((option) => option.id === question.selectedOptionId) ?? null;
    const topic = sanitizeValidationMarkerReferences(question.topic);
    const prompt = sanitizeValidationMarkerReferences(question.prompt.replace(/\s+/g, " ").trim());
    const selectedOptionLabel = selectedOption ? sanitizeValidationMarkerReferences(selectedOption.label) : null;
    const selectedOptionDescription = selectedOption
      ? sanitizeValidationMarkerReferences(selectedOption.description)
      : null;

    lines.push(
      `### ${topic}`,
      "",
      `Question: ${prompt}`,
      "",
      selectedOptionLabel && selectedOptionDescription
        ? `Decision: **${selectedOptionLabel}** - ${selectedOptionDescription}`
        : "Decision: No option selected.",
    );

    if (question.answerText?.trim()) {
      lines.push("", `Additional detail: ${sanitizeValidationMarkerReferences(question.answerText.trim())}`);
    }

    const chatNotes = question.chatMessages
      .filter((message) => message.content.trim())
      .map(
        (message) =>
          `- ${message.role}: ${sanitizeValidationMarkerReferences(
            truncateText(message.content.replace(/\s+/g, " ").trim(), 500),
          )}`,
      );

    if (chatNotes.length > 0) lines.push("", "Chat notes:", ...chatNotes);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function upsertMarkdownSection(markdown: string, heading: string, section: string) {
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "im");
  const headingMatch = headingPattern.exec(markdown);

  if (!headingMatch) return `${markdown.trimEnd()}\n\n${section.trimEnd()}`;

  const afterHeadingIndex = headingMatch.index + headingMatch[0].length;
  const nextHeadingMatch = /^##\s+/m.exec(markdown.slice(afterHeadingIndex));
  const sectionEndIndex = nextHeadingMatch?.index === undefined
    ? markdown.length
    : afterHeadingIndex + nextHeadingMatch.index;

  return `${markdown.slice(0, headingMatch.index).trimEnd()}\n\n${section.trimEnd()}\n\n${markdown
    .slice(sectionEndIndex)
    .trimStart()}`.trimEnd();
}

export function buildDeepDiveDocumentUpdatePrompt(
  session: StoredDeepDiveSession,
  questions: DeepDiveQuestion[],
  preparationContext?: string,
) {
  const itemLabel = formatWorkItemKind(session.cardKind as WorkItemCard["kind"]);
  const processLabel = session.cardKind === "epic"
    ? "FEAT extraction"
    : "feature refinement, design decisions, and implementation planning";

  return [
    `Use the deep-dive skill for HEPHA ${session.cardExternalId} to apply the saved Deep-Dive answers to ${itemLabel} documentation.`,
    "This is Deep-Dive stage 2 only. Do not generate a new question round.",
    `Rewrite the ${itemLabel} Markdown using the original document plus the answered deep-dive transcript.`,
    "Return only the complete updated Markdown document. Do not include commentary, explanations, or code fences.",
    "Preserve useful existing sections, links, tables, and Mermaid diagrams.",
    "Use every authoritative preparation document below as context so the updated source does not contradict design evidence.",
    "The returned Markdown is the primary source document; preserve design-derived decisions that remain valid.",
    "Resolve or remove [NEEDS VALIDATION] markers using the decisions below.",
    "When a marker is resolved, remove the literal [NEEDS VALIDATION] token entirely. Do not write status sentences that include that token.",
    "Write every decision with sufficient boundaries and acceptance behavior that an autonomous developer can execute deterministically.",
    "The updated target must not require future human sign-off, owner attestation, CODEOWNER approval, product/technical choice, or manual phase acceptance.",
    "If the transcript delegates decisions to the autonomous developer, record the deterministic evidence hierarchy/default rule and never create a future approval task.",
    `Make the document ready for ${processLabel}.`,
    "",
    `Original ${itemLabel} document:`,
    "```markdown",
    session.originalDocument,
    "```",
    ...(preparationContext && preparationContext !== session.originalDocument
      ? [
          "",
          "Authoritative preparation context (Feature Description plus any design documents):",
          "```markdown",
          preparationContext,
          "```",
        ]
      : []),
    "",
    "Deep-dive transcript:",
    ...questions.flatMap((question) => [
      `Topic: ${question.topic}`,
      `Question: ${question.prompt}`,
      `Selected option: ${question.options.find((option) => option.id === question.selectedOptionId)?.label ?? "N/A"}`,
      `Selected option detail: ${question.options.find((option) => option.id === question.selectedOptionId)?.description ?? "N/A"}`,
      `Additional user detail: ${question.answerText ?? ""}`,
      "Chat:",
      ...question.chatMessages.map((message) => `- ${message.role}: ${message.content}`),
      "",
    ]),
  ].join("\n");
}

export function stripMarkdownFence(value: string) {
  return value.trim().replace(/^```(?:markdown)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

export function cleanResolvedValidationMarkerText(markdown: string) {
  return markdown.replace(
    /\b(No|None|Without)\b([^.\r\n]*?)\[NEEDS VALIDATION\]([^.\r\n]*?\bmarkers?\b\.?)/gi,
    (_match, prefix, before, after) => `${prefix.toLowerCase() === "without" ? "Without" : "No"}${before}validation${after}`,
  );
}

function formatWorkItemKind(kind: WorkItemCard["kind"]) {
  return kind === "epic" ? "EPIC" : "FEAT";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function truncateText(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}
