import { expect, it } from "vitest";
import type { WorkItemCard } from "@hepha/shared";
import { isCompletionReadinessRunning, completionReadinessActivityLabel } from "./completion-recovery-activity.js";

it.each([["inspecting", "Inspecting relevant tests"], ["correcting", "Correcting verification plan"], ["preparing", "Preparing test execution"], ["testing", "Running relevant tests"], ["checking", "Running supporting checks"], ["waiting", "Preparing next verification check"], ["validating", "Validating test reports"], ["assessing", "Evaluating test evidence"]])("labels server-owned stage %s", (stage, label) => {
  expect(completionReadinessActivityLabel({ verificationStage: stage } as never)).toBe(label);
});
it("shows the current check identity without claiming execution success", () => {
  expect(completionReadinessActivityLabel({ verificationStage: "checking", verificationCheckId: "static-lint" } as never)).toBe("Running supporting checks — static-lint");
});

it.each([
  ["feature", "03_IN_PROGRESS", false, "recovery-running", true],
  ["feature", "03_IN_PROGRESS", false, "assessment-incomplete", false],
  ["feature", "03_IN_PROGRESS", false, "coverage", false],
  ["feature", "03_IN_PROGRESS", true, "recovery-running", false],
  ["feature", "04_COMPLETED", false, "recovery-running", false],
  ["feature", "05_CANCELLED", false, "recovery-running", false],
  ["epic", "03_IN_PROGRESS", false, "recovery-running", false],
])("projects only a current server-owned feature refresh: %s %s %s %s", (kind, stateFolder, ready, id, expected) => {
  const item = { kind, stateFolder, completionRecovery: { ready, blockers: [{ id }] } } as unknown as WorkItemCard;
  expect(isCompletionReadinessRunning(item)).toBe(expected);
});

it("does not infer an active refresh from missing recovery data", () => {
  expect(isCompletionReadinessRunning({ kind: "feature", stateFolder: "03_IN_PROGRESS" } as WorkItemCard)).toBe(false);
});
it.each([true, false])("fresh verification locks controls only while its workflow is active: %s", active => {
  const item = { kind: "feature", stateFolder: "03_IN_PROGRESS", completionRecovery: { ready: false, blockers: [{ id: "fresh-verification" }] },
    featureWorkflow: { activeRun: active ? { runId: "fresh" } : null } } as unknown as WorkItemCard;
  expect(isCompletionReadinessRunning(item)).toBe(active);
});
