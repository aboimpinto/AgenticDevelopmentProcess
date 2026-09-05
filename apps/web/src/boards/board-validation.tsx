import type { WorkItemCard, FeatureImplementationEvidenceSummary, FeatureFindingSummary, FeatureWorkflowRunSummary } from "@hepha/shared";
import { getCompletedFeatureTimestamp } from "./board-types.js";
import { formatDateTime } from "./board-helpers.js";
import { AlertTriangle, BadgeCheck, Clock3, Loader2 } from "lucide-react";

// ─── Helper functions ─────────────────────────────────────────────────────

function countMissingQualityGates(phases: FeatureImplementationEvidenceSummary["phaseQualityGates"]) {
  return phases.reduce(
    (count, phase) =>
      isResolvedPhaseQualitySummary(phase)
        ? count + phase.gates.filter((gate) => gate.status === "missing").length
        : count,
    0,
  );
}

function isResolvedPhaseQualitySummary(phase: FeatureImplementationEvidenceSummary["phaseQualityGates"][number]) {
  const normalizedStatus = phase.phaseStatus.toUpperCase();

  return normalizedStatus === "COMPLETED" || normalizedStatus === "SKIPPED";
}

function isImplementationWorkflowCommand(
  command: NonNullable<NonNullable<WorkItemCard["featureWorkflow"]>["lastRun"]>["command"] | null | undefined,
) {
  return command === "start-implementing" || command === "continue-implementing" || command === "complete-feature";
}

function isSupersededImplementationFailure(
  item: WorkItemCard,
  workflow: WorkItemCard["featureWorkflow"],
  implementationCompleted: boolean,
) {
  const lastRun = workflow?.lastRun ?? null;

  if (!lastRun || lastRun.status !== "failed" || !isImplementationWorkflowCommand(lastRun.command)) {
    return false;
  }

  if (item.stateFolder === "04_COMPLETED" && lastRun.command !== "complete-feature") {
    return true;
  }

  return implementationCompleted && lastRun.command !== "complete-feature";
}

function isSupersededWorkflowFailure(
  item: WorkItemCard,
  workflow: WorkItemCard["featureWorkflow"],
  implementationCompleted: boolean,
) {
  const lastRun = workflow?.lastRun ?? null;

  if (!lastRun || lastRun.status !== "failed") {
    return false;
  }

  if (isImplementationWorkflowCommand(lastRun.command)) {
    return isSupersededImplementationFailure(item, workflow, implementationCompleted);
  }

  if (lastRun.command === "design-feature") {
    return Boolean(workflow?.hasDesignArtifacts);
  }

  if (lastRun.command === "refine-feature") {
    return Boolean(workflow?.hasRefinementArtifacts && item.stateFolder !== "01_SUBMITTED");
  }

  return false;
}

function getSupersededWorkflowRecoveryOutcome(
  item: WorkItemCard,
  workflow: WorkItemCard["featureWorkflow"],
  implementationCompleted: boolean,
  command?: NonNullable<NonNullable<WorkItemCard["featureWorkflow"]>["lastRun"]>["command"],
) {
  const lastRun = workflow?.lastRun ?? null;

  if (!lastRun || (command && lastRun.command !== command)) {
    return null;
  }

  const detailSource = [lastRun.error, lastRun.summary, workflow?.workflowMessage].filter(Boolean).join(" ");
  const recoveredBySummary = /\bRecovered (?:timeout|workflow stop)\b/i.test(detailSource);

  if (!recoveredBySummary && !isSupersededWorkflowFailure(item, workflow, implementationCompleted)) {
    return null;
  }

  const timedOut = isWorkflowTimeoutText(detailSource);
  const label = timedOut ? "timeout recovered" : "workflow recovered";

  if (lastRun.command === "refine-feature" && workflow?.hasRefinementArtifacts) {
    const detail =
      `${timedOut ? "Recovered refine timeout" : "Recovered refine workflow stop"}: ` +
      "FeatureTasks.md and numbered phase files are present. " +
      `${timedOut ? "Pi timed out before returning its final refine report." : "Pi stopped before returning a clean refine completion signal."} ` +
      "No required refinement artifacts are missing.";

    return { detail, label };
  }

  if (lastRun.command === "design-feature" && workflow?.hasDesignArtifacts) {
    const detail =
      `${timedOut ? "Recovered design timeout" : "Recovered design workflow stop"}: ` +
      "UI requirement artifacts are present. " +
      `${timedOut ? "Pi timed out before returning its final design report." : "Pi stopped before returning a clean design completion signal."} ` +
      "No required design artifacts are missing.";

    return { detail, label };
  }

  return {
    detail: lastRun.summary ?? lastRun.error ?? "The previous workflow stop was superseded by the current FEAT state.",
    label,
  };
}

