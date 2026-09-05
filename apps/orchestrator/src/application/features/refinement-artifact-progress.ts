import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { PiJsonEvent } from "../../runtime/pi/pi-event-parser.js";

const coreArtifacts = [
  { path: "PhaseExecutionContract.json", generating: "Creating phase execution contract" },
  { path: "ArchitectureDebtTouchPlan.json", generating: "Creating architecture-debt touch plan" },
  { path: "FeatureTasks.md", generating: "Creating feature task inventory" },
  { path: "planning-analysis-report.md", generating: "Creating planning analysis" },
] as const;

interface ContractPhaseRef {
  document: string;
  id: string;
  order: number;
}

export interface RefinementArtifactProgressSnapshot {
  currentStep: string;
  lastCompletedArtifact: string | null;
  nextExpectedArtifact: string | null;
  phaseOrder: number | null;
  totalPhases: number | null;
}

/** Projects resumable refinement progress from durable files, never from phase titles or a fixed topology. */
export function projectRefinementArtifactProgress(folderPath: string): RefinementArtifactProgressSnapshot {
  const phases = readContractPhases(folderPath);
  for (const artifact of coreArtifacts) {
    if (!isNonEmptyFile(resolve(folderPath, artifact.path))) {
      return {
        currentStep: `Waiting to create ${artifact.path}`,
        lastCompletedArtifact: lastCompletedCoreArtifact(folderPath, artifact.path),
        nextExpectedArtifact: artifact.path,
        phaseOrder: null,
        totalPhases: phases.length || null,
      };
    }
  }
  for (const phase of phases) {
    if (!isNonEmptyFile(resolve(folderPath, phase.document))) {
      const previous = phases.filter((candidate) => candidate.order < phase.order)
        .filter((candidate) => isNonEmptyFile(resolve(folderPath, candidate.document))).at(-1);
      return {
        currentStep: `Generating Phase ${phase.order} of ${phases.length}`,
        lastCompletedArtifact: previous?.document ?? "planning-analysis-report.md",
        nextExpectedArtifact: phase.document,
        phaseOrder: phase.order,
        totalPhases: phases.length,
      };
    }
  }
  if (phases.length > 0) {
    const last = phases.at(-1)!;
    return {
      currentStep: `All ${phases.length} phase artifacts saved; validating refinement artifacts`,
      lastCompletedArtifact: last.document,
      nextExpectedArtifact: null,
      phaseOrder: last.order,
      totalPhases: phases.length,
    };
  }
  return {
    currentStep: "Core refinement artifacts saved; validating phase execution contract",
    lastCompletedArtifact: "planning-analysis-report.md",
    nextExpectedArtifact: "PhaseExecutionContract.json",
    phaseOrder: null,
    totalPhases: null,
  };
}

/** Converts trusted Pi write/edit events into persisted user-facing refinement milestones. */
export class RefinementArtifactProgressReporter {
  readonly #activeMutations = new Map<string, { existed: boolean; path: string }>();
  #pending = Promise.resolve();

  constructor(private readonly dependencies: {
    folderPath: string;
    record(currentStep: string, summary: string): Promise<void>;
  }) {}

  start(): void {
    this.#enqueue("Analysing feature and dependency context", "Refine Feature is analysing project context before generating artifacts.");
  }

  observe(event: PiJsonEvent): void {
    const eventType = typeof event.type === "string" ? event.type : "";
    const toolName = typeof event.toolName === "string" ? event.toolName : "";
    const toolCallId = typeof event.toolCallId === "string" && event.toolCallId ? event.toolCallId : `${toolName}:anonymous`;
    if (eventType === "tool_execution_start" && (toolName === "write" || toolName === "edit")) {
      const artifactPath = this.#authorizedArtifactPath(event.args);
      if (!artifactPath) return;
      const existed = isNonEmptyFile(resolve(this.dependencies.folderPath, artifactPath));
      this.#activeMutations.set(toolCallId, { existed, path: artifactPath });
      const step = this.#generatingStep(artifactPath, existed);
      this.#enqueue(step, `${step}. Existing valid artifacts remain available for resumable refinement.`);
      return;
    }
    if (eventType === "tool_execution_end" && this.#activeMutations.has(toolCallId)) {
      const mutation = this.#activeMutations.get(toolCallId)!;
      this.#activeMutations.delete(toolCallId);
      if (event.isError) return;
      const snapshot = projectRefinementArtifactProgress(this.dependencies.folderPath);
      const saved = this.#savedStep(mutation.path, mutation.existed);
      this.#enqueue(saved, `${saved}. ${snapshot.currentStep}.`);
    }
  }

