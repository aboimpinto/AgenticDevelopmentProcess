import { readFileSync } from "node:fs";
import type { CardMetadataStore } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import {
  encodeManualTestDeferralSummary,
  MANUAL_TEST_DEFERRAL_SCHEMA,
  parseManualTestDeferrals,
  persistManualTestObligation,
  readManualTestObligations,
} from "../../manual-test-obligation.js";
import type { StoredProject } from "../../projects/stored-project.js";
import { getNumberedPhases } from "../phases/phase-lifecycle-policy.js";
import {
  readPhaseTaskLedgerItems,
  setPhaseTaskCheckbox,
  syncPhaseTaskStateSection,
} from "../phases/phase-task-document-repository.js";
import { readPhaseContractTaskId } from "../../phase-execution-contract.js";
import {
  recoverLegacyManualTestTask,
  resolveLegacyTaskHeading,
} from "../recovery/legacy-manual-test-recovery.js";

export async function seedRefinedManualTestSkips(input: {
  readonly cardKey: string;
  readonly feature: WorkItemCard;
  readonly project: StoredProject;
  readonly runId: string;
  readonly store: CardMetadataStore;
}): Promise<number> {
  const obligations = readManualTestObligations(input.feature.folderPath)?.obligations ?? [];
  for (const obligation of obligations) {
    await settleOne({
      ...input,
      deferral: {
        schemaVersion: MANUAL_TEST_DEFERRAL_SCHEMA,
        id: obligation.id,
        title: obligation.title,
        reason: obligation.reason,
        phaseNumber: obligation.phaseNumber,
        taskId: obligation.taskId,
        preconditions: obligation.preconditions,
        steps: obligation.steps,
        expectedResult: obligation.expectedResult,
        evidenceRequirements: obligation.evidenceRequirements,
      },
    });
  }
  return obligations.length;
}

/** Applies MCP worker deferrals through HEPHA-owned SQLite and Markdown ports. */
export async function applyCompatibilityManualTestDeferrals(input: {
  readonly cardKey: string;
  readonly feature: WorkItemCard;
  readonly output: string;
  readonly project: StoredProject;
  readonly runId: string;
  readonly store: CardMetadataStore;
}): Promise<number> {
  const deferrals = parseManualTestDeferrals(input.output);
  for (const deferral of deferrals) await settleOne({ ...input, deferral });
  return deferrals.length;
}

async function settleOne(input: {
  readonly cardKey: string;
  readonly deferral: ReturnType<typeof parseManualTestDeferrals>[number];
  readonly feature: WorkItemCard;
  readonly project: StoredProject;
  readonly runId: string;
  readonly store: CardMetadataStore;
}) {
  const { deferral } = input;
  const matches = getNumberedPhases(input.feature).flatMap((candidate) =>
    readPhaseTaskLedgerItems(candidate)
      .filter((task) => task.id === deferral.taskId || readPhaseContractTaskId(task.text) === deferral.taskId)
      .map((task) => ({ phase: candidate, task })),
  );
  if (matches.length === 0) {
    // Pre-V3 phase documents have no HEPHA task ledger. Recover the legacy
    // Markdown task as SKIPPED with the canonical reason and persist the
    // ManualTestObligations.json procedure instead of failing Start.
    const legacyPhase = getNumberedPhases(input.feature).find((phase) => phase.number === deferral.phaseNumber);
    if (legacyPhase && isLegacyPhaseDocument(legacyPhase.documentPath)) {
      recoverLegacyManualTestTask({
        featureFolderPath: input.feature.folderPath,
        featureId: input.feature.externalId,
        obligation: deferral,
        phaseDocumentPath: legacyPhase.documentPath,
        taskHeading: resolveLegacyTaskHeading(legacyPhase.documentPath, deferral.taskId),
      });
      return;
    }
  }
  if (matches.length !== 1) {
    throw new Error(`MANUAL_TEST_DEFERRAL_INVALID: task '${deferral.taskId}' must resolve to exactly one HEPHA phase-ledger task; found ${matches.length}.`);
  }
  const { phase, task } = matches[0]!;
  if (phase.number !== deferral.phaseNumber) {
    throw new Error(`MANUAL_TEST_DEFERRAL_INVALID: task '${deferral.taskId}' belongs to phase projection ${phase.number}, not ${deferral.phaseNumber}.`);
  }

  const obligationTaskId = readPhaseContractTaskId(task.text) ?? task.id;
  persistManualTestObligation(input.feature.folderPath, input.feature.externalId, { ...deferral, taskId: obligationTaskId });
  const now = new Date().toISOString();
  await input.store.recordImplementationTaskRun({
    cardKey: input.cardKey,
    completedAt: now,
    currentStep: `Skipped task ${task.taskIndex + 1}: ${task.text}`,
    error: null,
    phaseNumber: phase.number,
    phaseTitle: phase.title,
    projectId: input.project.id,
    section: task.section,
    sourceLine: task.lineNumber,
    startedAt: now,
    status: "SKIPPED",
    summary: encodeManualTestDeferralSummary({ ...deferral, taskId: obligationTaskId }),
    taskId: task.id,
    taskIndex: task.taskIndex,
    taskTitle: task.text,
    workflowRunId: input.runId,
  });
  setPhaseTaskCheckbox(phase, task, true);
  const taskRuns = await input.store.listImplementationTaskRuns(input.project.id, input.cardKey, phase.number);
  syncPhaseTaskStateSection(phase, readPhaseTaskLedgerItems(phase), taskRuns);
}

function isLegacyPhaseDocument(documentPath: string): boolean {
  return !/^##\s*Phase Task Ledger\s*$/im.test(readFileSync(documentPath, "utf8"));
}
