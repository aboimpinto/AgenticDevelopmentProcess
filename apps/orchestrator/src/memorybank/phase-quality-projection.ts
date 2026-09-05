import { existsSync, readFileSync } from "node:fs";
import type {
  FeatureCodeReviewSummary,
  FeaturePhaseQualityGateDecision,
  FeaturePhaseQualitySummary,
  FeatureQualityGateKind,
  FeatureQualityGateStatus,
  PhaseSummary,
} from "@hepha/shared";
import { cleanInlineMarkdown, extractMarkdownSection } from "./markdown-parsing.js";
import {
  extractChangedFileEvidencePaths,
  extractMarkdownPathTokens,
  isDocumentationEvidencePath,
  isE2eEvidencePath,
  isTestEvidencePath,
  isUiEvidencePath,
} from "./implementation-evidence-paths.js";

export function scanFeaturePhaseQualityGates(
  phases: PhaseSummary[],
  codeReviews: FeatureCodeReviewSummary[],
): FeaturePhaseQualitySummary[] {
  return phases
    .map((phase) => {
      const markdown = safeReadTextFile(phase.documentPath);
      const explicitQualitySection = extractMarkdownSection(markdown, (heading) =>
        /^quality gate evidence$/i.test(heading),
      );
      const explicitGates = parseExplicitQualityGateDecisions(explicitQualitySection);
      const changedFiles = extractPhaseQualityChangedFiles(markdown, explicitQualitySection);
      const testFiles = changedFiles.filter(isTestEvidencePath);
      const documentationFiles = changedFiles.filter(isDocumentationEvidencePath);
      const codeFiles = changedFiles.filter(
        (filePath) => !isTestEvidencePath(filePath) && !isDocumentationEvidencePath(filePath),
      );
      const phaseReviews =
        phase.number === null
          ? []
          : codeReviews.filter((review) => review.phaseNumber === phase.number);
      const gates = buildPhaseQualityGateDecisions({
        codeFiles,
        explicitGates,
        phaseReviews,
        testFiles,
      });
      const warnings = buildPhaseQualityWarnings(gates);

      return {
        changedFiles,
        codeFiles,
        documentationFiles,
        gates,
        phaseNumber: phase.number,
        phaseStatus: phase.status,
        phaseTitle: phase.title,
        testFiles,
        warnings,
      };
    })
    .filter(
      (summary) =>
        summary.changedFiles.length > 0 ||
        summary.gates.some((gate) => gate.status !== "not_applicable" && gate.status !== "unknown") ||
        summary.warnings.length > 0,
    );
}

function extractPhaseQualityChangedFiles(markdown: string, explicitQualitySection: string) {
  const explicitChangedFileLines = explicitQualitySection
    .split(/\r?\n/)
    .filter((line) => /\b(changed files?|source files?|test files?|documentation files?)\b/i.test(line));
  const explicitPaths = explicitChangedFileLines.flatMap((line) => extractMarkdownPathTokens(line));

  if (explicitPaths.length > 0) {
    return [...new Set(explicitPaths)].sort();
  }

  return [...new Set(extractChangedFileEvidencePaths(markdown))].sort();
}

function parseExplicitQualityGateDecisions(markdown: string) {
  const gates = new Map<FeatureQualityGateKind, FeaturePhaseQualityGateDecision>();

  if (!markdown.trim()) {
    return gates;
  }

  for (const line of markdown.split(/\r?\n/)) {
    const cells = line
      .trim()
      .split("|")
      .map((cell) => cleanInlineMarkdown(cell.trim()))
      .filter(Boolean);

    if (cells.length < 2) {
      continue;
    }

    const gate = parseQualityGateKind(cells[0]);

    if (!gate) {
      continue;
    }

    const status = parseQualityGateStatus(cells[1]);
    const justification = cells.slice(2).join(" | ").trim() || null;

    gates.set(gate, {
      evidencePaths: extractMarkdownPathTokens(line),
      gate,
      justification,
      status,
    });
  }

  return gates;
}

