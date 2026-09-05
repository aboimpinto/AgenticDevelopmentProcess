import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { relative, resolve, dirname } from "node:path";
import { parsePhaseGateEvidenceHandoff } from "../../phase-gate-evidence-handoff.js";

export class PhaseWorkerSessionEvidenceReader {
  constructor(private readonly configuration: { sessionDirectory: string; workspaceRoot: string }) {}

  find(
    feature: Pick<WorkItemCard, "folderPath">,
    phase: Pick<PhaseSummary, "number" | "title" | "documentPath"> & { number: number },
  ): ReturnType<typeof parsePhaseGateEvidenceHandoff> | null {
    // Primary: read the handoff from the phase document (the worker's durable output)
    const fromDocument = this.findFromPhaseDocument(phase);
    if (fromDocument !== null) return fromDocument;

    // Fallback: check session JSON for workers that haven't written to the document yet
    return this.findFromSession(feature, phase);
  }

  private findFromSession(
    feature: Pick<WorkItemCard, "folderPath">,
    phase: Pick<PhaseSummary, "number" | "title"> & { number: number },
  ): ReturnType<typeof parsePhaseGateEvidenceHandoff> | null {
    const promptMarker = `Current phase: Phase ${phase.number} - ${phase.title}`;
    const featureMarker = relative(this.configuration.workspaceRoot, feature.folderPath).replace(/\\/g, "/");
    const candidates = safeReadDirectory(this.configuration.sessionDirectory)
      .filter((fileName) => fileName.endsWith(".json"))
      .flatMap((fileName) => {
        const path = resolve(this.configuration.sessionDirectory, fileName);
        try { return [{ path, modifiedAt: statSync(path).mtimeMs }]; } catch { return []; }
      })
      .sort((left, right) => right.modifiedAt - left.modifiedAt);

    for (const candidate of candidates) {
      let raw: string;
      try { raw = readFileSync(candidate.path, "utf8"); } catch { continue; }
      if (!raw.includes(promptMarker) || !raw.includes(featureMarker)) continue;
      try {
        return parsePhaseGateEvidenceHandoff(extractFinalAssistantTextFromPiSession(raw));
      } catch {
        // Matching append-only sessions may represent interrupted attempts.
      }
    }
    return null;
  }

  private findFromPhaseDocument(
    phase: Pick<PhaseSummary, "documentPath">,
  ): ReturnType<typeof parsePhaseGateEvidenceHandoff> | null {
    if (!phase.documentPath || !existsSync(phase.documentPath)) return null;
    try {
      const content = readFileSync(phase.documentPath, "utf8");
      return parsePhaseGateEvidenceHandoff(content);
    } catch {
      // Strict parsing failed. Attempt auto-repair: extract the handoff table
      // and normalize common LLM format variations (different models, different vocabularies).
      const repaired = this.repairHandoffInDocument(phase.documentPath);
      if (repaired !== null) return repaired;
      return null;
    }
  }