  drain(): Promise<void> {
    return this.#pending;
  }

  #enqueue(currentStep: string, summary: string): void {
    this.#pending = this.#pending
      .then(() => this.dependencies.record(currentStep, summary))
      .catch(() => undefined);
  }

  #authorizedArtifactPath(args: unknown): string | null {
    if (!args || typeof args !== "object") return null;
    const rawPath = (args as Record<string, unknown>).path;
    if (typeof rawPath !== "string" || rawPath.trim() === "") return null;
    const absolutePath = isAbsolute(rawPath) ? resolve(rawPath) : resolve(this.dependencies.folderPath, rawPath);
    const featureRelative = relative(this.dependencies.folderPath, absolutePath).replaceAll("\\", "/");
    if (!featureRelative || featureRelative === ".." || featureRelative.startsWith("../") || isAbsolute(featureRelative)) return null;
    if (coreArtifacts.some((artifact) => artifact.path === featureRelative)) return featureRelative;
    return readContractPhases(this.dependencies.folderPath).some((phase) => phase.document === featureRelative)
      || /^Phases\/phase-\d+[^/]*\.md$/u.test(featureRelative)
      ? featureRelative
      : null;
  }

  #generatingStep(artifactPath: string, existed: boolean): string {
    const core = coreArtifacts.find((artifact) => artifact.path === artifactPath);
    if (core) return existed ? `Updating ${artifactPath}` : core.generating;
    const phases = readContractPhases(this.dependencies.folderPath);
    const phase = phases.find((candidate) => candidate.document === artifactPath);
    if (phase) return `${existed ? "Repairing" : "Generating"} Phase ${phase.order} of ${phases.length}`;
    return `${existed ? "Updating" : "Generating"} ${artifactPath}`;
  }

  #savedStep(artifactPath: string, existed: boolean): string {
    const phases = readContractPhases(this.dependencies.folderPath);
    const phase = phases.find((candidate) => candidate.document === artifactPath);
    if (phase) return `Phase ${phase.order} of ${phases.length} ${existed ? "repaired" : "saved"}`;
    return `${artifactPath} ${existed ? "updated" : "saved"}`;
  }
}

function readContractPhases(folderPath: string): ContractPhaseRef[] {
  try {
    const parsed = JSON.parse(readFileSync(resolve(folderPath, "PhaseExecutionContract.json"), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as Record<string, unknown>).phases)) return [];
    const phases = (parsed as { phases: unknown[] }).phases.flatMap((value): ContractPhaseRef[] => {
      if (!value || typeof value !== "object") return [];
      const phase = value as Record<string, unknown>;
      return Number.isInteger(phase.order) && typeof phase.document === "string" && typeof phase.id === "string"
        ? [{ document: phase.document.replaceAll("\\", "/"), id: phase.id, order: phase.order as number }]
        : [];
    });
    return phases.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  } catch {
    return [];
  }
}

function isNonEmptyFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile() && statSync(path).size > 0;
  } catch {
    return false;
  }
}

function lastCompletedCoreArtifact(folderPath: string, before: string): string | null {
  const index = coreArtifacts.findIndex((artifact) => artifact.path === before);
  return coreArtifacts.slice(0, index).filter((artifact) => isNonEmptyFile(resolve(folderPath, artifact.path))).at(-1)?.path ?? null;
}
