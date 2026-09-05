import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { EpicRefinementSummary } from "@hepha/shared";

export interface ParsedEpicRefinement {
  changedSections: string[];
  markdown: string;
  summary: string;
}

export function buildEpicRefinementPrompt({
  currentMarkdown,
  epicId,
  previousRefinements,
  request,
  title,
}: {
  currentMarkdown: string;
  epicId: string;
  previousRefinements: EpicRefinementSummary[];
  request: string;
  title: string;
}) {
  return [
    "You are the Hepha EPIC Refinement Agent.",
    "Update one MemoryBank EpicDescription.md from a user refinement request.",
    "",
    "Goal:",
    "- Preserve the existing EPIC structure and intent.",
    "- Add the requested information in the correct section instead of appending loose notes.",
    "- Support requests that add FEATs, clarify FEAT details, add success criteria, adjust risks, or improve acceptance details.",
    "- Keep existing EPIC ID, title, State, Status, Created date, and project metadata unless the request explicitly asks to change non-ID wording.",
    "- Preserve Mermaid code fences and update diagrams only when the request changes feature relationships.",
    "- Preserve already completed/in-progress feature references and progress tables.",
    "",
    "Return JSON only. Do not include Markdown fences around the JSON.",
    "",
    "JSON shape:",
    "{",
    '  "summary": "one sentence summary of the requested refinement and resulting document change",',
    '  "changedSections": ["section heading"],',
    '  "markdown": "complete updated EpicDescription.md markdown"',
    "}",
    "",
    "Rules:",
    "- The markdown field must be the full updated document, not a patch.",
    "- Do not create a new EPIC.",
    "- Do not remove existing sections.",
    "- Do not add a refinement history section to the markdown; Hepha stores the history separately.",
    "- Mark unsupported assumptions with [NEEDS VALIDATION].",
    "- If the request asks to add FEATs, add TBD rows/details while preserving existing FEAT IDs and status.",
    "- If the request asks for acceptance criteria, add them under Success Criteria or the relevant Feature Details.",
    "- Keep markdown tables valid.",
    "",
    `EPIC: ${epicId}: ${title}`,
    "",
    "Previous refinement summaries:",
    previousRefinements.length > 0
      ? previousRefinements.map((refinement) => `- ${refinement.summary}`).join("\n")
      : "- none",
    "",
    "User refinement request:",
    "```text",
    request,
    "```",
    "",
    "Current EpicDescription.md:",
    "```markdown",
    currentMarkdown,
    "```",
  ].join("\n");
}

export function parseEpicRefinementResponse(output: string, fallbackMarkdown: string): ParsedEpicRefinement {
  const jsonText = extractJsonPayload(stripMarkdownFence(output));

  if (!jsonText) {
    throw new Error("EPIC refinement response did not include JSON.");
  }

  const parsed = JSON.parse(jsonText) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("EPIC refinement response JSON must be an object.");
  }

  const raw = parsed as Record<string, unknown>;
  const markdown = cleanMarkdown(readString(raw.markdown));
  const summary = cleanSingleLine(readString(raw.summary));
  const changedSections = readStringArray(raw.changedSections ?? raw.changed_sections);

  if (!markdown) {
    throw new Error("EPIC refinement response did not include updated markdown.");
  }

  if (!/^#\s+EPIC-\d+/m.test(markdown)) {
    throw new Error("EPIC refinement markdown must keep the EPIC heading.");
  }

  return {
    changedSections: changedSections.length > 0 ? changedSections : ["EpicDescription.md"],
    markdown: markdown.endsWith("\n") ? markdown : `${markdown}\n`,
    summary: summary || summarizeMarkdownChange(fallbackMarkdown, markdown),
  };
}

export function readEpicRefinementHistory(epicFolderPath: string): EpicRefinementSummary[] {
  const historyPath = getEpicRefinementHistoryPath(epicFolderPath);

  if (!existsSync(historyPath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(historyPath, "utf8")) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeHistoryEntry)
      .filter((entry): entry is EpicRefinementSummary => Boolean(entry))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  } catch {
    return [];
  }
}

export function appendEpicRefinementHistory(epicFolderPath: string, refinement: EpicRefinementSummary) {
  const historyPath = getEpicRefinementHistoryPath(epicFolderPath);
  const history = [...readEpicRefinementHistory(epicFolderPath), refinement];

  mkdirSync(dirname(historyPath), { recursive: true });
  writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`, "utf8");

  return historyPath;
}

export function getEpicRefinementHistoryPath(epicFolderPath: string) {
  return resolve(epicFolderPath, ".hepha", "epic-refinements.json");
}

function normalizeHistoryEntry(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const id = cleanSingleLine(readString(raw.id));
  const createdAt = cleanSingleLine(readString(raw.createdAt));
  const request = cleanMultiline(readString(raw.request));
  const summary = cleanSingleLine(readString(raw.summary));

  if (!id || !createdAt || !request || !summary) {
    return null;
  }

  return {
    changedSections: readStringArray(raw.changedSections),
    createdAt,
    id,
    request,
    summary,
  } satisfies EpicRefinementSummary;
}

function summarizeMarkdownChange(previousMarkdown: string, nextMarkdown: string) {
  return previousMarkdown === nextMarkdown
    ? "No EPIC document changes were made."
    : "Updated the EPIC description with the requested refinement.";
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown) {
  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map(cleanSingleLine)
      .filter(Boolean)
      .slice(0, 12);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => cleanSingleLine(readString(entry))).filter(Boolean).slice(0, 12);
}

function cleanSingleLine(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

function cleanMultiline(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim().slice(0, 8000);
}

function cleanMarkdown(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

function stripMarkdownFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonPayload(value: string) {
  const objectStart = value.indexOf("{");
  const objectEnd = value.lastIndexOf("}");

  if (objectStart >= 0 && objectEnd > objectStart) {
    return value.slice(objectStart, objectEnd + 1);
  }

  return null;
}
