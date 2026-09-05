import type {
  FeatureWorkflowCommand,
  FeatureWorkflowProgressSummary,
  FeatureWorkflowStepStatus,
} from "@hepha/shared";
import type { HephaFeatureWorkflowNode, HephaFeatureWorkflowSpec } from "../../feature-workflow-spec.js";

export interface FeatureWorkflowProgressProjectorDependencies {
  readonly loadSpec: (command: FeatureWorkflowCommand) => HephaFeatureWorkflowSpec;
}

export interface FeatureWorkflowProgressInput {
  command: FeatureWorkflowCommand;
  currentNodeId: string | null;
  currentStep: string | null;
  status: "running" | "completed" | "failed" | "blocked" | "cancelled";
}

export class FeatureWorkflowProgressProjector {
  readonly #dependencies: FeatureWorkflowProgressProjectorDependencies;

  constructor(dependencies: FeatureWorkflowProgressProjectorDependencies) {
    this.#dependencies = dependencies;
  }

  build(input: FeatureWorkflowProgressInput): FeatureWorkflowProgressSummary | null {
    try {
      const spec = this.#dependencies.loadSpec(input.command);
      const activeIndex = input.currentNodeId
        ? spec.nodes.findIndex((node) => node.id === input.currentNodeId)
        : -1;
      const resolvedCurrentNodeId = activeIndex >= 0 ? spec.nodes[activeIndex]!.id : null;

      return {
        currentNodeId: resolvedCurrentNodeId,
        steps: spec.nodes.map((node, index) => ({
          detail: getWorkflowStepDetail(node, index, activeIndex, input.currentStep),
          id: node.id,
          kind: node.kind,
          label: formatWorkflowStepLabel(node.id),
          status: getWorkflowStepStatus(input.status, index, activeIndex),
        })),
      };
    } catch {
      return null;
    }
  }
}

function getWorkflowStepStatus(
  runStatus: FeatureWorkflowProgressInput["status"],
  index: number,
  activeIndex: number,
): FeatureWorkflowStepStatus {
  if (runStatus === "completed") {
    return "completed";
  }
  if (activeIndex < 0) {
    return runStatus === "running" ? "pending" : "failed";
  }
  if (index < activeIndex) {
    return "completed";
  }
  if (index === activeIndex) {
    return runStatus === "running" ? "running" : "failed";
  }
  return "pending";
}

function getWorkflowStepDetail(
  node: HephaFeatureWorkflowNode,
  index: number,
  activeIndex: number,
  currentStep: string | null,
) {
  if (index === activeIndex && currentStep) {
    return currentStep;
  }
  return cleanWorkflowTemplateText(node.summary) ?? cleanWorkflowTemplateText(node.status);
}

function cleanWorkflowTemplateText(value: string | null | undefined) {
  if (!value || value.includes("{{")) {
    return null;
  }
  return value;
}

function formatWorkflowStepLabel(nodeId: string) {
  return nodeId
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
