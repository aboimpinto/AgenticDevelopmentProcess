import type { PhaseExecutionRole } from "../phase-execution-contract.js";
import type { CheckOutcome, VerificationCheckIntent } from "../final-verification-types.js";
import { createJsonExchangeProtocol, readExchangeSchema, type ExchangeDiagnostic } from "./json-exchange-protocol.js";

export interface PhaseVerificationPayload {
  phaseId: string;
  role: PhaseExecutionRole;
  status: "passed" | "failed" | "blocked" | "not_applicable";
  reason?: string;
  checks: Array<{
    id: string; intent: VerificationCheckIntent; required: boolean; outcome: CheckOutcome;
    command: string[]; cwd: string; exitCode: number | null; evidence: string; description?: string;
  }>;
}

export const phaseVerificationProtocol = createJsonExchangeProtocol<PhaseVerificationPayload>(
  "phase.verification", readExchangeSchema("phase-verification-payload-v1"),
);

/** Check requirements come from the admitted dispatch, independently of role or files. */
export function validatePhaseVerification(payload: PhaseVerificationPayload, context: {
  phaseId: string; role: PhaseExecutionRole; productionCodeChanged: boolean; testCodeChanged?: boolean;
  expectedChecks?: ReadonlyArray<{ id: string; intent: VerificationCheckIntent; required: boolean; command: string[]; cwd: string }>;
}): ExchangeDiagnostic[] {
  const diagnostics: ExchangeDiagnostic[] = [];
  const issue = (path: string, message: string) => diagnostics.push({ category: "evidence", path, message });
  if (payload.phaseId !== context.phaseId) issue("/payload/phaseId", "Result does not identify the dispatched phase.");
  if (payload.role !== context.role) issue("/payload/role", "Result cannot change the declared phase role.");
  if (payload.status === "not_applicable") {
    if (context.expectedChecks?.some(check => check.required && check.intent !== "coverage")) {
      issue("/payload/status", "Not applicable conflicts with declared required checks.");
    }
    return diagnostics;
  }
  const ids = new Set<string>();
  for (const [index, check] of payload.checks.entries()) {
    const path = `/payload/checks/${index}`;
    if (ids.has(check.id)) issue(`${path}/id`, "Each check must occur exactly once.");
    ids.add(check.id);
    if (check.outcome === "passed" && check.exitCode !== 0) issue(`${path}/exitCode`, "A passing execution requires observed exit code zero.");
    if (check.intent !== "coverage" && ["advisory", "coverage-unavailable"].includes(check.outcome)) {
      issue(`${path}/outcome`, "Build, lint and test obligations cannot be reclassified as coverage telemetry.");
    }
    if (payload.status === "passed" && check.required && check.intent !== "coverage" && check.outcome !== "passed") {
      issue(`${path}/outcome`, `Required ${check.intent} check is ${check.outcome}; aggregate cannot claim passed.`);
    }
  }
  if (context.expectedChecks) {
    for (const expected of context.expectedChecks) {
      const result = payload.checks.find(check => check.id === expected.id);
      if (!result) {
        if (payload.status === "passed" && expected.required && expected.intent !== "coverage") issue("/payload/checks", `Required check ${expected.id} has no result.`);
      } else if (result.intent !== expected.intent || result.required !== expected.required
        || JSON.stringify(result.command) !== JSON.stringify(expected.command) || result.cwd !== expected.cwd) {
        issue("/payload/checks", `Check ${expected.id} conflicts with its configured execution contract.`);
      }
    }
    for (const check of payload.checks) if (!context.expectedChecks.some(expected => expected.id === check.id)) issue("/payload/checks", `Check ${check.id} is not in the dispatched check set.`);
  }
  if (payload.status === "passed") {
    if (!payload.checks.some(check => check.intent !== "coverage" && check.outcome === "passed")) issue("/payload/checks", "No executed verification; use justified not_applicable when verification is not required.");
  }
  return diagnostics;
}
