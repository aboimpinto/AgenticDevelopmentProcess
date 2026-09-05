import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import {
  deriveWorkflowReceipt,
  hashFileAtPath,
  hashText,
  resolveArtifactPath,
  validateWorkflowReceipt,
  type ContextPackRef,
  type ReceiptContextEntry,
} from "../../workflow-receipt.js";

export interface WorkflowTransitionReceiptInput {
  cardKey: string;
  command: string;
  context: ReceiptContextEntry[];
  contextPackRefs?: ContextPackRef[];
  nextState: string;
  projectId: string;
  projectRoot: string;
  stage: string;
  status?: "pending" | "complete" | "failed" | "blocked";
}

export interface WorkflowTransitionContextPack {
  name: string;
  packId: string;
  path: string;
}

/** Derives and validates transition receipts and their deterministic feature context. */
export class WorkflowTransitionReceiptPolicy {
  constructor(private readonly dependencies: { normalizePath(fromPath: string, toPath: string): string }) {}

  validate({
    cardKey, command, context, stage, nextState, projectId, projectRoot,
    status = "pending", contextPackRefs,
  }: WorkflowTransitionReceiptInput): Error | undefined {
    const receipt = deriveWorkflowReceipt({
      cardKey,
      command,
      selectedContext: context,
      selectedContextVersion: "selected-context-v1",
      contextPackRefs,
      stage,
      status,
      nextState,
      projectId,
    });
    const result = validateWorkflowReceipt(receipt, projectRoot);
    if (!result.valid) {
      const failureMessages = result.failures
        .map((failure) => `  - [${failure.code}] ${failure.field}: ${failure.message}`)
        .join("\n");
      return new Error(`Receipt validation blocked the ${stage} transition:\n${failureMessages}`);
    }
    return undefined;
  }

  createContext(
    project: StoredProject,
    feature: WorkItemCard,
    contextPack?: WorkflowTransitionContextPack,
  ): { context: ReceiptContextEntry[]; packRefs: ContextPackRef[] } {
    const context: ReceiptContextEntry[] = [];
    const packRefs: ContextPackRef[] = [];
    if (contextPack) packRefs.push({ packId: contextPack.packId, name: contextPack.name, path: contextPack.path });

    if (feature.documentPath && feature.specMarkdown.trim()) {
      const normalizedPath = this.dependencies.normalizePath(project.rootPath, feature.documentPath);
      const resolvedPath = resolveArtifactPath(feature.documentPath, project.rootPath);
      const diskHash = resolvedPath ? hashFileAtPath(resolvedPath) : null;
      context.push({
        kind: "file", path: normalizedPath, hash: diskHash ?? hashText(feature.specMarkdown),
        packId: contextPack?.packId, displayPath: normalizedPath,
        description: `${feature.externalId} source document`,
      });
    }

    const featureTasksPath = resolve(feature.folderPath, "FeatureTasks.md");
    if (existsSync(featureTasksPath)) {
      const normalizedPath = this.dependencies.normalizePath(project.rootPath, featureTasksPath);
      const diskHash = hashFileAtPath(featureTasksPath);
      context.push({
        kind: "file", path: normalizedPath,
        hash: diskHash ?? hashText(readFileSync(featureTasksPath, "utf8")),
        packId: contextPack?.packId, displayPath: normalizedPath,
        description: `${feature.externalId} refinement task plan`,
      });
    }

    context.push({
      kind: "workflow",
      path: `.workflows/${feature.kind === "feature" ? "feature" : feature.kind}-${feature.stateFolder}.metadata`,
      hash: null,
      packId: undefined,
      displayPath: undefined,
      description: `${feature.externalId} workflow state metadata`,
    });
    return { context, packRefs };
  }
}
