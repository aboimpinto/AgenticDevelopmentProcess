// @vitest-environment jsdom

/**
 * Phase 5 — ProjectBlade Component Tests
 *
 * Tests for the ProjectBlade component that displays project summary or
 * the Add Project form.
 *
 * @see FEAT-055 Phase 5 — project-blade module
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { ProjectBlade } from "./project-blade.js";
import type { CreateProjectInput, ProjectSummary } from "@hepha/shared";

afterEach(() => {
  cleanup();
});

function makeProject(
  overrides: Partial<ProjectSummary> = {},
): ProjectSummary {
  return {
    counts: {
      "00_EPICS": 0,
      "01_SUBMITTED": 0,
      "02_READY_TO_DEVELOP": 0,
      "03_IN_PROGRESS": 0,
      "04_COMPLETED": 0,
      "05_CANCELLED": 0,
    },
    createdAt: "2024-01-01T00:00:00Z",
    defaultBranch: "main",
    detectedStack: [],
    featuresRootExists: true,
    id: "project-1",
    memoryBankPath: "",
    memoryBankRelativePath: "",
    name: "TestProject",
    needsInitialization: false,
    rootPath: "",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ProjectBlade", () => {
  const defaultForm: CreateProjectInput = {
    memoryBankPath: "memory-bank",
    name: "TestProject",
    rootPath: "/workspace/test-project",
  };

  it("renders project form when no project is selected", () => {
    render(
      <ProjectBlade
        form={defaultForm}
        isAddingProject={false}
        isCreating={false}
        onClose={vi.fn()}
        onCreateProject={vi.fn()}
        onFormChange={vi.fn()}
        selectedProject={null}
      />,
    );
    expect(screen.getByText("Add Project")).toBeDefined();
    expect(screen.getByText("Save Project")).toBeDefined();
  });

  it("renders project summary when project is selected", () => {
    const project = makeProject({
      counts: {
        "00_EPICS": 3,
        "01_SUBMITTED": 5,
        "02_READY_TO_DEVELOP": 2,
        "03_IN_PROGRESS": 1,
        "04_COMPLETED": 8,
        "05_CANCELLED": 0,
      },
      defaultBranch: "main",
      detectedStack: ["TypeScript", "React"],
      memoryBankPath: "/workspace/test-project/memory-bank",
      memoryBankRelativePath: "memory-bank",
      name: "TestProject",
      rootPath: "/workspace/test-project",
    });
    render(
      <ProjectBlade
        form={defaultForm}
        isAddingProject={false}
        isCreating={false}
        onClose={vi.fn()}
        onCreateProject={vi.fn()}
        onFormChange={vi.fn()}
        selectedProject={project}
      />,
    );
    expect(screen.getByText("TestProject")).toBeDefined();
    expect(screen.getByText("Ready")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined(); // Epics count
    expect(screen.getByText("16")).toBeDefined(); // Total features
  });

  it("renders project form when isAddingProject is true", () => {
    const project = makeProject({ name: "Existing" });
    render(
      <ProjectBlade
        form={defaultForm}
        isAddingProject={true}
        isCreating={false}
        onClose={vi.fn()}
        onCreateProject={vi.fn()}
        onFormChange={vi.fn()}
        selectedProject={project}
      />,
    );
    expect(screen.getByText("Add Project")).toBeDefined();
    expect(screen.getByDisplayValue("TestProject")).toBeDefined();
  });

  it("shows creating state on the submit button", () => {
    render(
      <ProjectBlade
        form={defaultForm}
        isAddingProject={true}
        isCreating={true}
        onClose={vi.fn()}
        onCreateProject={vi.fn()}
        onFormChange={vi.fn()}
        selectedProject={null}
      />,
    );
    expect(screen.getByText("Saving")).toBeDefined();
  });

  it("renders the close button", () => {
    render(
      <ProjectBlade
        form={defaultForm}
        isAddingProject={false}
        isCreating={false}
        onClose={vi.fn()}
        onCreateProject={vi.fn()}
        onFormChange={vi.fn()}
        selectedProject={null}
      />,
    );
    expect(screen.getByLabelText("Close blade")).toBeDefined();
  });
});
