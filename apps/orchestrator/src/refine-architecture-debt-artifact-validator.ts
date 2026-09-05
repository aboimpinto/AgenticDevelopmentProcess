import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ARCHITECTURE_DEBT_TOUCH_PLAN_FILE,
  validateArchitectureDebtTouchPlan,
} from "./architecture-debt-touch-plan.js";
import type {
  ArtifactValidationError,
  RefineArtifactIdentity,
} from "./refine-artifact-validator.js";

/** Validates the refinement-only architecture-debt planning satellite. */
export function validateArchitectureDebtTouchPlanArtifact(
  featureFolderPath: string,
  expectedIdentity: RefineArtifactIdentity | undefined,
  errors: ArtifactValidationError[],
) {
  const planPath = resolve(featureFolderPath, ARCHITECTURE_DEBT_TOUCH_PLAN_FILE);
  if (!existsSync(planPath)) {
    errors.push({
      code: "MISSING_ARCHITECTURE_DEBT_TOUCH_PLAN",
      path: ARCHITECTURE_DEBT_TOUCH_PLAN_FILE,
      message: `${ARCHITECTURE_DEBT_TOUCH_PLAN_FILE} is a mandatory RefineFeature output.`,
    });
    return;
  }

  let rawPlan: unknown;
  try {
    rawPlan = JSON.parse(readFileSync(planPath, "utf8")) as unknown;
  } catch {
    errors.push({
      code: "INVALID_ARCHITECTURE_DEBT_TOUCH_PLAN",
      path: ARCHITECTURE_DEBT_TOUCH_PLAN_FILE,
      message: `${ARCHITECTURE_DEBT_TOUCH_PLAN_FILE} must contain valid JSON matching the V1 touch-plan contract.`,
    });
    return;
  }

  const validation = validateArchitectureDebtTouchPlan(rawPlan);
  if (validation.kind === "refusal") {
    errors.push({
      code: "INVALID_ARCHITECTURE_DEBT_TOUCH_PLAN",
      path: ARCHITECTURE_DEBT_TOUCH_PLAN_FILE,
      message: validation.message,
    });
    return;
  }

  if (expectedIdentity
    && (validation.plan.projectId !== expectedIdentity.projectId
      || validation.plan.featureId !== expectedIdentity.featureId)) {
    errors.push({
      code: "ARCHITECTURE_DEBT_TOUCH_PLAN_IDENTITY_MISMATCH",
      path: ARCHITECTURE_DEBT_TOUCH_PLAN_FILE,
      message: `${ARCHITECTURE_DEBT_TOUCH_PLAN_FILE} must identify project '${expectedIdentity.projectId}' and feature '${expectedIdentity.featureId}'.`,
    });
  }
}
