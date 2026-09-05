// ---------------------------------------------------------------------------
// State machine: transition compatibility helper
// ---------------------------------------------------------------------------
//
// This module provides a pure function that validates whether a workflow
// run status transition is allowed for a given lifecycle command.
//
// It contains no I/O, no side effects, and no dependency on DB or
// orchestrator state — it is a pure state-machine compatibility check.
//
// Usage:
//   import { isAllowedTransition } from "./workflow-state-machine.js";
//
//   if (!isAllowedTransition("running", "cancelled", "cancel")) {
//     throw new Error("Cannot cancel a non-running workflow.");
//   }
//
// ---------------------------------------------------------------------------

// Type aliases for the state machine helper.
// These match the shared type definitions used by the orchestrator.
type FeatureWorkflowCommand =
  | "deep-dive-epic"
  | "deep-dive-feature"
  | "design-feature"
  | "refine-feature"
  | "start-implementing"
  | "continue-implementing"
  | "complete-feature"
  | "cancel";

type FeatureWorkflowRunStatus = "running" | "completed" | "failed" | "blocked" | "cancelled";

/**
 * Allowed transition map.
 *
 * Key format: "sourceStatus→command"  (no wildcard — explicit only)
 * Value: allowed target status(es).
 *
 * The NOT_STARTED source is used for transitions that happen before the
 * first workflow run record (e.g., refine-completion → READY, which uses
 * a different recording path).
 */
const ALLOWED_TRANSITIONS: Record<string, FeatureWorkflowRunStatus[]> = {
  // --- start-implementing ---
  // READY → IN_PROGRESS (running)
  "not_started→start-implementing": ["running"],

  // --- continue-implementing ---
  // IN_PROGRESS → IN_PROGRESS (new running run)
  "failed→continue-implementing": ["running"],
  "cancelled→continue-implementing": ["running"],

  // --- complete-feature ---
  "running→complete-feature": ["completed"],
  "failed→complete-feature": ["completed"],
  "cancelled→complete-feature": ["completed"],

  // --- cancel ---
  "running→cancel": ["cancelled"],

  // --- recovery (auto-recovery from failure) ---
  "failed→recovery": ["running"],
  "cancelled→recovery": ["running"],
  "blocked→recovery": ["running"],

  // --- refine-feature completion ---
  // SUBMITTED → READY_TO_DEVELOP (no workflow run record)
  "not_started→refine-feature": ["completed"],

  // --- design-feature completion ---
  "not_started→design-feature": ["completed"],
};

/**
 * Check whether a workflow run status transition is allowed.
 *
 * @param sourceStatus - Current workflow run status, or "not_started" if
 *   no previous run exists (first run for the work item).
 * @param command - The lifecycle command requesting the transition.
 * @param targetStatus - The intended target status.
 * @returns `true` if the transition is explicitly allowed, `false` otherwise.
 */
export function isAllowedTransition(
  sourceStatus: FeatureWorkflowRunStatus | "not_started",
  command: FeatureWorkflowCommand | "recovery",
  targetStatus: FeatureWorkflowRunStatus,
): boolean {
  const key = `${sourceStatus}→${command}`;
  const allowed = ALLOWED_TRANSITIONS[key];
  if (!allowed) {
    return false;
  }
  return allowed.includes(targetStatus);
}

/**
 * Return a human-readable reason string when a transition is not allowed,
 * or `null` when the transition is allowed.
 */
export function describeBlockedTransition(
  sourceStatus: FeatureWorkflowRunStatus | "not_started",
  command: FeatureWorkflowCommand | "recovery",
  targetStatus: FeatureWorkflowRunStatus,
): string | null {
  if (isAllowedTransition(sourceStatus, command, targetStatus)) {
    return null;
  }

  const key = `${sourceStatus}→${command}`;
  const allowed = ALLOWED_TRANSITIONS[key];

  if (!allowed) {
    return `No transition rule for status "${sourceStatus}" with command "${command}".`;
  }

  return `Transition from "${sourceStatus}" to "${targetStatus}" with command "${command}" is not allowed. Allowed target(s): ${allowed.join(", ")}.`;
}
