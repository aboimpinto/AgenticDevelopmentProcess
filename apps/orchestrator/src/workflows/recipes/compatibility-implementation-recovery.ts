import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { WorkItemCard } from "@hepha/shared";
import type { DevCycleMcpCompatibilityDependencies } from "./devcycle-mcp-compatibility-application.js";
import type { StoredProject } from "../../projects/stored-project.js";
import { compatibilityRecoveryKind } from "./compatibility-lifecycle-recovery-policy.js";

type Metadata = Parameters<DevCycleMcpCompatibilityDependencies["isWorkflowActive"]>[0];
const headerStatus = /^(\s*\*\*Status(?::)?\*\*\s*:?\s*)[A-Z0-9_]+([ \t]*\r?)$/im;

export function uniqueCompatibilityFeature(items: WorkItemCard[], externalId: string): WorkItemCard {
  const matches = items.filter(x => x.kind === "feature" && x.externalId === externalId);
  if (matches.length !== 1) throw new Error(`COMPATIBILITY_FEATURE_LOCATION: Expected exactly one feature location; found ${matches.length}. No location was selected.`);
  return matches[0]!;
}

/** One recovery allowance per user workflow, never a second implementation authority. */
export class CompatibilityImplementationRecovery {
  private used = false;
  constructor(private readonly dependencies: DevCycleMcpCompatibilityDependencies) {}

