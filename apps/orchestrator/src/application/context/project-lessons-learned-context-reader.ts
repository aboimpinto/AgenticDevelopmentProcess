import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";
import type { PhaseSummary } from "@hepha/shared";
import { detectProjectStack } from "../../projects/project-summary.js";
import type { StoredProject } from "../../projects/stored-project.js";

export interface ProjectLessonsLearnedContextOptions {
  agentRole?: string | null;
  maxActiveDocuments?: number;
  maxDocuments?: number;
  phase?: Pick<PhaseSummary, "number" | "title"> | null;
}

export interface ProjectLessonFocus {
  displayKeywords: string[];
  keywords: string[];
}

interface ProjectLessonDocument {
  content: string;
  path: string;
  score: number;
}

export class ProjectLessonsLearnedContextReader {
  render(project: StoredProject, options: ProjectLessonsLearnedContextOptions = {}) {
    const lessonsRoot = resolve(project.memoryBankPath, "LessonsLearned");
    const focus = createProjectLessonsLearnedFocus(project, options);
    const activeDocuments = collectProjectActiveLessonDocuments(
      project,
      lessonsRoot,
      focus,
      options.maxActiveDocuments ?? 5,
    );
    const rawDocuments = collectProjectLessonsLearnedDocuments(
      project,
      lessonsRoot,
      focus,
      options.maxDocuments ?? 8,
    );
    const documents = [...activeDocuments, ...rawDocuments];
    const selectedActivePaths = new Set(activeDocuments.map((document) => document.path));
    const availableActivePaths = listProjectActiveLessonPaths(project, lessonsRoot);
    const omittedActivePaths = availableActivePaths.filter((path) => !selectedActivePaths.has(path));
    const lines = [
      "## Project LessonsLearned Context",
      "",
      `MemoryBank LessonsLearned path: ${lessonsRoot}`,
      "Mandatory use: before changing code, read the selected active rule summaries as executable project rules. Previous code-review suggestions are prevention rules, not historical notes.",
      `Detected lesson focus: ${focus.displayKeywords.length > 0 ? focus.displayKeywords.join(", ") : "general project lessons"}.`,
    ];

    if (documents.length === 0) {
      lines.push("", "No LessonsLearned documents found.");
      return lines.join("\n");
    }

    const activeRules = collectProjectLessonActiveRules(documents, focus);

    if (activeDocuments.length > 0) {
      lines.push(
        "",
        "### Active Rule Documents Selected For This Run",
        "",
        ...activeDocuments.map((document) => `- ${document.path}`),
      );

      if (omittedActivePaths.length > 0) {
        lines.push(
          "",
          `Active rule documents omitted for this focus: ${omittedActivePaths.join(", ")}`,
        );
      }
    }

    if (activeRules.length > 0) {
      lines.push("", "### Active Rules Selected For This Run", "", ...activeRules.map((rule) => `- ${rule}`));
    }

    if (rawDocuments.length > 0) {
      lines.push(
        "",
        "### Raw LessonsLearned Source Documents",
        "",
        "Raw lesson documents are fallback audit context. Apply selected Active rule documents first.",
      );
    } else if (activeDocuments.length > 0) {
      lines.push("", "### Source Documents");
    }

    for (const document of documents) {
      lines.push("", `#### ${document.path}`, "```markdown", document.content, "```");
    }

    return lines.join("\n");
  }
}

export function createProjectLessonsLearnedFocus(
  project: StoredProject,
  options: ProjectLessonsLearnedContextOptions,
): ProjectLessonFocus {
  const context = [
    detectProjectStack(project.rootPath).join(" "),
    options.agentRole ?? "",
    options.phase ? `Phase ${options.phase.number} ${options.phase.title}` : "",
    safeReadDirectory(project.rootPath).slice(0, 80).join(" "),
  ]
    .join(" ")
    .toLowerCase();
  const keywords = new Set([
    "code review",
    "code-review",
    "review finding",
    "review feedback",
    "review suggestions",
    "gemini",
    "prevention",
    "prevent",
    "lessonslearned",
  ]);

  const contextTerms = extractLessonFocusTerms(context);

  for (const term of contextTerms) {
    keywords.add(term);
  }

  return {
    displayKeywords: ["code-review lessons", ...contextTerms.slice(0, 12)],
    keywords: [...keywords],
  };
}