function buildPhaseQualityGateDecisions({
  codeFiles,
  explicitGates,
  phaseReviews,
  testFiles,
}: {
  codeFiles: string[];
  explicitGates: Map<FeatureQualityGateKind, FeaturePhaseQualityGateDecision>;
  phaseReviews: FeatureCodeReviewSummary[];
  testFiles: string[];
}) {
  const hasUiCode = codeFiles.some(isUiEvidencePath);

  return [
    mergeQualityGateDecision({
      evidencePaths: testFiles,
      explicitGates,
      fallbackJustification:
        testFiles.length > 0
          ? `${testFiles.length} test file${testFiles.length === 1 ? "" : "s"} recorded in phase evidence.`
          : null,
      fallbackStatus: testFiles.length > 0 ? "satisfied" : codeFiles.length > 0 ? "missing" : "not_applicable",
      gate: "tests",
    }),
    mergeQualityGateDecision({
      evidencePaths: testFiles.filter(isE2eEvidencePath),
      explicitGates,
      fallbackJustification:
        hasUiCode && testFiles.some(isE2eEvidencePath)
          ? "Browser-facing change has E2E evidence recorded in phase evidence."
          : null,
      fallbackStatus: hasUiCode
        ? testFiles.some(isE2eEvidencePath)
          ? "satisfied"
          : "missing"
        : "not_applicable",
      gate: "gherkin_e2e",
    }),
    mergeQualityGateDecision({
      evidencePaths: phaseReviews.map((review) => review.reportRelativePath ?? review.reportPath),
      explicitGates,
      fallbackJustification:
        phaseReviews.length > 0
          ? `${phaseReviews.length} persisted code-review report${phaseReviews.length === 1 ? "" : "s"} found.`
          : null,
      fallbackStatus: phaseReviews.length > 0 ? "satisfied" : codeFiles.length > 0 ? "missing" : "not_applicable",
      gate: "code_review",
    }),
  ];
}

function mergeQualityGateDecision({
  evidencePaths,
  explicitGates,
  fallbackJustification,
  fallbackStatus,
  gate,
}: {
  evidencePaths: string[];
  explicitGates: Map<FeatureQualityGateKind, FeaturePhaseQualityGateDecision>;
  fallbackJustification: string | null;
  fallbackStatus: FeatureQualityGateStatus;
  gate: FeatureQualityGateKind;
}): FeaturePhaseQualityGateDecision {
  const explicitGate = explicitGates.get(gate);

  if (explicitGate) {
    return {
      ...explicitGate,
      evidencePaths: [...new Set([...explicitGate.evidencePaths, ...evidencePaths])].sort(),
    };
  }

  return {
    evidencePaths: [...new Set(evidencePaths)].sort(),
    gate,
    justification: fallbackJustification,
    status: fallbackStatus,
  };
}

function buildPhaseQualityWarnings(gates: FeaturePhaseQualityGateDecision[]) {
  return gates
    .filter((gate) => gate.status === "missing")
    .map((gate) => {
      switch (gate.gate) {
        case "code_review":
          return "Code review is required or must be explicitly waived with justification.";
        case "gherkin_e2e":
          return "Gherkin/Playwright E2E is required for UI/browser-facing changes or must be explicitly waived.";
        case "tests":
          return "Automated tests are required for code changes or must be explicitly waived with justification.";
      }
    });
}

function parseQualityGateKind(value: string): FeatureQualityGateKind | null {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  // Coverage is advisory telemetry with its own document row. It must never
  // enter or overwrite the blocking Tests gate namespace merely because its
  // label contains the word "test".
  if (normalized.includes("coverage")) {
    return null;
  }

  if (normalized.includes("code review")) {
    return "code_review";
  }

  if (normalized.includes("gherkin") || normalized.includes("playwright") || normalized.includes("e2e")) {
    return "gherkin_e2e";
  }

  if (normalized.includes("test")) {
    return "tests";
  }

  return null;
}

function parseQualityGateStatus(value: string): FeatureQualityGateStatus {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  if (/missing|required|needed|todo|pending/.test(normalized)) {
    return "missing";
  }

  if (/none|not applicable|n a/.test(normalized)) {
    return "not_applicable";
  }

  if (/waived|not required|no ui|docs only/.test(normalized)) {
    return "waived";
  }

  if (/satisfied|passed|present|done|complete|covered|approved/.test(normalized)) {
    return "satisfied";
  }

  return "unknown";
}



function safeReadTextFile(path: string): string {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  } catch {
    return "";
  }
}
