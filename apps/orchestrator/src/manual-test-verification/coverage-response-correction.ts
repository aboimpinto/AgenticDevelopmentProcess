import { createHash } from "node:crypto";
import { join } from "node:path";
import { writeFileAtomic } from "./artifact-storage.js";
import { runCoverageStage, type CoverageAssessmentCheckpoint } from "./coverage-assessment-checkpoints.js";
import { COVERAGE_PROMPT_LIMIT } from "./coverage-assessment-batches.js";
import { VerificationRecoveryProgress } from "./verification-recovery-progress.js";

/** Leave room for a bounded, value-free correction request without dropping evidence. */
export const ASSESSMENT_PROMPT_LIMIT = COVERAGE_PROMPT_LIMIT - 1800;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
interface FieldIssue { path: string; expected: string; actual: string }

export class CoverageResponseValidationError extends Error {
  readonly issue: FieldIssue;
  constructor(path: string, expected: string, value: unknown) {
    const actual = value === null ? "null" : Array.isArray(value) ? `array(length=${value.length})`
      : typeof value === "string" ? `string(length=${value.length})` : typeof value;
    super(`${path.includes(".execution") ? "Invalid existing-test execution requirement" : "Invalid coverage response"} at ${path}: expected ${expected}; received ${actual}.`);
    this.issue = { path, expected, actual };
  }
}

/** Schema failures get context-aware correction while validation progresses. Transport failures and invalid evidence are not retried here.
 * Rejected values never enter prompts, diagnostics or checkpoint evidence. */
export async function runCorrectableCoverageStage<T>(prompt: string, runPrompt: (prompt: string) => Promise<string>,
  validate: (response: string) => T, checkpoint?: CoverageAssessmentCheckpoint, budget = { measure: (text: string) => text.length, limit: COVERAGE_PROMPT_LIMIT }): Promise<T> {
  return runCoverageStage(prompt, original => correctCoverageResponse(original, runPrompt, validate, checkpoint, budget), validate, checkpoint, !checkpoint?.reassessDecisions);
}

async function correctCoverageResponse(original: string, runPrompt: (prompt: string) => Promise<string>,
  validate: (response: string) => unknown, checkpoint: CoverageAssessmentCheckpoint | undefined, budget: { measure: (text: string) => number; limit: number }): Promise<string> {
    let nextPrompt = original;
    const progress = new VerificationRecoveryProgress();
    for (let attempt = 1; ; attempt++) {
      const response = await runPrompt(nextPrompt);
      try { validate(response); return response; }
      catch (error) {
        if (!(error instanceof CoverageResponseValidationError)) throw error;
        const observation = progress.observe([JSON.stringify({ path: error.issue.path, expected: error.issue.expected })]);
        const stageHash = hash(JSON.stringify([checkpoint?.fingerprint, original]));
        const diagnostic = `rejected-responses/${stageHash}-${attempt}.json`;
        if (checkpoint) writeFileAtomic(join(checkpoint.directory, diagnostic), JSON.stringify({
          schema: "coverage-response-diagnostic/v1", stageHash, attempt, recordedAt: new Date().toISOString(),
          responseHash: hash(response), responseLength: response.length, issue: error.issue,
        }, null, 2));
        if (observation.exhausted) throw new Error(`${error.message} Coverage response recovery made no validation progress after repeated corrections.${checkpoint ? ` Field diagnostics: ${diagnostic}.` : ""}`);
        nextPrompt = `${original}\n\nResponse schema correction (attempt ${attempt}). Same evidence and authority; return the complete assessment JSON again.\nInvalid field: ${JSON.stringify(error.issue)}\nCorrect the field shape without inventing commands, paths, results or coverage. Omit optional fields when unknown; do not return null in their place. Preserve unresolved requirements and valid evidence decisions. Do not drop an unresolved requirement or claim coverage merely to satisfy the schema. Do not execute tests, change files, approve or complete anything.`
          + (observation.repeated ? " This field remains invalid: reassess the schema and previous correction before responding. Repeating changed prose without correcting the field is not progress." : "");
        if (budget.measure(nextPrompt) > budget.limit) throw new Error(`${error.message} Correction would exceed the assessment prompt bound; retry readiness with a bounded assessment.`);
      }
    }
}
