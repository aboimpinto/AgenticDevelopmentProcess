import type { VerificationDiagnosis } from "@hepha/shared";
import { CoverageResponseValidationError } from "./coverage-response-correction.js";

export function validateVerificationDiagnosis(value: unknown, path = "diagnosis"): VerificationDiagnosis {
  const fail = (field: string): never => { throw new CoverageResponseValidationError(`${path}.${field}`, "bounded, source-cited verification diagnosis", undefined); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("kind");
  const d = value as VerificationDiagnosis;
  const text = (value: unknown, max: number) => typeof value === "string" && !!value.trim() && value.length <= max && !value.includes("\0");
  if (!["implementation_missing", "execution_missing", "environment_blocked", "evidence_missing", "investigation_required"].includes(d.kind)) return fail("kind");
  if (!text(d.explanation, 4000)) return fail("explanation");
  if (!text(d.nextAction, 4000)) return fail("nextAction");
  if (!Array.isArray(d.references) || !d.references.length || d.references.length > 30 || !d.references.every(ref => text(ref, 1000))) return fail("references");
  return { kind: d.kind, explanation: d.explanation, references: [...new Set(d.references)], nextAction: d.nextAction };
}
