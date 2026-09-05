import type {
  FeatureWorkflowCommand,
  FeatureWorkflowRunSummary,
  WorkItemCard,
} from "@hepha/shared";
import { formatFeatureWorkflowCommand } from "../../application/features/feature-workflow-message-policy.js";
import {
  formatCodeReviewFindingForPrompt,
  type CodeReviewFindingDecisionItem,
} from "../reviews/code-review-finding-parser.js";
import {
  isCodeReviewAgentFailure,
  isCodeReviewBlockedFailure,
  isMissingLocalToolingFailure,
  isUnsafeCargoExecutionFailure,
} from "./implementation-failure-classifier.js";

export interface CodeReviewFailureBriefContext {
  readonly excerpt: string;
  readonly findings: CodeReviewFindingDecisionItem[];
  readonly phaseNumber: number;
  readonly reportPath: string;
  readonly reviewResult: string;
}

interface WorkflowFailureBriefPresenterDependencies {
  readonly findCodeReviewContext: (rawError: string) => CodeReviewFailureBriefContext | null;
  readonly summarizeWorkflowOutput: (output: string, fallback: string) => string;
}

export class WorkflowFailureBriefPresenter {
  constructor(private readonly dependencies: WorkflowFailureBriefPresenterDependencies) {}

  create(input: {
    command: FeatureWorkflowCommand;
    currentStep?: string | null;
    feature: WorkItemCard;
    rawError: string;
    runId: string;
  }): string {
    const analysis = getWorkflowFailureAnalysis(input.rawError);
    const codeReviewContext = this.dependencies.findCodeReviewContext(input.rawError);
    const lines = [
      "## Previous Workflow Failure Brief",
      "",
      "This is a compact persistent failure summary from the last workflow attempt. Use it before retrying; do not re-read the full log unless the brief is insufficient.",
      "",
      `- Feature: ${input.feature.externalId}`,
      `- Failed command: ${formatFeatureWorkflowCommand(input.command)}`,
      `- Run ID: ${input.runId}`,
    ];

    if (input.currentStep) lines.push(`- Failed step: ${input.currentStep}`);
    lines.push(
      `- Raw failure reason: ${truncate(input.rawError.trim(), 700)}`,
      `- Failure summary: ${analysis.summary}`,
      `- Likely cause: ${analysis.likelyCause}`,
      `- Suggested recovery: ${analysis.suggestedRecovery}`,
      `- Retry instruction: ${analysis.retryInstruction}`,
    );
    if (codeReviewContext) lines.push("", renderCodeReviewBlockerSection(codeReviewContext));
    return lines.join("\n");
  }

  compact(
    lastRun: FeatureWorkflowRunSummary,
    feature: WorkItemCard,
    persistedSummary: string,
  ): string {
    const codeReviewContext = this.dependencies.findCodeReviewContext(persistedSummary);
    const lines = [
      "## Previous Workflow Failure Brief",
      "",
      "This is the current compact failure summary. Full retry history remains in workflow logs.",
      "",
      `- Feature: ${feature.externalId}`,
      `- Failed command: ${formatFeatureWorkflowCommand(lastRun.command)}`,
      `- Run ID: ${lastRun.runId}`,
      `- Failed step: ${lastRun.currentStep ?? "Unknown"}`,
      `- Failure summary: ${codeReviewContext ? "The latest code-review gate requires changes." : this.dependencies.summarizeWorkflowOutput(persistedSummary, "The latest workflow attempt failed.")}`,
    ];
    if (codeReviewContext) lines.push("", renderCodeReviewBlockerSection(codeReviewContext));
    return lines.join("\n");
  }
}

export function appendRecoveryAnalysisToFailureBrief(failureBrief: string, recoveryOutput: string): string {
  return replaceFailureBriefSection(failureBrief, "Workflow Recovery Agent Analysis", recoveryOutput);
}

export function appendHostSideRecoveryToFailureBrief(failureBrief: string, recoverySummary: string): string {
  return replaceFailureBriefSection(failureBrief, "Host-Side Recovery", recoverySummary);
}

export function replaceFailureBriefSection(failureBrief: string, heading: string, content: string): string {
  const transientSection = /^##\s+(?:Workflow Recovery Agent Analysis|Host-Side Recovery)\s*$/im;
  const start = failureBrief.search(transientSection);
  const base = (start === -1 ? failureBrief : failureBrief.slice(0, start)).trimEnd();
  const compactContent = truncate(stripMarkdownFence(content).trim(), 1800);
  return `${base}\n\n## ${heading}\n\n${compactContent}`;
}

