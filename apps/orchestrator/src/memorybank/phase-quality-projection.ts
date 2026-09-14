import { applyPhaseGateDeclarations } from "./phase-gate-declarations.js";
import { readPhaseGates } from "../exchanges/phase-gates-repository.js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getPhaseExecutionContractForDocument, loadPhaseExecutionContract, phaseRequiresCodeReview, phaseRequiresVerification } from "../phase-execution-contract.js";
import { isUnresolvedQualityGate, isPhaseQualityWarning } from "@hepha/shared";
import type {
  FeatureCodeReviewSummary,
  FeaturePhaseQualityGateDecision,
  FeaturePhaseQualitySummary,
  FeatureQualityGateKind,
  FeatureQualityGateStatus,
  PhaseSummary,
} from "@hepha/shared";
import { cleanInlineMarkdown, extractMarkdownSection } from "./markdown-parsing.js";
import { readCompatibilityGateDeclarations, reconcileGateApplicability } from "./phase-gate-applicability.js";
import { stripCompletionRecoverySection } from "./completion-recovery-section.js";
import { readPhaseVerification } from "../exchanges/phase-verification-repository.js";
import { readCheckpointTestEvidence } from "./phase-checkpoint-test-evidence.js";
import { readCheckpointHealthEvidence } from "./phase-checkpoint-health-evidence.js";
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
  projectRoot?: string,
): FeaturePhaseQualitySummary[] {
  return phases
    .map((phase) => {
      const markdown = stripCompletionRecoverySection(safeReadTextFile(phase.documentPath));
      const explicitQualitySection = extractMarkdownSection(markdown, (heading) =>
        /^quality gate evidence$/i.test(heading),
      );
      const explicitGates = parseExplicitQualityGateDecisions(explicitQualitySection);
      for (const decision of readCheckpointHealthEvidence(markdown)) {
        const recorded = explicitGates.get(decision.gate);
        // A legacy prose summary with no recognized outcome cannot erase a
        // later explicit decision linked to execution evidence. Real failures
        // still take precedence below.
        if (decision.status === "unknown" && recorded?.status === "satisfied" && recorded.evidencePaths.length) continue;
        const recordedFailure = /Recorded unresolved gate:|\bfailed\b|\b[1-9]\d* warnings?\b/i.test(recorded?.justification ?? "");
        if (!recordedFailure || decision.status === "missing") explicitGates.set(decision.gate, decision);
      }
      const checkpointTests = readCheckpointTestEvidence(markdown);
      if (checkpointTests && (!explicitGates.has("tests") || checkpointTests.status !== "satisfied")) {
        explicitGates.set("tests", checkpointTests);
      }
      const phaseReviews = phase.number === null ? [] : codeReviews.filter(review => review.phaseNumber === phase.number);
      for (const [gate, declaration] of readCompatibilityGateDeclarations(markdown)) {
        // A required review is an obligation, not a failed review. Let the
        // indexed report verdict satisfy it (or block it) below.
        if (gate === "code_review" && phaseReviews.length > 0 && /^required\b/i.test(declaration.justification ?? "")) continue;
        // Native decisions take precedence, except a recorded failure cannot
        // be hidden by a green or N/A summary row.
        if (!explicitGates.has(gate) || declaration.justification?.startsWith("Recorded unresolved gate:")) {
          explicitGates.set(gate, declaration);
        }
      }
      // MCP refinement publishes applicability separately from execution outcomes.
      const gateContract = parseExplicitQualityGateDecisions(extractMarkdownSection(markdown, heading => /^phase quality gate contract$/i.test(heading)));
      for (const [gate, declaration] of gateContract) {
        const recorded = explicitGates.get(gate);
        const failed = (gate === "tests" && checkpointTests && checkpointTests.status !== "satisfied")
          || /Recorded unresolved gate:|\bfailed\b|\bneeds changes\b/i.test(recorded?.justification ?? "");
        if (failed) continue;
        if (declaration.status === "not_applicable") explicitGates.set(gate, declaration);
        else if (!recorded || recorded.status === "not_applicable") explicitGates.set(gate, declaration);
      }
      const changedFiles = extractPhaseQualityChangedFiles(markdown, explicitQualitySection);
      const testFiles = changedFiles.filter(isTestEvidencePath);
      const documentationFiles = changedFiles.filter(isDocumentationEvidencePath);
      const codeFiles = changedFiles.filter(
        (filePath) => !isTestEvidencePath(filePath) && !isDocumentationEvidencePath(filePath),
      );
      reconcileGateApplicability(explicitGates, codeFiles, codeFiles.some(isUiEvidencePath));
      const folder = resolve(dirname(phase.documentPath), "..");
      const declared = getPhaseExecutionContractForDocument(loadPhaseExecutionContract(folder).contract, phase.documentPath, folder);
      if (declared) {
        for (const [gate, required] of [["tests", phaseRequiresVerification(declared)], ["code_review", phaseRequiresCodeReview(declared, codeFiles.length > 0)]] as const) {
          const decision = explicitGates.get(gate);
          const observedFailure = gate === "tests" && checkpointTests && checkpointTests.status !== "satisfied";
          if (observedFailure || decision?.justification?.startsWith("Recorded unresolved gate:")) continue;
          if (!required) explicitGates.set(gate, { gate, status: "not_applicable", evidencePaths: [resolve(folder, "PhaseExecutionContract.json")],
            justification: `The current phase execution contract declares no required ${gate === "tests" ? "verification" : "code-review"} obligation.` });
          else if (!decision || decision.status === "not_applicable") explicitGates.set(gate, { gate, status: "missing", evidencePaths: [],
            justification: `The current phase execution contract requires ${gate}; record its execution evidence.` });
        }
        // A valid review report can satisfy the declared review obligation below.
        if (phaseReviews.length && explicitGates.get("code_review")?.status === "missing"
          && explicitGates.get("code_review")?.justification?.startsWith("The current phase execution contract")) explicitGates.delete("code_review");
      }
      applyPhaseGateDeclarations(markdown, phase.documentPath, explicitGates,
        checkpointTests?.status === "missing" || !!(declared && phaseRequiresVerification(declared)), phaseReviews.length > 0);
      const structured = readPhaseVerification(phase, codeFiles.length > 0, projectRoot, testFiles.length > 0);
      if (structured) for (const decision of structured) explicitGates.set(decision.gate, decision);
      const gates = readPhaseGates(phase, projectRoot) ?? buildPhaseQualityGateDecisions({
        codeFiles,
        explicitGates,
        phaseReviews,
        testFiles,
      });
      // A canonical compatibility record cannot waive host-observed failures of
      // independently configured native verification commands.
      if (structured) for (const decision of structured.filter(gate => isUnresolvedQualityGate(gate) || isPhaseQualityWarning(gate))) {
        const index = gates.findIndex(gate => gate.gate === decision.gate);
        if (index < 0) gates.push(decision); else gates[index] = decision;
      }
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
        summary.gates.some((gate) => gate.status !== "not_applicable" || gate.justification) ||
        summary.warnings.length > 0,
    );
}

function extractPhaseQualityChangedFiles(markdown: string, explicitQualitySection: string) {
  const explicitChangedFileLines = explicitQualitySection
    .split(/\r?\n/)
    .filter((line) => /\b(changed files?|source files?|test files?|documentation files?)\b/i.test(line));
  const explicitPaths = extractChangedFileEvidencePaths(`## Changed Files\n${explicitChangedFileLines.join("\n")}`);

  return [...new Set([...explicitPaths, ...extractChangedFileEvidencePaths(markdown)])].sort();
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
  const latestReview = [...phaseReviews].sort((a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "")).at(-1);
  const unresolvedReview = latestReview && !["approved", "approved_with_notes"].includes(latestReview.result);

  return [
    ...["build", "lint"].flatMap(gate => explicitGates.has(gate as FeatureQualityGateKind) ? [explicitGates.get(gate as FeatureQualityGateKind)!] : []),
    mergeQualityGateDecision({
      evidencePaths: testFiles,
      explicitGates,
      fallbackJustification: "Test gate declaration/evidence is unresolved. Reconcile the phase contract; listed files do not prove applicability or passing execution.",
      fallbackStatus: "unknown",
      gate: "tests",
    }),
    mergeQualityGateDecision({
      evidencePaths: testFiles.filter(isE2eEvidencePath),
      explicitGates,
      fallbackJustification:
        hasUiCode && testFiles.some(isE2eEvidencePath)
          ? "Browser-facing change has E2E evidence recorded in phase evidence."
          : null,
      fallbackStatus: "not_applicable",
      gate: "gherkin_e2e",
    }),
    unresolvedReview ? {
      gate: "code_review" as const, status: "missing" as const,
      evidencePaths: [latestReview.reportRelativePath ?? latestReview.reportPath],
      justification: `Latest recorded review verdict: ${latestReview.result ?? "unknown"}. Resolve review findings or verify the unrecognised verdict before phase acceptance. A report's presence or a green summary row is not approval.`,
    } : mergeQualityGateDecision({
      evidencePaths: phaseReviews.map((review) => review.reportRelativePath ?? review.reportPath),
      explicitGates,
      fallbackJustification:
        phaseReviews.length > 0
          ? `${phaseReviews.length} persisted code-review report${phaseReviews.length === 1 ? "" : "s"} found.`
          : "Code-review gate declaration is unresolved. Reconcile the phase contract; changed files do not decide review applicability.",
      fallbackStatus: phaseReviews.length > 0 ? "satisfied" : "unknown",
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
    .filter(gate => isUnresolvedQualityGate(gate) || isPhaseQualityWarning(gate))
    .map((gate) => {
      switch (gate.gate) {
        case "build": return "Build warning (non-blocking); inspect its execution result and choose whether to repair it.";
        case "lint": return "Lint/typecheck warning (non-blocking); inspect its execution result and choose whether to repair it.";
        case "code_review":
          return "Reconcile the declared code-review gate and its approval evidence.";
        case "gherkin_e2e":
          return "Reconcile the explicitly assigned workflow E2E obligation and its execution evidence.";
        case "tests":
          return "Reconcile the declared test/acceptance-coverage gate and its execution evidence.";
      }
    });
}

export function parseQualityGateKind(value: string): FeatureQualityGateKind | null {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  // Coverage is advisory telemetry with its own document row. It must never
  // enter or overwrite the blocking Tests gate namespace merely because its
  // label contains the word "test".
  if (normalized.includes("coverage")) {
    return null;
  }

  if (normalized === "build") return "build";
  if (normalized === "lint" || normalized === "lint typecheck") return "lint";

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
