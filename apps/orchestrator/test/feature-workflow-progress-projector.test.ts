import type { HephaFeatureWorkflowSpec } from "../src/feature-workflow-spec.js";
import { describe, expect, it, vi } from "vitest";
import { FeatureWorkflowProgressProjector } from "../src/application/features/feature-workflow-progress-projector.js";

const spec: HephaFeatureWorkflowSpec = {
  command: "continue-implementing",
  description: null,
  name: "Generic continuation",
  path: "/workflow.yml",
  nodes: [
    { dependsOn: [], id: "refresh-state", kind: "action", status: "Refresh", summary: "Read state" },
    { dependsOn: ["refresh-state"], id: "implementation_loop", kind: "loop", status: "{{ dynamic }}" },
    { dependsOn: ["implementation_loop"], id: "finish", kind: "gate", status: "Finish" },
  ],
};

describe("feature workflow progress projector", () => {
  it("projects completed, active, and pending nodes around a known cursor", () => {
    const projector = new FeatureWorkflowProgressProjector({ loadSpec: () => spec });
    expect(projector.build({
      command: "continue-implementing",
      currentNodeId: "implementation_loop",
      currentStep: "Repairing verification",
      status: "running",
    })).toEqual({
      currentNodeId: "implementation_loop",
      steps: [
        { detail: "Read state", id: "refresh-state", kind: "action", label: "Refresh State", status: "completed" },
        { detail: "Repairing verification", id: "implementation_loop", kind: "loop", label: "Implementation Loop", status: "running" },
        { detail: "Finish", id: "finish", kind: "gate", label: "Finish", status: "pending" },
      ],
    });
  });

  it("marks every node complete for a completed run", () => {
    const projector = new FeatureWorkflowProgressProjector({ loadSpec: () => spec });
    const result = projector.build({
      command: "continue-implementing",
      currentNodeId: null,
      currentStep: null,
      status: "completed",
    });
    expect(result?.steps.every((step) => step.status === "completed")).toBe(true);
  });

  it("returns no projection when the workflow definition cannot be loaded", () => {
    const loadSpec = vi.fn(() => { throw new Error("missing definition"); });
    const projector = new FeatureWorkflowProgressProjector({ loadSpec });
    expect(projector.build({
      command: "start-implementing",
      currentNodeId: null,
      currentStep: null,
      status: "running",
    })).toBeNull();
  });
});
