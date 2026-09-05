import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import type {
  FeatureCodeReviewResult,
  FeatureImplementationEvidenceSource,
  FeatureImplementationEvidenceSummary,
  PhaseSummary,
} from "@hepha/shared";
import type { StoredProject } from "../projects/stored-project.js";
import { extractMarkdownField } from "./markdown-parsing.js";
import { extractPhaseNumber } from "./phase-document-parser.js";
import { scanFeaturePhaseQualityGates } from "./phase-quality-projection.js";
import {
  extractChangedFileEvidencePaths,
  extractPhaseTaskLedgerEvidencePaths,
  extractReviewScopePaths,
  isCodeReviewReportPath,
  normalizeEvidencePath,
  resolveEvidenceRelativePath,
} from "./implementation-evidence-paths.js";

interface MutableChangedFileEvidence {
  path: string;
  relativePath: string | null;
  phases: Set<number>;
  reviewReportPaths: Set<string>;
  sources: Set<FeatureImplementationEvidenceSource>;
}

export function scanFeatureImplementationEvidence(
  project: StoredProject,
  featureFolderPath: string,
  phases: PhaseSummary[],
): FeatureImplementationEvidenceSummary {
  const changedFilesByPath = new Map<string, MutableChangedFileEvidence>();
  function addChangedFile(
    rawPath: string,
    source: FeatureImplementationEvidenceSource,
    phaseNumber: number | null,
    reviewReportPath: string | null = null,
  ) {
    const normalizedPath = normalizeEvidencePath(rawPath);

    if (!normalizedPath || isCodeReviewReportPath(normalizedPath)) {
      return;
    }

    const existing = changedFilesByPath.get(normalizedPath);
    const evidence =
      existing ??
      {
        path: normalizedPath,
        relativePath: resolveEvidenceRelativePath(project, featureFolderPath, normalizedPath),
        phases: new Set<number>(),
        reviewReportPaths: new Set<string>(),
        sources: new Set<FeatureImplementationEvidenceSource>(),
      };

    if (phaseNumber !== null) {
      evidence.phases.add(phaseNumber);
    }

    if (reviewReportPath) {
      evidence.reviewReportPaths.add(reviewReportPath);
    }

    evidence.sources.add(source);
    changedFilesByPath.set(normalizedPath, evidence);
  }

  for (const phase of phases) {
    const markdown = safeReadTextFile(phase.documentPath);

    if (!markdown) {
      continue;
    }

    for (const filePath of extractChangedFileEvidencePaths(markdown)) {
      addChangedFile(filePath, "phase", phase.number);
    }
  }

  // FeatureTasks is the durable cross-phase ledger. Recover only paths from
  // the matching phase's explicit evidence section; this remains phase-scoped
  // rather than becoming a whole-working-tree fallback.
  const featureTasksMarkdown = safeReadTextFile(resolve(featureFolderPath, "FeatureTasks.md"));
  for (const phase of phases) {
    if (phase.number === null) continue;
    for (const filePath of extractPhaseTaskLedgerEvidencePaths(featureTasksMarkdown, phase.number)) {
      addChangedFile(filePath, "task-ledger", phase.number);
    }
  }

  for (const artifact of listFeatureEvidenceArtifacts(featureFolderPath)) {
    const markdown = safeReadTextFile(artifact.path);

    if (!markdown) {
      continue;
    }

    for (const filePath of extractChangedFileEvidencePaths(markdown)) {
      addChangedFile(filePath, artifact.source, null);
    }
  }

  const codeReviews = scanFeatureCodeReviews(project, featureFolderPath, phases);
  const phaseQualityGates = scanFeaturePhaseQualityGates(phases, codeReviews);

  for (const review of codeReviews) {
    for (const reviewedFile of review.reviewedFiles) {
      addChangedFile(reviewedFile, "code-review", review.phaseNumber, review.reportRelativePath ?? review.reportPath);
    }
  }

  const changedFiles = [...changedFilesByPath.values()]
    .map((file) => ({
      path: file.path,
      relativePath: file.relativePath,
      phases: [...file.phases].sort((left, right) => left - right),
      reviewReportPaths: [...file.reviewReportPaths].sort(),
      sources: [...file.sources].sort(compareEvidenceSources),
    }))
    .sort((left, right) => {
      const leftPhase = left.phases[0] ?? Number.MAX_SAFE_INTEGER;
      const rightPhase = right.phases[0] ?? Number.MAX_SAFE_INTEGER;

      if (leftPhase !== rightPhase) {
        return leftPhase - rightPhase;
      }

      return left.path.localeCompare(right.path);
    });

  return { changedFiles, codeReviews, phaseQualityGates };
}

