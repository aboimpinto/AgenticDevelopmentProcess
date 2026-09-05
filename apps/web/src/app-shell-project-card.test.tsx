import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectSummary } from "@hepha/shared";

import { ProjectCard } from "./projects/projects-view.js";

afterEach(cleanup);

function project(): ProjectSummary {
  return {
    id: "project",
    name: "Delivery Project",
    rootPath: "/workspace/project",
    memoryBankPath: "/workspace/project/MemoryBank",
    memoryBankRelativePath: "MemoryBank",
    defaultBranch: "master",
    detectedStack: ["Node.js"],
    featuresRootExists: true,
    needsInitialization: false,
    counts: {
      "00_EPICS": 13,
      "01_SUBMITTED": 4,
      "02_READY_TO_DEVELOP": 0,
      "03_IN_PROGRESS": 0,
      "04_COMPLETED": 64,
      "05_CANCELLED": 0,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
  };
}

describe("ProjectCard presentation", () => {
  it("separates lifecycle status from readable delivery-performance metrics", () => {
    render(
      <ProjectCard
        isInitializing={false}
        isSelected
        onInitializeProject={vi.fn()}
        onOpenBoard={vi.fn()}
        onSelectProject={vi.fn()}
        project={project()}
        projectWorkItems={[]}
      />,
    );

    expect(screen.getByText("Portfolio status")).toBeDefined();
    expect(screen.getByText("Delivery performance")).toBeDefined();
    expect(screen.getByText("Average FEAT AI Runtime")).toBeDefined();
    expect(screen.getByText("Estimated Human Delivery Gain")).toBeDefined();
    expect(screen.getByText("Delivery Acceleration")).toBeDefined();
    expect(screen.queryByText(/prediction error/i)).toBeNull();
    expect(screen.getByLabelText("Completed: 64. 0 cancelled")).toBeDefined();
  });
});