export function extractLessonFocusTerms(text: string) {
  const stopWords = new Set([
    "agent",
    "and",
    "app",
    "apps",
    "bin",
    "build",
    "dev",
    "dist",
    "docs",
    "for",
    "lib",
    "node_modules",
    "package",
    "phase",
    "project",
    "src",
    "test",
    "tests",
    "the",
    "tmp",
    "with",
  ]);
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const match of text.matchAll(/[a-z][a-z0-9+#.-]{1,}/gi)) {
    const term = match[0].toLowerCase().replace(/^[.-]+|[.-]+$/g, "");

    if (!term || stopWords.has(term) || seen.has(term)) {
      continue;
    }

    seen.add(term);
    terms.push(term);
  }

  return terms;
}

function listProjectActiveLessonPaths(project: StoredProject, lessonsRoot: string) {
  const activeRoot = resolve(lessonsRoot, "Active");

  if (!existsSync(activeRoot) || !safeIsDirectory(activeRoot)) {
    return [];
  }

  return listMarkdownFiles(activeRoot, 40)
    .map((path) => normalizeRelativePath(project.rootPath, path))
    .sort((left, right) => left.localeCompare(right));
}

function collectProjectActiveLessonDocuments(
  project: StoredProject,
  lessonsRoot: string,
  focus: ProjectLessonFocus,
  maxDocuments: number,
) {
  const activeRoot = resolve(lessonsRoot, "Active");

  if (maxDocuments <= 0 || !existsSync(activeRoot) || !safeIsDirectory(activeRoot)) {
    return [];
  }

  const documents = listMarkdownFiles(activeRoot, 40)
    .map((path) => {
      const content = readDocumentSnippet(path, 14000);
      const relativePath = normalizeRelativePath(project.rootPath, path);
      const fileName = basename(path).toLowerCase();
      const score = scoreProjectActiveLessonDocument(fileName, `${relativePath}\n${content}`, focus);

      return { content, path: relativePath, score } satisfies ProjectLessonDocument;
    })
    .filter((document) => document.content.trim().length > 0 && document.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));

  const selected = new Map<string, ProjectLessonDocument>();
  const common = documents.find((document) => basename(document.path).toLowerCase() === "common.md");

  if (common) {
    selected.set(common.path, common);
  }

  for (const document of documents) {
    if (selected.size >= maxDocuments) {
      break;
    }

    selected.set(document.path, document);
  }

  return [...selected.values()];
}

export function scoreProjectActiveLessonDocument(
  fileName: string,
  text: string,
  focus: ProjectLessonFocus,
) {
  const normalized = text.toLowerCase();
  const focusText = focus.keywords.join(" ");
  let score = scoreProjectLessonText(text, focus);

  if (fileName === "common.md") {
    score += 80;
  }

  if (fileName === "index.md") {
    return 0;
  }

  if (fileName === "memorybank-docs.md" && hasAnyLessonFocus(focusText, [
    "deep-dive", "design", "refine", "start", "continue", "complete", "final", "verification",
    "review", "recovery", "phase", "memorybank", "documentation", "docs",
  ])) {
    score += 45;
  }

  if (fileName === "code-review-recovery.md" && hasAnyLessonFocus(focusText, [
    "code-review", "review", "recovery", "continue", "complete", "finding", "needs", "changes",
  ])) {
    score += 45;
  }

  if (fileName === "rust.md" && hasAnyLessonFocus(`${focusText} ${normalized}`, [
    "rust", "cargo", "crate", "module", "mod", "command", "codewhale", "tui",
  ])) {
    score += 40;
  }

  if (fileName === "rust-cargo.md" && hasAnyLessonFocus(`${focusText} ${normalized}`, [
    "rust", "cargo", "test", "tests", "check", "build", "clippy", "fmt", "format", "verification",
    "validate", "complete", "final",
  ])) {
    score += 40;
  }

  if (fileName === "codewhale-command-extraction.md" && hasAnyLessonFocus(`${focusText} ${normalized}`, [
    "codewhale", "command", "commands", "extraction", "layer", "core", "session", "palette",
    "completion", "tui",
  ])) {
    score += 40;
  }

  return score;
}

