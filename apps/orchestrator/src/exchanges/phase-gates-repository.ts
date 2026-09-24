import { isDeepStrictEqual } from "node:util";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { FeaturePhaseQualityGateDecision, PhaseSummary } from "@hepha/shared";
import { evaluatePhaseGates, phaseGatesProtocol, validatePhaseGateRevision, type PhaseGateRecord } from "./phase-gates.js";
import { extractTextFromMessage } from "../runtime/pi/pi-event-parser.js";

export const phaseGateRecordPath = (documentPath: string) => `${documentPath}.gates.json`;
export function loadPhaseGateRecord(documentPath: string) {
  const path = phaseGateRecordPath(documentPath);
  if (!existsSync(path)) return null;
  try { return phaseGatesProtocol.decode(readFileSync(path, "utf8")); }
  catch { return { valid: false as const, diagnostics: [{ category: "evidence" as const, path, message: "Cannot read gate record." }] }; }
}

/** Preserve the admitted declaration across worker sessions and server restarts. */
export function retainPhaseGateBaseline(documentPath: string, current = loadPhaseGateRecord(documentPath)) {
  const path = `${documentPath}.gates.baseline.json`;
  if (!existsSync(path) && current?.valid) writeFileSync(path, phaseGatesProtocol.encode(current.value.payload));
  if (!existsSync(path)) return current;
  try { return phaseGatesProtocol.decode(readFileSync(path, "utf8")); }
  catch { return { valid: false as const, diagnostics: [{ category: "evidence" as const, path, message: "Cannot read original gate declaration." }] }; }
}

export function admitPhaseGateBaseline(documentPath: string) {
  const record = loadPhaseGateRecord(documentPath);
  if (record?.valid) writeFileSync(`${documentPath}.gates.baseline.json`, phaseGatesProtocol.encode(record.value.payload));
}