export function renderCodeReviewBlockerSection(context: CodeReviewFailureBriefContext): string {
  const lines = [
    "## Code Review Blocker",
    "",
    `- Phase: Phase ${context.phaseNumber}`,
    `- Review report: ${context.reportPath}`,
    `- Review result: ${context.reviewResult}`,
    "- Required behavior: do not advance to later phases until every BLOCKER/REQUIRED review finding has a complete fixer proposal or is escalated as `BLOCKED_NEEDS_USER`, every note-level finding has a complete fixer proposal, and a new independent review approves the phase. A recovery worker cannot decide that a finding is fixed.",
    "- Retry behavior: reread the phase task ledger, preserve checked items, use the Review Finding Decision Queue as the entry point, then run review again.",
    "- Finding ledger behavior: create or update a Review Finding Decision Ledger with columns finding_id, severity, fixer_decision, rationale/evidence, files_changed, follow_up, and lesson_candidate. Label the state column `Fixer Decision` or `Fixer Proposal`; never present it as a final reviewer decision.",
    "- Fixer states: for every finding use exactly one `FIX_PROPOSED`, `REBUTTAL_PROPOSED`, or `BLOCKED_NEEDS_USER` token. Do not write fixed, deferred, accepted, rebutted, accepted_risk, or closed. Only the next independent reviewer can use `FIX_ACCEPTED`, `REBUTTAL_ACCEPTED_DEFERRED`, `REBUTTAL_REJECTED`, `FINDING_OPEN`, `NOT_APPLICABLE`, or `BLOCKED_NEEDS_USER`.",
    "- Blocking proposals: BLOCKER/REQUIRED findings must have `FIX_PROPOSED`, `REBUTTAL_PROPOSED`, or `BLOCKED_NEEDS_USER` before review rerun. A `FIX_PROPOSED` must include every requested acceptance-evidence result; a failed test means the proposal is incomplete and must not be recorded as fixed.",
    "- A `FIX_PROPOSED` is valid only when its response maps every original acceptance-evidence item to an exact test/check and records the executed passing result. Do not change production code merely to preserve a legacy fixture: update a test only when it contradicts the reviewer-owned acceptance contract, and say why. Never weaken, delete, skip, or relabel an acceptance test to make a proposal green.",
    "- Stale-claim sweep: when a finding concerns false evidence, test scope, or overclaiming, search touched docs and code comments for related wording before proposing the work for review.",
    "- Recovery scope: findings may require MemoryBank/documentation fixes, artifact durability fixes, whitespace cleanup, or focused local commits even when the project source diff is empty.",
    "- Scope guard: change only files needed by BLOCKER/REQUIRED fixes or explicitly selected note decisions. Do not rewrite unrelated sections, introduce new evidence formats, add hashes/timestamps, or reopen PlanReviewer-approved planning scope unless a listed finding explicitly requires it.",
    "- Git safety: make only focused local commits when a review explicitly requires durable artifacts; never include unrelated files and never push.",
  ];
  if (context.findings.length > 0) {
    lines.push("", "### Review Finding Decision Queue", "");
    for (const finding of context.findings) lines.push(`- ${formatCodeReviewFindingForPrompt(finding)}`);
  }
  if (context.excerpt) {
    lines.push("", "- Review excerpt: retained in the saved review report; the decision queue above is the complete worker entry point.");
  }
  return lines.join("\n");
}