function isWorkflowTimeoutText(value: string | null | undefined) {
  return /\b(?:timed out after|timeout after|timed out|timeout)\b/i.test(value ?? "");
}

function getStoppedImplementationOutcome(
  workflow: WorkItemCard["featureWorkflow"],
  implementationCompleted: boolean,
) {
  const lastRun = workflow?.lastRun ?? null;

  if (
    implementationCompleted &&
    lastRun?.status !== "running" &&
    (lastRun?.status !== "failed" || lastRun.command !== "complete-feature")
  ) {
    return {
      detail: "Implementation phases are complete. Manual tests and user code review are next.",
      label: "All phases completed",
      tone: "success" as const,
    };
  }

  if (!lastRun || !isImplementationWorkflowCommand(lastRun.command) || lastRun.status === "running") {
    return null;
  }

  const currentWorkflowPhaseRuns = (workflow?.implementationPhases ?? []).filter(
    (phaseRun) => phaseRun.workflowRunId === lastRun.runId,
  );
  const latestPhaseRun = [...currentWorkflowPhaseRuns].sort(
    (left, right) => getPhaseRunTime(right) - getPhaseRunTime(left),
  )[0];

  if (latestPhaseRun) {
    const phaseLabel = `Phase ${latestPhaseRun.phaseNumber}`;
    const phaseStatus = getStoppedImplementationPhaseStatus(latestPhaseRun.status, lastRun.status);

    return {
      detail:
        latestPhaseRun.error ??
        latestPhaseRun.summary ??
        latestPhaseRun.currentStep ??
        lastRun.error ??
        lastRun.summary ??
        `${phaseLabel} ${phaseStatus}.`,
      label: `${phaseLabel} ${phaseStatus}`,
      tone: phaseStatus === "failed" || phaseStatus === "blocked" ? ("blocked" as const) : ("success" as const),
    };
  }

  return {
    detail:
      lastRun.error ??
      lastRun.summary ??
      (lastRun.completedAt ? `Stopped ${formatDateTime(lastRun.completedAt)}` : "Implementation stopped."),
    label: lastRun.status === "failed" ? "Implementation failed" : "Implementation stopped",
    tone: lastRun.status === "failed" ? ("blocked" as const) : ("success" as const),
  };
}

function getStoppedImplementationPhaseStatus(
  status: NonNullable<WorkItemCard["featureWorkflow"]>["implementationPhases"][number]["status"],
  workflowStatus: NonNullable<NonNullable<WorkItemCard["featureWorkflow"]>["lastRun"]>["status"],
) {
  if (status === "completed") {
    return "completed";
  }

  if (status === "failed" || workflowStatus === "failed") {
    return "failed";
  }

  if (status === "blocked") {
    return "blocked";
  }

  return "stopped";
}

function getPhaseRunTime(
  phaseRun: NonNullable<WorkItemCard["featureWorkflow"]>["implementationPhases"][number],
) {
  return new Date(phaseRun.completedAt ?? phaseRun.updatedAt ?? phaseRun.startedAt ?? 0).getTime();
}

