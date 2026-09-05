import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createProjectWorkItemApplications } from "../src/bootstrap/project-work-item-applications.js";
import { EpicStateSynchronizationApplication } from "../src/application/epics/epic-state-synchronization-application.js";
import { FeatureEpicLinkApplication } from "../src/application/features/feature-epic-link-application.js";
import { ManualTestVerificationApplication } from "../src/application/manual-tests/manual-test-verification-application.js";
import { ProjectRegistry } from "../src/projects/project-registry.js";

describe("project work-item application composition", () => {
  it("returns query, relationship, target, and manual-verification boundaries", () => {
    const applications = createProjectWorkItemApplications({
      completeFeature: vi.fn(),
      defaultProjectStorePath: resolve(process.cwd(), ".hepha", "missing-project-composition-test.json"),
      featureWorkflowSummary: {} as never,
      metadataStore: {} as never,
      notifyChanged: vi.fn(),
      workspaceRoot: process.cwd(),
    });

    expect(applications.projectRegistry).toBeInstanceOf(ProjectRegistry);
    expect(applications.epicStateSynchronizationApplication).toBeInstanceOf(EpicStateSynchronizationApplication);
    expect(applications.featureEpicLinkApplication).toBeInstanceOf(FeatureEpicLinkApplication);
    expect(applications.manualTestVerificationApplication).toBeInstanceOf(ManualTestVerificationApplication);
    expect(applications.stateFolderLabels["03_IN_PROGRESS"]).toBe("In Progress");
  });
});