  /**
   * Attempts to extract and repair a handoff from the phase document when
   * strict parsing fails. Handles common format variations across models:
   * - Result values using gate vocabulary (missing, satisfied) instead of handoff vocabulary (passed, failed)
   * - Spacing variations (not applicable vs not_applicable)
   * - Extra text in result column
   */
  private repairHandoffInDocument(
    documentPath: string,
  ): ReturnType<typeof parsePhaseGateEvidenceHandoff> | null {
    try {
      const content = readFileSync(documentPath, "utf8");
      const heading = content.search(/^##\s+Hepha Gate Evidence Handoff\s*$/im);
      if (heading === -1) return null;

      const afterHeading = content.slice(heading).replace(/^##[^\n]*(?:\r?\n|$)/, "");
      const nextHeading = afterHeading.search(/^##\s+/m);
      const section = nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading);

      let changedFiles: string | null = null;
      let testsResult: string | null = null;
      let testsEvidence: string | null = null;
      let gherkinResult: string | null = null;
      let gherkinEvidence: string | null = null;

      const normalizeResult = (raw: string, evidence: string): string | null => {
        const trimmed = raw.trim().toLowerCase();
        // Direct matches
        if (trimmed === "passed") return "passed";
        if (trimmed === "failed") return "failed";
        if (trimmed === "not_applicable") return "not_applicable";
        if (trimmed === "not applicable") return "not_applicable";
        // Gate vocabulary mapped to handoff vocabulary
        if (trimmed === "satisfied") return "passed";
        if (trimmed === "waived") return "not_applicable";
        // Ambiguous vocabulary: check evidence text for semantic clues
        const evidenceLower = evidence.toLowerCase();
        if (trimmed === "missing") {
          // 'missing' means evidence not provided. But the model may use it
          // as a gate-decision synonym. Check the evidence text to disambiguate.
          const successIndicators = ["passed", "all tests", "succeeded", "completed successfully", "no failures"];
          const failureIndicators = ["failed", "timed out", "crashed", "error", "unavailable"];
          const hasSuccess = successIndicators.some((s) => evidenceLower.includes(s));
          const hasFailure = failureIndicators.some((s) => evidenceLower.includes(s));
          if (hasSuccess && !hasFailure) return "passed";
          if (hasFailure && !hasSuccess) return "failed";
          return "failed"; // conservative default
        }
        return null;
      };

      for (const line of section.split(/\r?\n/)) {
        const cells = line.split("|").slice(1, -1).map((c) => c.trim());
        if (cells.length !== 3) continue;
        const key = cells[0].toLowerCase();
        if (key === "changed files" && cells[1]?.toLowerCase() === "recorded") {
          changedFiles = cells[2] ?? "";
        } else if (key === "tests") {
          const normalized = normalizeResult(cells[1] ?? "", cells[2] ?? "");
          if (normalized) { testsResult = normalized; testsEvidence = cells[2] ?? ""; }
        } else if (key === "gherkin/playwright e2e") {
          const normalized = normalizeResult(cells[1] ?? "", cells[2] ?? "");
          if (normalized) { gherkinResult = normalized; gherkinEvidence = cells[2] ?? ""; }
        }
      }

      if (changedFiles && testsResult && gherkinResult) {
        // Correct the document so subsequent fixer agents see the right format.
        const corrected = content.replace(
          /^(\|\s*Tests\s*\|)\s*[^|]+(\|)/im,
          `\$1 ${testsResult} \$2`,
        ).replace(
          /^(\|\s*Gherkin\/Playwright\s*E2E\s*\|)\s*[^|]+(\|)/im,
          `\$1 ${gherkinResult} \$2`,
        );
        if (corrected !== content) {
          try { writeFileSync(documentPath, corrected, "utf8"); } catch { /* best-effort */ }
        }
        return {
          changedFiles,
          tests: { result: testsResult as "passed" | "failed" | "not_applicable", evidence: testsEvidence ?? "" },
          gherkinE2e: { result: gherkinResult as "passed" | "failed" | "not_applicable", evidence: gherkinEvidence ?? "" },
        };
      }
      return null;
    } catch {
      return null;
    }
  }
}

export function extractFinalAssistantTextFromPiSession(raw: string): string {
  const responses: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line) as {
        message?: { content?: Array<{ text?: unknown; type?: unknown }>; role?: unknown };
        type?: unknown;
      };
      if (event.type !== "message" || event.message?.role !== "assistant") continue;
      const text = (event.message.content ?? [])
        .filter((item) => item.type === "text" && typeof item.text === "string")
        .map((item) => item.text as string)
        .join("\n");
      if (text) responses.push(text);
    } catch {
      // A session can end with a partial line after process interruption.
    }
  }
  // Prefer the newest message that contains a handoff table.
  // The handoff is often in an earlier message while the last message
  // may be a short confirmation or summary without the table.
  for (let i = responses.length - 1; i >= 0; i -= 1) {
    if (/^##\s+Hepha Gate Evidence Handoff\s*$/im.test(responses[i]!)) return responses[i]!;
  }
  return responses.at(-1) ?? "";
}

function safeReadDirectory(path: string): string[] {
  try { return readdirSync(path); } catch { return []; }
}
