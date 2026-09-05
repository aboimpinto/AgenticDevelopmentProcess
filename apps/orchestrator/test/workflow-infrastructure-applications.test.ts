import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createWorkflowInfrastructureApplications } from "../src/bootstrap/workflow-infrastructure-applications.js";
import { CodeReviewFailureContextRepository } from "../src/workflows/reviews/code-review-failure-context-repository.js";
import { WorkflowMachineStateRepository } from "../src/workflows/recovery/workflow-machine-state-repository.js";
import { LiveActivitySseService } from "../src/transport/sse/live-activity-sse-service.js";

describe("workflow infrastructure application composition", () => {
  it("returns durable repositories, metadata, and live notification boundaries", async () => {
    const metadataStore = {
      queryPhaseLifecycleEventsAfterCursor: vi.fn(async () => []),
    };
    const applications = await createWorkflowInfrastructureApplications({
      createMetadataStore: vi.fn(async () => metadataStore as never),
      environment: {},
      localStateDir: resolve(process.cwd(), ".hepha"),
      log: vi.fn(),
      sessionDir: resolve(process.cwd(), ".pi-sessions"),
      workspaceRoot: process.cwd(),
    });

    expect(applications.cardMetadataStore).toBe(metadataStore);
    expect(applications.codeReviewFailureContextRepository).toBeInstanceOf(CodeReviewFailureContextRepository);
    expect(applications.workflowMachineStateRepository).toBeInstanceOf(WorkflowMachineStateRepository);
    expect(applications.liveActivitySseService).toBeInstanceOf(LiveActivitySseService);
    expect(applications.defaultProjectStorePath).toContain("projects.json");
  });
});
