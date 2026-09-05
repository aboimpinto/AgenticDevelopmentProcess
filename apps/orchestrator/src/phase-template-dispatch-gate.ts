import {
  PHASE_TEMPLATE_INVALID_CODE,
  validatePhaseTemplate,
  type PhaseTemplateDiagnostic,
  type PhaseTemplateValidationResult,
} from "./phase-template-validator.js";

export type PhaseTemplateDispatchDecision =
  | { readonly kind: "allow" }
  | {
    readonly kind: "block";
    readonly code: typeof PHASE_TEMPLATE_INVALID_CODE;
    readonly diagnostics: readonly PhaseTemplateDiagnostic[];
    readonly message: string;
  };

/**
 * The sole structural-document gate for normal phase resume/dispatch. It only
 * accepts a completed canonical validator result; worker exceptions and prose
 * are deliberately not inputs and cannot be mistaken for template defects.
 */
export function evaluatePhaseTemplateDispatchGate(
  validation: PhaseTemplateValidationResult,
): PhaseTemplateDispatchDecision {
  if (validation.valid) return { kind: "allow" };

  const detail = validation.diagnostics
    .map((diagnostic) => `${diagnostic.file}:${diagnostic.line} expected ${diagnostic.expected}; actual ${diagnostic.actual}`)
    .join("\n");
  return {
    kind: "block",
    code: PHASE_TEMPLATE_INVALID_CODE,
    diagnostics: validation.diagnostics,
    message: `${PHASE_TEMPLATE_INVALID_CODE}: ${validation.version} validation failed.\n${detail}`,
  };
}

export function assertPhaseTemplateDispatchAllowed(featureFolderPath: string, phaseNumber: number): void {
  const decision = evaluatePhaseTemplateDispatchGate(validatePhaseTemplate(featureFolderPath, { phaseNumbers: [phaseNumber] }));
  if (decision.kind === "block") throw new PhaseTemplateInvalidError(decision);
}

export class PhaseTemplateInvalidError extends Error {
  readonly code = PHASE_TEMPLATE_INVALID_CODE;
  readonly diagnostics: readonly PhaseTemplateDiagnostic[];

  constructor(decision: Extract<PhaseTemplateDispatchDecision, { kind: "block" }>) {
    super(decision.message);
    this.name = "PhaseTemplateInvalidError";
    this.diagnostics = decision.diagnostics;
  }
}

export function isPhaseTemplateInvalidError(error: unknown): error is PhaseTemplateInvalidError {
  // Do not classify arbitrary worker text as a template defect. Only the
  // dispatch gate can construct this error from a completed validation result.
  return error instanceof PhaseTemplateInvalidError;
}