export function getWorkflowFailureAnalysis(rawError: string) {
  const normalized = rawError.toLowerCase();
  if (rawError.includes("WORKFLOW_AWAITING_USER_DECISION")) {
    return {
      likelyCause: "The host returned to the same phase route and decision after a recovery cycle while the authoritative FEAT, task, review, and checkpoint evidence remained byte-for-byte unchanged.",
      retryInstruction: "Preserve completed tasks, inspect the reported authority mismatch, and let the user choose Continue Implementation after repair or Cancel.",
      suggestedRecovery: "Inspect the paused route, durable fingerprint, and last decision. Do not rerun completed tasks or keep consuming resources; Hepha is blocked and waiting for an explicit user decision.",
      summary: "The implementation workflow paused for a user decision after proving that its recovery cycle made no durable progress.",
    };
  }
  if (normalized.includes("cannot become completed while a declared task remains unresolved")) {
    return {
      likelyCause: "Phase-exit task authority disagreed with the contract queue after refresh; this is a host ledger-reconciliation defect when durable contract tasks are already complete, not evidence that an implementation worker omitted work.",
      retryInstruction: "Reconcile the explicit Phase Task Ledger with durable contract-task rows, then resume at phase exit or the declared git checkpoint without rerunning completed tasks.",
      suggestedRecovery: "Inspect only the explicit Phase Task Ledger and durable task rows. Do not treat checkpoint sign-offs, acceptance checklists, or unrelated Markdown checkboxes as executable tasks.",
      summary: "The host phase-exit guard reported unresolved work after the declared task queue was exhausted.",
    };
  }
  if (rawError.includes("RUNTIME_INVALID_CONTEXT")) {
    return {
      likelyCause: "The host rejected the phase invocation context before Pi launched; this is a runtime context-contract defect, not an implementation-worker decision or code failure.",
      retryInstruction: "Repair the host context projection, then resume from the same unresolved task without discarding phase artifacts or rerunning completed preparation.",
      suggestedRecovery: "Inspect zero-based phase identity, contract/task pairing, and strict context fields before attempting model or implementation changes.",
      summary: "The implementation worker did not launch because its host runtime context was invalid.",
    };
  }
  if (isCodeReviewAgentFailure(rawError)) {
    return {
      likelyCause: "The code-review worker failed while gathering review evidence before it could return the required review result.",
      retryInstruction: "Rerun the code-review gate from the already-applied review-fix state, using robust absolute-path inspection commands and always returning one exact Review Result line.",
      suggestedRecovery: "Do not rerun implementation just to reach the same marker. Resume at the code-review gate, correct any shell/path mistakes, and produce a review report.",
      summary: "The code-review worker failed before producing a review verdict.",
    };
  }
  if (isUnsafeCargoExecutionFailure(normalized)) {
    return {
      likelyCause: "The implementation agent triggered a host-side command safety guard by backgrounding Cargo, emitting sibling Cargo tool calls that Pi may run concurrently, or starting Cargo while a prior call remained active.",
      retryInstruction: "Reread Project LessonsLearned Active Rules, keep all Cargo invocations in one foreground shell flow, and wait for that complete result before starting another Cargo tool call.",
      suggestedRecovery: "Resume the same phase from the current files. Sequential Cargo invocations are permitted; background and sibling concurrent Cargo execution are not.",
      summary: "Hepha stopped the worker because it violated a project command safety constraint.",
    };
  }
  if (normalized.includes("cargo: command not found") || normalized.includes("cargo.exe") || normalized.includes("could not find cargo")) {
    return {
      likelyCause: "The worker shell cannot find the Rust toolchain on PATH.",
      retryInstruction: "Use the installed Cargo binary, repair PATH, or install the Rust toolchain with a safe user-level installer before running validation.",
      suggestedRecovery: "Check `command -v cargo` and `/mnt/c/Users/aboim/.cargo/bin/cargo.exe`. If Cargo is absent, install Rust/Cargo in the worker shell using a non-interactive user-level method, then retry the phase.",
      summary: "The implementation worker could not execute Cargo validation.",
    };
  }
  if (isMissingLocalToolingFailure(normalized)) {
    return {
      likelyCause: "The worker shell is missing a local developer tool or project dependency required by the phase validation.",
      retryInstruction: "Repair PATH, install the missing user-level tool, or install project dependencies with the repository's documented package manager before retrying validation.",
      suggestedRecovery: "Check the exact missing command/module, prefer existing lockfile/package-manager conventions, avoid global or privileged installs when a project-local install is available, then retry the phase.",
      summary: "The implementation worker could not run a required local tool or dependency.",
    };
  }
  if (/401 authentication|api key|missing provider credential|missing pi chatgpt login/.test(normalized)) {
    return {
      likelyCause: "The selected routing connection is not authenticated for the requested action.",
      retryInstruction: "Repair the configured provider connection or select an available policy route before retrying the phase.",
      suggestedRecovery: "Verify the configured connection through supported provider management, then resolve the action again. Do not use an environment model default or substitute route.",
      summary: "The model call failed before the worker could produce implementation output.",
    };
  }
  if (normalized.includes("refine feature")
    && /(?:stalled after|maximum runtime|timed out after)/u.test(normalized)) {
    const stalled = normalized.includes("stalled after");
    return {
      likelyCause: stalled
        ? "The refinement worker produced no observable Pi or tool activity for the configured stall interval."
        : "The refinement worker reached an explicitly configured maximum runtime before completing the handoff.",
      retryInstruction: "Rerun Refine Feature. It must validate existing core and phase artifacts, preserve valid files, and continue from the first missing or invalid artifact.",
      suggestedRecovery: "Use the saved last-artifact and next-artifact position. Do not restart from an implementation phase task, and do not delete valid partial refinement output.",
      summary: stalled
        ? "Refinement stalled; its durable artifact position is resumable."
        : "Refinement reached the configured maximum runtime; its durable artifact position is resumable.",
    };
  }
  if (/(?:timed out after|stalled after|maximum runtime)/u.test(normalized)) {
    return {
      likelyCause: "The Pi worker exceeded its configured liveness or maximum-runtime circuit before returning a final result.",
      retryInstruction: "Inspect the latest workflow console output, then resume from the last durable checkpoint instead of repeating completed work.",
      suggestedRecovery: "Check whether the worker stopped producing activity or reached an explicit operator maximum, then retry from durable workflow evidence.",
      summary: "The workflow stopped at a configured runtime circuit before completion.",
    };
  }
  if (isCodeReviewBlockedFailure(rawError)) {
    return {
      likelyCause: "The implementation phase completed, but the autonomous code-review gate found issues that must be fixed before phase advancement.",
      retryInstruction: "Enter the Resolve Findings step for the same phase, read the phase task ledger, preserve checked items, fix BLOCKER/REQUIRED code-review findings or escalate blocked_needs_user, and evaluate every WITH_NOTES/NON_BLOCKING/POLISH/OUT_OF_SCOPE note with a ledger decision. Update LessonsLearned only for reusable failure/cause/fix/prevention patterns, then run review again.",
      suggestedRecovery: "Read the saved code-review report from the failure brief, apply the requested code/test/doc/MemoryBank/git-state fixes in the repository that owns each artifact, justify deferred or accepted-risk notes in the decision ledger, and do not continue to later phases until a rerun returns Review Result: APPROVED.",
      summary: "The code-review gate returned NEEDS_CHANGES/BLOCKED and stopped autonomous phase advancement.",
    };
  }
  if (rawError.includes("REFINE_FEATURE_RESULT_V1_INVALID:")) {
    return {
      likelyCause: "The refinement worker completed filesystem work but returned a result envelope that did not satisfy the strict Refine Feature Result V1 contract.",
      retryInstruction: "If the FEAT is already Ready and its complete artifacts pass readiness gates, recover completion without rerunning artifact generation. Otherwise rerun refinement and return only feature-folder-relative files entries.",
      suggestedRecovery: "Keep valid artifacts. COMPLETED.files must not include the project root, MemoryBank/Features, lifecycle folder, or FEAT folder prefix.",
      summary: "The refinement result envelope was invalid; durable artifacts require recovery evaluation.",
    };
  }
  if (rawError.includes("Refinement artifacts failed validation:")) {
    return {
      likelyCause: "The refine-feature workflow completed artifact generation but the artifacts did not pass structural validation. One or more required files are missing, empty, malformed, or have incorrect metadata.",
      retryInstruction: "Inspect each [CODE] entry in the raw failure reason. Fix the listed artifacts: create missing files, fill empty files, add required metadata sections, or correct invalid quality gate decisions. Then rerun refinement from the same FEAT.",
      suggestedRecovery: "Use the error codes to identify the exact problem per artifact: MISSING_FILE (create the file), EMPTY_FILE (add content), MISSING_STATUS_METADATA (add **Status:** PENDING line), MISSING_QUALITY_GATE_TABLE (add section with gate rows), PREMATURELY_SATISFIED_GATE (change 'satisfied' to 'missing'), MISSING_PHASE_INVENTORY_TABLE (add Status column to FeatureTasks.md table), or INCOMPLETE_PHASE_COVERAGE (add missing phase rows).",
      summary: "Refinement artifacts failed structural validation and could not be promoted.",
    };
  }
  return {
    likelyCause: "The worker failed after starting the workflow; the raw failure reason is the primary clue.",
    retryInstruction: "Resume from the first unchecked or invalidated phase task, address the raw failure reason first, then update phase and FeatureTasks status before finishing.",
    suggestedRecovery: "Use the saved raw failure reason and current working tree state to continue; inspect full logs only if this brief does not provide enough detail.",
    summary: "The previous workflow attempt failed and needs targeted recovery before normal phase work continues.",
  };
}

function stripMarkdownFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}