function scanFeatureCodeReviews(
  project: StoredProject,
  featureFolderPath: string,
  phases: PhaseSummary[],
) {
  const codeReviewsPath = resolve(featureFolderPath, "code-reviews");

  if (!existsSync(codeReviewsPath)) {
    return [];
  }

  return safeReadDirectory(codeReviewsPath)
    .filter((fileName) => fileName.toLowerCase().endsWith(".md"))
    .map((fileName) => {
      const reportPath = resolve(codeReviewsPath, fileName);
      const markdown = safeReadTextFile(reportPath);
      const phaseNumber = extractPhaseNumber(fileName, markdown);

      return {
        fileName,
        phaseNumber,
        phaseTitle: extractCodeReviewPhaseTitle(markdown, phaseNumber, phases),
        reportPath,
        reportRelativePath: normalizeRelativePath(project.rootPath, reportPath),
        result: extractCodeReviewResult(markdown),
        reviewedFiles: extractReviewScopePaths(markdown),
        updatedAt: statSync(reportPath).mtime.toISOString(),
      };
    })
    .sort((left, right) => {
      const leftPhase = left.phaseNumber ?? Number.MAX_SAFE_INTEGER;
      const rightPhase = right.phaseNumber ?? Number.MAX_SAFE_INTEGER;

      if (leftPhase !== rightPhase) {
        return leftPhase - rightPhase;
      }

      return left.fileName.localeCompare(right.fileName);
    });
}

function listFeatureEvidenceArtifacts(featureFolderPath: string) {
  return safeReadDirectory(featureFolderPath)
    .filter((fileName) => fileName.toLowerCase().endsWith(".md"))
    .filter((fileName) => !/^FeatureDescription\.md$/i.test(fileName))
    .map((fileName) => ({
      path: resolve(featureFolderPath, fileName),
      source: getFeatureEvidenceArtifactSource(fileName),
    }));
}

function getFeatureEvidenceArtifactSource(fileName: string): FeatureImplementationEvidenceSource {
  const normalized = fileName.toLowerCase();

  if (normalized === "completion-report.md") {
    return "completion-report";
  }

  if (normalized === "start-feature-report.md") {
    return "start-report";
  }

  if (normalized === "planning-analysis-report.md") {
    return "planning-artifact";
  }

  if (normalized === "featuretasks.md") {
    return "task-ledger";
  }

  if (normalized === "manual-acceptance-notes.md") {
    return "manual-acceptance";
  }

  return "other-artifact";
}

function extractCodeReviewPhaseTitle(
  markdown: string,
  phaseNumber: number | null,
  phases: PhaseSummary[],
) {
  const phaseField = extractMarkdownField(markdown, ["Phase"]);

  if (phaseField) {
    return phaseField.replace(/^Phase\s+\d+\s*[-:]?\s*/i, "").trim() || phaseField;
  }

  if (phaseNumber !== null) {
    return phases.find((phase) => phase.number === phaseNumber)?.title ?? null;
  }

  return null;
}

function extractCodeReviewResult(markdown: string): FeatureCodeReviewResult {
  const result = extractMarkdownField(markdown, ["Review Result", "Verdict", "Result", "Decision"]);

  if (!result) {
    return "unknown";
  }

  const normalized = result.toUpperCase().replace(/[^A-Z0-9]+/g, "_");

  if (normalized.includes("NEEDS_CHANGES") || normalized.includes("REQUIRED") || normalized.includes("CHANGES_REQUESTED")) {
    return "needs_changes";
  }

  if (normalized.includes("BLOCKED") || normalized.includes("BLOCKER") || normalized.includes("FAILED")) {
    return "blocked";
  }

  if (normalized.includes("APPROVED_WITH_NOTES") || (normalized.includes("APPROVED") && normalized.includes("NOTES"))) {
    return "approved_with_notes";
  }

  if (normalized.includes("APPROVED")) {
    return "approved";
  }

  return "unknown";
}

function compareEvidenceSources(
  left: FeatureImplementationEvidenceSource,
  right: FeatureImplementationEvidenceSource,
) {
  const order: FeatureImplementationEvidenceSource[] = [
    "phase",
    "code-review",
    "completion-report",
    "start-report",
    "planning-artifact",
    "task-ledger",
    "manual-acceptance",
    "other-artifact",
  ];

  return order.indexOf(left) - order.indexOf(right);
}


function safeReadDirectory(path: string): string[] {
  try { return existsSync(path) ? readdirSync(path) : []; } catch { return []; }
}

function safeReadTextFile(path: string): string {
  try { return existsSync(path) ? readFileSync(path, "utf8") : ""; } catch { return ""; }
}

function normalizeRelativePath(fromPath: string, toPath: string): string {
  const relativePath = relative(fromPath, toPath);
  return relativePath && !relativePath.startsWith("..") ? relativePath.replaceAll("\\", "/") : toPath;
}