/** Native runner summaries only. Human-written Markdown counts are never inputs. */
export function testExecutionProblem(output: string): string | null {
  const rust = [...output.matchAll(/test result: (ok|FAILED)\. (\d+) passed; (\d+) failed;/g)];
  if (rust.length) return rust.some(m => m[1] !== "ok" || +m[3]! > 0) ? "Runner reports failing tests."
    : rust.some(m => +m[2]! > 0) ? null : "Runner selected no tests.";
  const nodePass = [...output.matchAll(/^# pass (\d+)$/gm)];
  const nodeFail = [...output.matchAll(/^# fail (\d+)$/gm)];
  if (nodePass.length && nodeFail.length) return nodeFail.some(m => +m[1]! > 0) ? "Runner reports failing tests."
    : nodePass.some(m => +m[1]! > 0) ? null : "Runner selected no tests.";
  const plain = output.replace(/\x1b\[[0-9;]*m/g, "");
  const summaries = plain.split(/\r?\n/).filter(line => /^(?:\s*Tests?\s*:|\s*Tests\s+|=+ .* in [\d.]+s|\s*\d+ passed(?: \(|$)|Passed!\s+-|Failed!\s+-)/.test(line));
  if (summaries.length) {
    if (summaries.some(line => /\b[1-9]\d* failed\b|Failed:\s*[1-9]\d*|^Failed!/.test(line))) return "Runner reports failing tests.";
    if (summaries.some(line => /\b[1-9]\d* passed\b|Passed:\s*[1-9]\d*/.test(line))) return null;
  }
  if (/^Ran [1-9]\d* tests? in /m.test(plain) && /^OK(?: \(.*\))?$/m.test(plain) && !/^FAILED\b/m.test(plain)) return null;
  return "Execution needs a native runner result showing tests actually ran; import the runner report before repeating execution.";
}

export interface HistoricalPhaseGateEvidence {
  readonly projectRoot: string;
  /** Immutable pre-worker gate record, not the current or newly written record. */
  readonly record: PhaseGateRecord;
}

export function phaseGateProof(documentPath: string, projectRoot?: string, workingDirectories: readonly string[] = [],
  history?: HistoricalPhaseGateEvidence & { readonly currentRecord: PhaseGateRecord }) {
  const bases = [...workingDirectories.map(cwd => resolve(projectRoot ?? dirname(documentPath), cwd)), projectRoot, resolve(dirname(documentPath), ".."), dirname(documentPath)].filter((p): p is string => !!p);
  // Old launch locations may contain receipts/reports, never substitute source
  // files from a different checkout when validating current acceptance coverage.
  const historicalRecord = history?.record.phaseId === basename(documentPath)
    && isDeepStrictEqual(history.record, history.currentRecord) ? history.record : undefined;
  const evidenceBases = historicalRecord && history ? [...bases,
    ...historicalRecord.checks.map(check => resolve(history.projectRoot, check.cwd)), history.projectRoot,
  ] : bases;
  function locate(path: string, roots = bases) { return roots.map(base => resolve(base, path)).find(p => existsSync(p) && statSync(p).isFile()); }
  function text(path: string, allowHistory = false) { const file = locate(path, allowHistory ? evidenceBases : bases); return file ? readFileSync(file, "utf8") : null; }
  return {
    source: (path: string) => !!locate(path),
    review(path: string): string | null {
      const allowHistory = !!historicalRecord && historicalRecord.review.reportPath === path
        && isDeepStrictEqual(historicalRecord.review, history?.currentRecord.review);
      const report = text(path, allowHistory);
      if (!report) return "Review report is unavailable.";
      // Review verdict fields are an established report protocol, not phase names.
      return /^\s*\*{0,2}(?:Status|Verdict|Result)\*{0,2}\s*:\s*\*{0,2}APPROVED(?:_WITH_NOTES)?\b/im.test(report)
        && !/^\s*\*{0,2}(?:Status|Verdict|Result)\*{0,2}\s*:\s*\*{0,2}(?:NEEDS_CHANGES|CHANGES_REQUIRED|REJECTED)\b/im.test(report)
        ? null : "Review report has no approved verdict or has unresolved findings.";
    },
    check(check: PhaseGateRecord["checks"][number]): string | null {
      if (!check.evidence.length) return `${check.id}: execution evidence is missing.`;
      const allowHistory = !!historicalRecord?.checks.some(previous => isDeepStrictEqual(previous, check));
      let verified = false;
      for (const evidence of check.evidence) {
        const raw = text(evidence.path, allowHistory);
        if (!raw) return `${check.id}: evidence is unavailable: ${evidence.path}`;
        if (!evidence.toolCallId && (check.gate === "tests" || check.gate === "gherkin_e2e") && !raw.trimStart().startsWith("{")) {
          const problem = testExecutionProblem(raw);
          if (problem) return `${check.id}: ${problem}`;
          verified = true;
          continue;
        }
        const messages = raw.split(/\r?\n/).flatMap(line => {
          try { const item = JSON.parse(line); return [item.message ?? item]; } catch { return []; }
        });
        const calls = messages.flatMap(m => m.type === "tool_execution_start" ? [{ id: m.toolCallId, arguments: m.args, name: m.toolName }]
          : m.role === "assistant" && Array.isArray(m.content) ? m.content.filter((c: { type: string }) => c.type === "toolCall") : []);
        const normalize = (command: string) => command.trim().replace(/\s+/g, " ");
        const inferred = calls.filter(c => c.name === "bash" && typeof c.arguments?.command === "string" && normalize(c.arguments.command).includes(normalize(check.command)));
        const executionId = evidence.toolCallId ?? (inferred.length === 1 ? inferred[0]?.id : null);
        if (!executionId) return `${check.id}: reconcile the execution reference; the log contains several or no matching commands.`;
        const result = messages.find(m => m.toolCallId === executionId && (m.role === "toolResult" || m.type === "tool_execution_end"));
        const call = calls.find(c => c.id === executionId);
        if (!result || !call || call.name !== "bash" || result.isError !== false) return `${check.id}: no successful shell execution for the referenced tool call.`;
        const command = call.arguments?.command;
        if (typeof command !== "string" || !command.trim()) return `${check.id}: execution command is unavailable.`;
        const output = extractTextFromMessage(result.result ?? result) ?? "";
        if (/^EXIT(?:_CODE)?=[1-9]\d*\s*$/m.test(output)) return `${check.id}: the command recorded a nonzero exit despite its output wrapper succeeding.`;
        if (check.gate === "tests" || check.gate === "gherkin_e2e") {
          const problem = testExecutionProblem(output);
          if (problem) return `${check.id}: ${problem}`;
        }
        verified = true;
      }
      return verified ? null : `${check.id}: no verified execution.`;
    },
  };
}

export function readPhaseGates(phase: Pick<PhaseSummary, "documentPath">, projectRoot?: string, history?: HistoricalPhaseGateEvidence): FeaturePhaseQualityGateDecision[] | null {
  const record = loadPhaseGateRecord(phase.documentPath);
  if (!record) return null;
  if (!record.valid) return [{ gate: "tests", status: "missing", evidencePaths: [phaseGateRecordPath(phase.documentPath)],
    justification: `Repair phase gate JSON: ${record.diagnostics.map(d => d.message).join("; ")}` }];
  if (record.value.payload.phaseId !== basename(phase.documentPath)) return [{ gate: "tests", status: "missing", evidencePaths: [], justification: "Gate result belongs to another phase document; retain its assigned opaque identity." }];
  try {
    const proof = phaseGateProof(phase.documentPath, projectRoot, record.value.payload.checks.map(c => c.cwd), history ? { ...history, currentRecord: record.value.payload } : undefined);
    const baselinePath = `${phase.documentPath}.gates.baseline.json`;
    if (existsSync(baselinePath)) {
      const baseline = phaseGatesProtocol.decode(readFileSync(baselinePath, "utf8"));
      const problem = baseline.valid ? validatePhaseGateRevision(baseline.value.payload, record.value.payload, proof.source) : "Original gate declaration needs reconciliation.";
      if (problem) return [{ gate: "tests", status: "missing", evidencePaths: [baselinePath], justification: problem }];
    }
    return evaluatePhaseGates(record.value.payload, proof);
  }
  catch { return [{ gate: "tests", status: "missing", evidencePaths: [], justification: "Execution evidence could not be read; reconcile its location." }]; }
}