function hasAnyLessonFocus(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function collectProjectLessonsLearnedDocuments(
  project: StoredProject,
  lessonsRoot: string,
  focus: ProjectLessonFocus,
  maxDocuments: number,
) {
  if (!existsSync(lessonsRoot) || !safeIsDirectory(lessonsRoot)) {
    return [];
  }

  const activeRoot = resolve(lessonsRoot, "Active");

  return listMarkdownFiles(lessonsRoot, 80)
    .filter((path) => !isPathInsideDirectory(path, activeRoot))
    .map((path) => {
      const content = readDocumentSnippet(path, 7000);

      return {
        content,
        path: normalizeRelativePath(project.rootPath, path),
        score: scoreProjectLessonText(`${path}\n${content}`, focus),
      } satisfies ProjectLessonDocument;
    })
    .filter((document) => document.content.trim().length > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, maxDocuments);
}

export function isPathInsideDirectory(path: string, directory: string) {
  const relativePath = relative(directory, path);

  return Boolean(relativePath) && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

function collectProjectLessonActiveRules(documents: ProjectLessonDocument[], focus: ProjectLessonFocus) {
  const rules: Array<{ line: string; score: number; source: string }> = [];

  for (const document of documents) {
    for (const rawLine of document.content.split(/\r?\n/)) {
      const line = normalizeLessonRuleLine(rawLine);

      if (!isLessonRuleLine(line)) {
        continue;
      }

      rules.push({
        line,
        score: document.score + scoreProjectLessonText(line, focus),
        source: document.path,
      });
    }
  }

  const seen = new Set<string>();

  return rules
    .sort((left, right) => right.score - left.score || left.source.localeCompare(right.source))
    .filter((rule) => {
      const key = `${rule.source}\0${rule.line.toLowerCase()}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, 24)
    .map((rule) => `${rule.source}: ${rule.line}`);
}

export function normalizeLessonRuleLine(line: string) {
  return line
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/\s+/g, " ");
}

export function isLessonRuleLine(line: string) {
  if (/^Rule:\s+/i.test(line)) {
    return true;
  }

  if (line.length < 24 || line.startsWith("```") || /^#+\s/.test(line)) {
    return false;
  }

  return /\b(prevention|prevent|rule|must|never|avoid|do not|don't|required|require|should|validate|code review|review finding|run exactly one)\b/i.test(
    line,
  );
}

export function scoreProjectLessonText(text: string, focus: ProjectLessonFocus) {
  const normalized = text.toLowerCase();
  let score = 0;

  for (const keyword of focus.keywords) {
    if (normalized.includes(keyword.toLowerCase())) {
      score += 3;
    }
  }

  if (/\b(code[- ]review|review finding|review feedback|gemini)\b/i.test(text)) {
    score += 5;
  }

  if (/\b(prevention|prevent|rule|must|never|do not|avoid|required)\b/i.test(text)) {
    score += 2;
  }

  return score;
}

function listMarkdownFiles(rootPath: string, maxFiles: number) {
  const results: string[] = [];
  const queue = [rootPath];

  while (queue.length > 0 && results.length < maxFiles) {
    const currentPath = queue.shift()!;

    for (const entry of safeReadDirectory(currentPath)) {
      const entryPath = resolve(currentPath, entry);

      if (safeIsDirectory(entryPath)) {
        queue.push(entryPath);
      } else if (/\.md$/i.test(entry)) {
        results.push(entryPath);
      }

      if (results.length >= maxFiles) {
        break;
      }
    }
  }

  return results;
}

function readDocumentSnippet(path: string, maxLength: number) {
  try {
    const content = readFileSync(path, "utf8").trim();
    return content.length <= maxLength ? content : `${content.slice(0, maxLength - 1)}...`;
  } catch {
    return "";
  }
}

function safeReadDirectory(path: string) {
  try {
    return existsSync(path) ? readdirSync(path) : [];
  } catch {
    return [];
  }
}

function safeIsDirectory(path: string) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function normalizeRelativePath(fromPath: string, toPath: string) {
  const relativePath = relative(fromPath, toPath);

  return relativePath && !relativePath.startsWith("..") ? relativePath.replaceAll("\\", "/") : toPath;
}
