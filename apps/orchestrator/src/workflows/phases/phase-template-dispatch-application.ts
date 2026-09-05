import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import type { PhaseTemplateRepairCommandResult } from "../../phase-template-repair-command.js";

type NumberedPhase = PhaseSummary & { number: number };

export interface PhaseTemplateAlignmentProgress {
  readonly agent: string;
  readonly cardKey: string;
  readonly command: FeatureWorkflowCommand;
  readonly currentStep: string;
  readonly feature: WorkItemCard;
  readonly model: string;
  readonly phase: NumberedPhase;
  readonly project: StoredProject;
  readonly runId: string;
  readonly status: "implementing";
  readonly summary: string;
}

export interface PhaseTemplateAlignmentWorker {
  readonly agentAction: "resolve-review-findings";
  readonly agentName: string;
  readonly agentRole: string;
  readonly cardKey: string;
  readonly feature: WorkItemCard;
  readonly plan: import("@hepha/shared").HandoffPlanV1;
  readonly phaseNumber: number;
  readonly phaseTitle: string;
  readonly project: StoredProject;
  readonly prompt: string;
  readonly runId: string;
  readonly step: string;
}

/** Normalizes, repairs, verifies, and gates one arbitrary phase before dispatch. */
export class PhaseTemplateDispatchApplication {
  constructor(private readonly dependencies: {
    assertDispatchAllowed: (featureFolderPath: string, phaseNumber: number) => void;
    normalize: (featureFolderPath: string) => string[];
    prepareRepair: (featureId: string, featureFolderPath: string) => PhaseTemplateRepairCommandResult;
    recordProgress: (input: PhaseTemplateAlignmentProgress) => Promise<void>;
    refreshFeature: (project: StoredProject, externalId: string, fallback: WorkItemCard) => Promise<WorkItemCard>;
    runWorker: (input: PhaseTemplateAlignmentWorker) => Promise<unknown>;
    verifyRepair: (featureId: string, featureFolderPath: string) => PhaseTemplateRepairCommandResult;
  }) {}

  async prepare(input: {
    cardKey: string;
    command: FeatureWorkflowCommand;
    feature: WorkItemCard;
    model: import("@hepha/shared").HandoffPlanV1;
    phase: NumberedPhase;
    project: StoredProject;
    runId: string;
    onRepairStarted?: (context: { agent: string; currentStep: string; model: string; phase: NumberedPhase; summary: string }) => void;
  }): Promise<{ feature: WorkItemCard; phase: NumberedPhase; summaries: string[] }> {
    let feature = input.feature;
    let phase = input.phase;
    const summaries: string[] = [];
    const normalized = this.dependencies.normalize(feature.folderPath);
    if (normalized.length > 0) {
      summaries.push(`Phase ${phase.number}: Hepha normalized invalid machine fields in ${normalized.join(", ")}.`);
      feature = await this.dependencies.refreshFeature(input.project, feature.externalId, feature);
      phase = findPhase(feature, phase);
    }

    const repair = this.dependencies.prepareRepair(feature.externalId, feature.folderPath);
    if (repair.kind === "repair_required") {
      const step = `Repair Phase Template Phase ${phase.number}`;
      input.onRepairStarted?.({
        agent: "Phase Template Alignment Agent",
        currentStep: `${step} failed`,
        model: input.model.resolvedRoute.route.modelId,
        phase,
        summary: `Phase ${phase.number} template alignment failed.`,
      });
      await this.dependencies.recordProgress({
        agent: "Phase Template Alignment Agent", cardKey: input.cardKey, command: input.command,
        currentStep: step, feature, model: input.model.resolvedRoute.route.modelId, phase, project: input.project, runId: input.runId,
        status: "implementing", summary: "Repairing only the reported phase-template diagnostics before normal phase dispatch.",
      });
      await this.dependencies.runWorker({
        agentAction: "resolve-review-findings",
        agentName: "Phase Template Alignment Agent", agentRole: "phase-template-alignment", cardKey: input.cardKey,
        feature, plan: input.model, phaseNumber: phase.number, phaseTitle: phase.title || `Phase ${phase.number}`,
        project: input.project, prompt: repair.prompt, runId: input.runId, step,
      });
      const verified = this.dependencies.verifyRepair(feature.externalId, feature.folderPath);
      if (verified.kind !== "valid") {
        throw new Error(`Phase ${phase.number} phase-template repair did not clear all diagnostics. ${verified.diagnostics
          .map((diagnostic) => `${diagnostic.file}:${diagnostic.line} expected ${diagnostic.expected}; actual ${diagnostic.actual}`).join("\n")}`);
      }
      summaries.push(`Phase ${phase.number}: repaired phase-template diagnostics before dispatch.`);
      feature = await this.dependencies.refreshFeature(input.project, feature.externalId, feature);
      phase = findPhase(feature, phase);
    }
    this.dependencies.assertDispatchAllowed(feature.folderPath, phase.number);
    return { feature, phase, summaries };
  }
}

function findPhase(feature: WorkItemCard, fallback: NumberedPhase): NumberedPhase {
  return feature.phases.find((candidate): candidate is NumberedPhase => candidate.number === fallback.number) ?? fallback;
}
