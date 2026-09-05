import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  selectNextOrderedPhaseTask,
  selectOrderedPhaseExit,
  selectOrderedTaskTransition,
  type OrderedPhaseTask,
} from "../src/ordered-phase-task-policy.js";

const featurePath = fileURLToPath(new URL("./ordered-phase-task-execution.feature", import.meta.url));
const startWorkflowPath = fileURLToPath(new URL("../../../.workflows/start-implementing.workflow.yaml", import.meta.url));
const continueWorkflowPath = fileURLToPath(new URL("../../../.workflows/continue-implementing.workflow.yaml", import.meta.url));
const autonomousWorkflowPath = fileURLToPath(new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url));
const phaseExitApplicationPath = fileURLToPath(new URL("../src/workflows/phases/phase-exit-application.ts", import.meta.url));
const phaseExitLifecycleApplicationPath = fileURLToPath(new URL("../src/workflows/phases/phase-exit-lifecycle-application.ts", import.meta.url));
const implementationCompletionPath = fileURLToPath(new URL("../src/workflows/phases/implementation-completion-application.ts", import.meta.url));
const taskSettlementPath = fileURLToPath(
  new URL("../src/workflows/phases/phase-worker-task-settlement-application.ts", import.meta.url),
);
const reviewRequirementApplicationPath = fileURLToPath(
  new URL("../src/workflows/reviews/phase-review-requirement-application.ts", import.meta.url),
);

describe("ordered phase task Gherkin integration", () => {
  const feature = readFileSync(featurePath, "utf8");

  it("documents only generic task-order scenarios", () => {
    expect(feature).toContain("Scenario: Review and checkpoint are both declared");
    expect(feature).toContain("Scenario: Checkpoint exists without code review");
    expect(feature).toContain("Scenario: Code review exists without checkpoint");
    expect(feature).toContain("Scenario: Another implementation task follows review");
    expect(feature).toContain("Scenario: A task-specific recoverable failure stays on that task");
    expect(feature).toContain("Scenario: A single documentation task is the complete phase");
    expect(feature).toContain("Scenario: Fixing review findings does not approve the review");
    expect(feature).toContain("Scenario: Checked prose cannot replace durable review approval");
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|dashboard|architecture debt/i);
  });

  it("keeps Start and Continue on the same ordered-task workflow", () => {
    for (const path of [startWorkflowPath, continueWorkflowPath]) {
      const workflow = readFileSync(path, "utf8");
      expect(workflow).toContain("NEXT_DECLARED_PHASE_TASK_EXISTS");
      expect(workflow).toContain("CURRENT_TASK_REQUIRES_REPAIR_OR_RETRY");
      expect(workflow).toContain("CURRENT_TASK_COMPLETED");
      expect(workflow).toContain("NO_DECLARED_PHASE_TASK_REMAINS");
      expect(workflow).not.toContain("REVIEW_APPROVED_AND_FINAL_CHECKPOINT_REQUIRED");
    }
  });

  it("does not append an implicit feature checkpoint after every V2 phase queue is exhausted", () => {
    const autonomousWorkflow = readFileSync(autonomousWorkflowPath, "utf8");
    const phaseExitApplication = readFileSync(phaseExitApplicationPath, "utf8");
    const phaseExitLifecycleApplication = readFileSync(phaseExitLifecycleApplicationPath, "utf8");
    const implementationCompletion = readFileSync(implementationCompletionPath, "utf8");
    const taskSettlement = readFileSync(taskSettlementPath, "utf8");
    const reviewRequirementApplication = readFileSync(reviewRequirementApplicationPath, "utf8");
    expect(implementationCompletion).toContain("if (input.usesOrderedPhaseWorkflow)");
    expect(implementationCompletion).toContain("All declared tasks in all contract phases are resolved.");
    expect(reviewRequirementApplication).toContain("!this.dependencies.isOrderedTaskWorkflow(input.contract)");
    expect(taskSettlement).toContain("input.resolvingReviewFindings ? \"FIXER_SUCCEEDED\" : \"SUCCEEDED\"");
    expect(autonomousWorkflow).toContain("this.dependencies.exit.execute({");
    expect(phaseExitLifecycleApplication).toContain("this.dependencies.authorize({");
    expect(phaseExitApplication).toContain("selectOrderedExit({");
    expect(autonomousWorkflow).toContain("reviewRequirement.orderedReviewRequired");
  });

  it("executes arbitrary declared order through the pure selector", () => {
    const tasks: OrderedPhaseTask[] = [
      { id: "alpha", executor: "verification", required: true },
      { id: "beta", executor: "agent", required: true },
      { id: "gamma", executor: "code_review", required: true },
      { id: "delta", executor: "git_commit", required: true },
    ];
    const state = new Map<string, "COMPLETED">();

    for (const task of tasks) {
      expect(selectNextOrderedPhaseTask({ tasks, stateByTaskId: state }))
        .toEqual({ kind: "execute_task", task });
      state.set(task.id, "COMPLETED");
    }
    expect(selectNextOrderedPhaseTask({ tasks, stateByTaskId: state }))
      .toEqual({ kind: "phase_complete" });
  });

  it("keeps code-review and verification recovery local to their current task", () => {
    expect(selectOrderedTaskTransition(
      { id: "anything", executor: "code_review", required: true },
      "NEEDS_CHANGES",
    )).toEqual({ kind: "retry_current_task", worker: "fixer" });
    expect(selectOrderedTaskTransition(
      { id: "anything-else", executor: "verification", required: true },
      "RECOVERABLE_FAILURE",
    )).toEqual({ kind: "retry_current_task", worker: "checkpoint_repair" });
    expect(selectOrderedTaskTransition(
      { id: "anything", executor: "code_review", required: true },
      "FIXER_SUCCEEDED",
    )).toEqual({ kind: "retry_current_task", worker: "reviewer" });
  });

  it("requires durable approval before a declared review phase can exit", () => {
    expect(selectOrderedPhaseExit({
      tasksComplete: true,
      reviewRequired: true,
      durableReviewApproved: false,
    })).toEqual({ kind: "blocked", missing: "durable_review_approval" });
  });

  it("completes a one-task documentation phase without implicit gates", () => {
    const tasks: OrderedPhaseTask[] = [
      { id: "write-operator-note", executor: "agent", required: true },
    ];
    expect(selectNextOrderedPhaseTask({
      tasks,
      stateByTaskId: new Map([["write-operator-note", "COMPLETED"]]),
    })).toEqual({ kind: "phase_complete" });
  });
});
