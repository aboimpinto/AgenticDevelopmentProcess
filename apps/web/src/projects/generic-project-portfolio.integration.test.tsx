// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import type { ProjectSummary } from "@hepha/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectsView } from "./projects-view.js";

const specification = readFileSync(resolve(import.meta.dirname, "generic-project-portfolio.feature"), "utf8");
const shell = readFileSync(resolve(import.meta.dirname, "../app-shell.tsx"), "utf8");
const shellView = readFileSync(resolve(import.meta.dirname, "../composition/app-shell-view.tsx"), "utf8");

afterEach(cleanup);

describe("generic project portfolio Gherkin integration", () => {
  it("specifies four project-identity-blind portfolio behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("renders an explicit empty registry through the production view", () => {
    render(
      <ProjectsView
        isLoading={false}
        onAddProject={vi.fn()}
        onInitializeProject={vi.fn()}
        onOpenBoard={vi.fn()}
        onRefresh={vi.fn()}
        onSelectProject={vi.fn()}
        pendingActionId={null}
        projects={[] as ProjectSummary[]}
        projectWorkItems={[]}
        selectedProjectId={null}
      />,
    );

    expect(screen.getByText("No projects registered")).toBeDefined();
  });

  it("keeps portfolio presentation and analytics outside shell composition", () => {
    expect(shell).toContain('from "./composition/app-shell-view.js"');
    expect(shellView).toContain('from "../projects/projects-view.js"');
    expect(shellView).toContain("<ProjectsView");
    expect(shell).not.toContain("function ProjectCard");
    expect(shell).not.toContain("function calculateProjectRuntimeStats");
  });
});