  async recover(feature: WorkItemCard, project: StoredProject, metadata: Metadata, allowReadyMove = false): Promise<WorkItemCard | null> {
    const kind = compatibilityRecoveryKind(feature, this.dependencies.validateImplementationArtifacts(feature.folderPath), allowReadyMove);
    if (!kind) return feature;
    if (!await this.dependencies.isWorkflowActive(metadata)) return null;
    if (this.used) return this.block(feature, metadata, "RECOVERY_EXHAUSTED: The lifecycle mismatch recurred after one repair. Inspect the worker output before retrying.");
    this.used = true;
    await this.dependencies.metadata.start({ ...metadata, currentNodeId: "implementation-recovery", currentStep: "Recovering implementation lifecycle state",
      summary: `Repairing ${kind === "status" ? "stale FeatureTasks status" : "unfinished Ready → In Progress folder move"}; implementation is paused until filesystem validation passes.` });
    this.dependencies.notifyChanged(project.id, "workflow.recovering", feature.externalId);
    try {
      if (!await this.dependencies.isWorkflowActive(metadata)) return null;
      const before = evidenceFingerprint(feature.folderPath);
      if (kind === "status") {
        // Only this independently recognized mechanical mismatch is host-owned.
        const path = resolve(feature.folderPath, "FeatureTasks.md");
        const document = readFileSync(path, "utf8");
        if (compatibilityRecoveryKind(feature, this.dependencies.validateImplementationArtifacts(feature.folderPath)) !== "status") {
          return this.block(feature, metadata, "RECOVERY_STATE_CHANGED: Artifacts changed before the header repair; inspect them before retrying.");
        }
        writeFileSync(path, document.replace(headerStatus, "$1IN_PROGRESS$2"), "utf8");
      } else {
        await this.dependencies.runWorker({ agentAction: "start-feature", agentName: "Implementation Lifecycle Recovery Agent",
          agentRole: "devcycle-mcp-compatibility", cardKey: metadata.cardKey, feature, project,
          plan: this.dependencies.resolvePlan("start-feature"), mcpProfile: true, runId: metadata.runId,
          phaseNumber: null, phaseTitle: null, maxRuntimeMs: 120000, timeoutMs: 120000, stallTimeoutMs: 60000,
          step: "Recovering unfinished implementation folder move (one attempt)",
          prompt: `HEPHA lifecycle repair only. The authorized start returned, but a fresh scan still locates ${feature.externalId} at ${feature.folderPath} in 02_READY_TO_DEVELOP.
Move that existing feature directory to its sibling 03_IN_PROGRESS state directory, preserving its basename and contents. Set only the FeatureTasks.md header Status to IN_PROGRESS. Never overwrite an existing destination; report conflicts.
Do not implement, activate or accept any phase or task. Do not invoke start-feature or continue-feature recipes. Do not change FeatureDescription, phase files, contracts, evidence, decisions, approvals or source code. Do not commit, push, delete, recreate, or finalize anything. Return after this repair or explain the blocker. Your response is not proof: HEPHA will rescan the filesystem, require a unique destination and validate that all other feature contents are unchanged.` });
      }
      if (!await this.dependencies.isWorkflowActive(metadata)) return null;
      const repaired = uniqueCompatibilityFeature(await this.dependencies.scanProject(project), feature.externalId);
      if (!await this.dependencies.isWorkflowActive(metadata)) return null;
      if (repaired.stateFolder !== "03_IN_PROGRESS" ||
          (kind === "move" && (existsSync(feature.folderPath) || repaired.folderPath !== resolve(feature.folderPath, "..", "..", "03_IN_PROGRESS", feature.folderName)))) {
        return this.block(feature, metadata, "RECOVERY_REJECTED: The unique In Progress folder move was not verified on disk.");
      }
      if (before !== evidenceFingerprint(repaired.folderPath)) {
        return this.block(repaired, metadata, "RECOVERY_SCOPE_EXCEEDED: Repair changed feature content beyond the lifecycle header. Inspect the diff; no phase was accepted by HEPHA.");
      }
      const result = this.dependencies.validateImplementationArtifacts(repaired.folderPath);
      if (!result.valid) return this.block(repaired, metadata, `RECOVERY_REJECTED: ${result.errors.map(e => `[${e.code}] ${e.path}: ${e.message}`).join("; ")}`);
      await this.dependencies.metadata.start({ ...metadata, currentNodeId: "implementation-loop", currentStep: "Implementation lifecycle recovery verified",
        summary: "Recovery verified on disk: unique In Progress folder, canonical task header and unchanged phase evidence. Resuming the authorized implementation boundary." });
      this.dependencies.notifyChanged(project.id, "workflow.recovered", repaired.externalId);
      return repaired;
    } catch (error) {
      if (!await this.dependencies.isWorkflowActive(metadata)) return null;
      return this.block(feature, metadata, `RECOVERY_REJECTED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async block(feature: WorkItemCard, metadata: Metadata, summary: string): Promise<null> {
    if (await this.dependencies.isWorkflowActive(metadata)) {
      await this.dependencies.metadata.block({ ...metadata, currentNodeId: "implementation-recovery", currentStep: "Implementation recovery requires attention", summary });
      this.dependencies.notifyChanged(metadata.projectId, "workflow.blocked", feature.externalId);
    }
    return null;
  }
}

/** Ignore exactly one lifecycle header; even unchecked task changes invalidate repair. */
function evidenceFingerprint(folder: string): string {
  const digest = createHash("sha256");
  const visit = (directory: string, prefix = "") => {
    for (const name of readdirSync(directory).sort()) {
      const path = resolve(directory, name), relative = `${prefix}${name}`, stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error("RECOVERY_UNSAFE_PATH: Feature contains a symbolic link.");
      if (stat.isDirectory()) { visit(path, `${relative}/`); continue; }
      if (!stat.isFile()) throw new Error("RECOVERY_UNSAFE_PATH: Feature contains a non-regular file.");
      const content = readFileSync(path);
      digest.update(JSON.stringify([relative, relative === "FeatureTasks.md"
        ? content.toString("utf8").replace(headerStatus, "$1<lifecycle-status>$2") : content.toString("base64")]));
    }
  };
  if (lstatSync(folder).isSymbolicLink()) throw new Error("RECOVERY_UNSAFE_PATH: Feature folder is a symbolic link.");
  visit(folder);
  return digest.digest("hex");
}
