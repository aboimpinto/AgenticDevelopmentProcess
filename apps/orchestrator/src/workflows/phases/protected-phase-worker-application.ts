import type { FeatureWorkflowCommand, PhaseSummary, WorkItemCard } from "@hepha/shared";
import type {
  TestCoverageEnforcementResult,
  TestCoverageSnapshot,
} from "../../test-coverage-preservation-adapter.js";
import type { StoredProject } from "../../projects/stored-project.js";

type NumberedPhase = PhaseSummary & { number: number };

/** Runs one worker while restoring any mutation to tests or machine-owned workflow state. */
export class ProtectedPhaseWorkerApplication<TMachineState> {
  constructor(private readonly dependencies: {
    captureCoverage: (projectRoot: string) => TestCoverageSnapshot;
    captureMachineState: (feature: WorkItemCard, phase: NumberedPhase) => TMachineState;
    enforceCoverage: (snapshot: TestCoverageSnapshot) => TestCoverageEnforcementResult;
    recordWorkflowProgress: (input: {
      cardKey: string;
      command: FeatureWorkflowCommand;
      currentStep: string;
      feature: WorkItemCard;
      project: StoredProject;
      runId: string;
      summary: string;
    }) => Promise<void>;
    restoreMachineState: (snapshot: TMachineState) => string[];
  }) {}

  async execute(input: {
    cardKey: string;
    command: FeatureWorkflowCommand;
    feature: WorkItemCard;
    phase: NumberedPhase;
    phaseRef: string;
    project: StoredProject;
    run: () => Promise<string | null>;
    runId: string;
  }): Promise<{ output: string; testCoverage: TestCoverageEnforcementResult }> {
    const machineState = this.dependencies.captureMachineState(input.feature, input.phase);
    const coverageSnapshot = this.dependencies.captureCoverage(input.project.rootPath);
    let output: string | null = null;
    let workerError: unknown = null;
    try {
      output = await input.run();
    } catch (error) {
      workerError = error;
    }
    const testCoverage = this.dependencies.enforceCoverage(coverageSnapshot);
    const restoredPaths = this.dependencies.restoreMachineState(machineState);
    if (restoredPaths.length > 0) {
      await this.dependencies.recordWorkflowProgress({
        cardKey: input.cardKey,
        command: input.command,
        currentStep: `${input.phaseRef}: protected workflow state restored`,
        feature: input.feature,
        project: input.project,
        runId: input.runId,
        summary: `Hepha restored worker mutations to machine-owned state: ${restoredPaths.join(", ")}.`,
      });
    }
    if (workerError !== null) throw workerError;
    if (output === null) throw new Error(`${input.phaseRef} worker returned no output.`);
    return { output, testCoverage };
  }
}
