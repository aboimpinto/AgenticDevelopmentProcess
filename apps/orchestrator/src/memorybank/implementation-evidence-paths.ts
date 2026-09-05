import { relative, resolve } from "node:path";
import type { StoredProject } from "../projects/stored-project.js";
import { cleanInlineMarkdown, extractMarkdownSection } from "./markdown-parsing.js";

export function extractChangedFileEvidencePaths(markdown: string) {
  const paths = new Set<string>();
  let collectingChangedSection = false;
  let changedSectionLevel = 0;

  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);

    if (heading?.[1] && heading[2]) {
      const headingLevel = heading[1].length;
      const headingText = cleanInlineMarkdown(heading[2]);

      collectingChangedSection = isChangedFileEvidenceHeading(headingText);
      changedSectionLevel = collectingChangedSection ? headingLevel : 0;
      continue;
    }

    if (
      collectingChangedSection &&
      changedSectionLevel > 0 &&
      /^#{1,6}\s+/.test(line)
    ) {
      collectingChangedSection = false;
      changedSectionLevel = 0;
    }

    if (!collectingChangedSection && !isChangedFileEvidenceLine(line)) {
      continue;
    }

    for (const path of extractMarkdownPathTokens(line)) {
      paths.add(path);
    }
  }

  return [...paths];
}

export function extractPhaseTaskLedgerEvidencePaths(markdown: string, phaseNumber: number) {
  const section = extractMarkdownSection(
    markdown,
    (heading) => new RegExp(`^phase\\s+${phaseNumber}\\s+(?:active\\s+)?implementation evidence$`, "i").test(heading),
  );
  return [...new Set(extractMarkdownPathTokens(section))];
}

export function extractReviewScopePaths(markdown: string) {
  const scopeMarkdown = extractMarkdownSection(markdown, (heading) =>
    /^(scope reviewed|review scope|files reviewed|changed files|files changed)$/i.test(heading),
  );
  const source = scopeMarkdown.trim() ? scopeMarkdown : markdown;

  return [...new Set(extractMarkdownPathTokens(source).filter((path) => !isCodeReviewReportPath(path)))].sort();
}

export function extractMarkdownPathTokens(markdown: string) {
  const tokens = new Set<string>();
  const codeTokenPattern = /`([^`\r\n]+)`/g;
  const knownPathPattern =
    /(?:^|[\s([])((?:\.github|\.hepha|apps|docs|MemoryBank|packages|pi-packages|scripts|workflow|research|product)\/[^\s),;]+)/g;

  for (const match of markdown.matchAll(codeTokenPattern)) {
    const normalized = normalizeEvidencePath(match[1] ?? "");

    if (normalized) {
      tokens.add(normalized);
    }
  }

  for (const match of markdown.matchAll(knownPathPattern)) {
    const normalized = normalizeEvidencePath(match[1] ?? "");

    if (normalized) {
      tokens.add(normalized);
    }
  }

  return [...tokens];
}

export function normalizeEvidencePath(rawPath: string) {
  const cleaned = rawPath
    .trim()
    .replace(/^["'([{]+/, "")
    .replace(/["')\]}.,;:]+$/, "")
    .replaceAll("\\", "/");

  if (
    !cleaned ||
    cleaned.includes(" ") ||
    /^(?:https?:|git@|pnpm\b|npm\b|yarn\b|bun\b|node\b|\$)/i.test(cleaned) ||
    cleaned.endsWith("/")
  ) {
    return null;
  }

  const finalSegment = cleaned.split("/").at(-1) ?? cleaned;

  if (!/\.[a-z0-9]+$/i.test(finalSegment)) {
    return null;
  }

  return cleaned;
}

export function resolveEvidenceRelativePath(
  project: StoredProject,
  featureFolderPath: string,
  evidencePath: string,
) {
  if (evidencePath.startsWith("/") || /^[a-zA-Z]:\//.test(evidencePath)) {
    return normalizeRelativePath(project.rootPath, evidencePath);
  }

  if (/^(?:\.github|\.hepha|apps|docs|MemoryBank|packages|pi-packages|scripts|workflow|research|product)\//.test(evidencePath)) {
    return evidencePath;
  }

  return normalizeRelativePath(project.rootPath, resolve(featureFolderPath, evidencePath));
}

export function isCodeReviewReportPath(path: string) {
  return /(^|\/)code-reviews\/.+\.md$/i.test(path);
}

export function isTestEvidencePath(path: string) {
  return /(^|\/)(test|tests|e2e|__tests__)\/|\.test\.[cm]?[jt]sx?$|\.spec\.[cm]?[jt]sx?$|\.feature$/i.test(path);
}

export function isE2eEvidencePath(path: string) {
  return /(^|\/)e2e\/|\.feature$|playwright/i.test(path);
}

export function isUiEvidencePath(path: string) {
  return /^apps\/web\/src\//i.test(path);
}

export function isDocumentationEvidencePath(path: string) {
  return /\.md$/i.test(path) || /^MemoryBank\//i.test(path) || /^docs\//i.test(path);
}

function isChangedFileEvidenceHeading(heading: string) {
  return /^(files changed|changed files|modified|added|created|updated|removed|diff scope|scope reviewed|implementation outputs|updated files\/docs|source changes|test coverage|test files created|test files|quality gate evidence)$/i.test(
    heading,
  );
}

function isChangedFileEvidenceLine(line: string) {
  return /\b(files? changed|changed files|created|modified|updated|added|removed|diff scope|scope reviewed|production changes|test file|source file)\b/i.test(
    line,
  );
}

function normalizeRelativePath(fromPath: string, toPath: string): string {
  const relativePath = relative(fromPath, toPath);
  return relativePath && !relativePath.startsWith("..")
    ? relativePath.replaceAll("\\", "/")
    : toPath;
}