function formatFeatureWorkflowCommand(
  command: NonNullable<NonNullable<WorkItemCard["featureWorkflow"]>["activeRun"]>["command"],
) {
  switch (command) {
    case "deep-dive-epic":
      return "EPIC Deep-Dive";
    case "deep-dive-feature":
      return "FEAT Deep-Dive";
    case "design-feature":
      return "Create UI Requirements";
    case "refine-feature":
      return "Refine Feature";
    case "start-implementing":
      return "Start Implementing";
    case "continue-implementing":
      return "Continue Implementing";
    case "complete-feature":
      return "Complete Feature";
    default:
      return "Unknown";
  }
}

// ─── getValidationBadges ──────────────────────────────────────────────────

interface ValidationBadge {
  icon: typeof AlertTriangle | typeof BadgeCheck | typeof Clock3 | typeof Loader2;
  label: string;
  spinning?: boolean;
  title: string;
  tone: "warning" | "blocked" | "neutral" | "success";
}

function getValidationBadges(item: WorkItemCard): ValidationBadge[] {
  const validation = item.validation;
  const badges: ValidationBadge[] = [];

  if (item.stateFolder === "04_COMPLETED") {
    return badges;
  }

  const workflow = item.featureWorkflow;
  const activeRun = workflow?.activeRun;
  const implementationCompleted = Boolean(workflow?.implementationCompleted);
  const recoveredWorkflowOutcome = getSupersededWorkflowRecoveryOutcome(item, workflow, implementationCompleted);
  const missingQualityGateCount = countMissingQualityGates(item.implementationEvidence?.phaseQualityGates ?? []);

  const openFindings = workflow?.findings.filter((finding) => finding.status !== "closed") ?? [];
  const runningFinding = openFindings.find((finding) => finding.status === "agent_running") ?? null;
  const humanReviewComplete = Boolean(workflow?.userCodeReviewCompletedAt && workflow.manualTestsCompletedAt);
  const needsHumanReview =
    item.kind === "feature" &&
    item.stateFolder === "03_IN_PROGRESS" &&
    implementationCompleted &&
    (!humanReviewComplete || openFindings.length > 0);
  const failedRun =
    workflow?.lastRun?.status === "failed" &&
    !isSupersededWorkflowFailure(item, workflow, implementationCompleted)
      ? workflow.lastRun
      : null;
  const stoppedImplementationOutcome = getStoppedImplementationOutcome(workflow, implementationCompleted);

  if (activeRun) {
    const activeLabel = activeRun.currentStep ?? `${formatFeatureWorkflowCommand(activeRun.command)} running`;

    badges.push({
      icon: Loader2,
      label: activeLabel,
      spinning: true,
      title: `${formatFeatureWorkflowCommand(activeRun.command)} running. ${activeRun.currentStep ?? `Started at ${formatDateTime(activeRun.startedAt)}`}.`,
      tone: "success",
    });
  }

  if (!activeRun && failedRun) {
    badges.push({
      icon: AlertTriangle,
      label: stoppedImplementationOutcome?.label ?? `${formatFeatureWorkflowCommand(failedRun.command)} failed`,
      title: stoppedImplementationOutcome?.detail ?? failedRun.error ?? failedRun.summary ?? "The last workflow failed.",
      tone: "blocked",
    });
  }

  if (!activeRun && !failedRun && recoveredWorkflowOutcome) {
    badges.push({
      icon: Clock3,
      label: recoveredWorkflowOutcome.label,
      title: recoveredWorkflowOutcome.detail,
      tone: "warning",
    });
  }

  if (!activeRun && !failedRun && stoppedImplementationOutcome) {
    badges.push({
      icon: BadgeCheck,
      label: stoppedImplementationOutcome.label,
      title: stoppedImplementationOutcome.detail,
      tone: "success",
    });
  }

  if (!activeRun && implementationCompleted && missingQualityGateCount > 0) {
    badges.push({
      icon: AlertTriangle,
      label: `${missingQualityGateCount} quality gap${missingQualityGateCount === 1 ? "" : "s"}`,
      title: "Run Continue Implementation to add missing evidence or explicit justified waivers before completing this FEAT.",
      tone: "blocked",
    });
  }

  if (!activeRun && needsHumanReview && stoppedImplementationOutcome?.label !== "All phases completed") {
    badges.push({
      icon: runningFinding ? Loader2 : Clock3,
      label: runningFinding
        ? "finding fix running"
        : openFindings.length > 0
          ? `${openFindings.length} finding${openFindings.length === 1 ? "" : "s"} need review`
          : "Manual Test / User Review",
      spinning: Boolean(runningFinding),
      title: runningFinding
        ? runningFinding.currentStep ?? "A finding fix agent is running."
        : openFindings.length > 0
          ? "User-submitted review findings are still open."
          : workflow?.workflowMessage ?? "Implementation phases are complete. User review and manual tests are required.",
      tone: runningFinding ? "success" : "warning",
    });
  } else if (
    !activeRun &&
    !failedRun &&
    implementationCompleted &&
    humanReviewComplete &&
    openFindings.length === 0 &&
    missingQualityGateCount === 0
  ) {
    badges.push({
      icon: BadgeCheck,
      label: "review complete",
      title: "Implementation phases, user code review, and manual tests are complete.",
      tone: "success",
    });
  }

  if (validation.needsValidationCount > 0) {
    badges.push({
      icon: AlertTriangle,
      label: `${validation.needsValidationCount} needs validation`,
      title: "This source document contains [NEEDS VALIDATION] markers.",
      tone: "blocked",
    });

    return badges;
  }

  // Compact phase status badge (FEAT-007)
  if (item.kind === "feature" && item.phases.length > 0) {
    const completedCount = item.phases.filter((p) => p.status === "COMPLETED" || p.status === "SKIPPED").length;
    const totalCount = item.phases.length;
    const hasBlockedPhase = item.phases.some((p) => p.status === "BLOCKED");
    const currentPhase = item.phases.find(
      (p) =>
        p.status !== "COMPLETED" &&
        p.status !== "SKIPPED" &&
        p.status !== "BLOCKED",
    );

    if (hasBlockedPhase) {
      badges.push({
        icon: AlertTriangle,
        label: `${completedCount}/${totalCount} phases blocked`,
        title: "One or more phases are blocked.",
        tone: "blocked",
      });
    } else if (currentPhase) {
      badges.push({
        icon: Clock3,
        label: `Phase ${currentPhase.number ?? "?"}: ${currentPhase.title}`,
        title: `Phase ${currentPhase.number ?? "?"} is ${currentPhase.status.toLowerCase().replace(/_/g, " ")}.`,
        tone: "neutral",
      });
    } else if (completedCount === totalCount) {
      badges.push({
        icon: BadgeCheck,
        label: `${completedCount}/${totalCount} phases done`,
        title: "All phases are complete.",
        tone: "success",
      });
    }
  }

  return badges;
}

// ─── ValidationBadges component ─────────────────────────────────────────

interface ValidationBadgesProps {
  item: WorkItemCard;
}

export function ValidationBadges({ item }: ValidationBadgesProps) {
  const badges = getValidationBadges(item);

  if (badges.length === 0) {
    return null;
  }

  return (
    <div className="card-validation-row" aria-label="Validation status">
      {badges.map((badge) => {
        const Icon = badge.icon;

        return (
          <span className={`validation-badge ${badge.tone}`} key={badge.label} title={badge.title}>
            <Icon className={badge.spinning ? "spin-icon" : undefined} size={12} aria-hidden="true" />
            {badge.label}
          </span>
        );
      })}
    </div>
  );
}
