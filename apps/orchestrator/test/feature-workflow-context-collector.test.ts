import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkItemCard } from "@hepha/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectMarkdownDocuments,
  FeatureWorkflowContextCollector,
  readDocumentSnippet,
  renderContextSection,
} from "../src/application/context/feature-workflow-context-collector.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
});

function fixture() {
  const rootPath = mkdtempSync(join(tmpdir(), "hepha-workflow-context-"));
  temporaryDirectories.push(rootPath);
  const memoryBankPath = join(rootPath, "MemoryBank");
  const featureFolder = join(memoryBankPath, "Features", "03_IN_PROGRESS", "work-item");
  const epicFolder = join(memoryBankPath, "Epics", "epic-item");
  mkdirSync(featureFolder, { recursive: true });
  mkdirSync(epicFolder, { recursive: true });
  const phasePath = join(featureFolder, "Phases", "phase-arbitrary.md");
  mkdirSync(join(featureFolder, "Phases"));
  writeFileSync(join(featureFolder, "FeatureDescription.md"), "# Feature source");
  writeFileSync(join(featureFolder, "FeatureTasks.md"), "# Task ledger");
  writeFileSync(phasePath, "# Current phase status");
  writeFileSync(join(featureFolder, "planning-analysis-report.md"), "# Planning handoff");
  writeFileSync(join(epicFolder, "EpicAcceptanceTests.md"), "Scenario: first\nScenario: final");
  mkdirSync(join(memoryBankPath, "Overview"), { recursive: true });
  mkdirSync(join(memoryBankPath, "Architecture"), { recursive: true });
  mkdirSync(join(memoryBankPath, "CodeGuidelines"), { recursive: true });
  writeFileSync(join(memoryBankPath, "Overview", "project.md"), "# Project overview");
  writeFileSync(join(memoryBankPath, "Architecture", "ui-design.md"), "# UI design language");
  writeFileSync(join(memoryBankPath, "CodeGuidelines", "rules.md"), "# Code rules");

  const phase = {
    documentPath: phasePath,
    documentRelativePath: "Phases/phase-arbitrary.md",
    number: 73,
    status: "IN_PROGRESS",
    title: "Arbitrary phase",
  } as never;
  const feature = {
    externalId: "WORK-ANY",
    folderPath: featureFolder,
    kind: "feature",
    linkedEpicIds: ["GROUP-ANY"],
    phases: [phase],
    specMarkdown: "# Feature source",
    title: "Generic work",
  } as WorkItemCard;
  const epic = {
    documentPath: join(epicFolder, "EpicDescription.md"),
    documentRelativePath: "Epics/epic-item/EpicDescription.md",
    externalId: "GROUP-ANY",
    folderPath: epicFolder,
    kind: "epic",
    specMarkdown: "# Linked group source",
    title: "Generic group",
  } as WorkItemCard;
  const project = {
    createdAt: "2031-01-01T00:00:00.000Z",
    id: "project-any",
    memoryBankPath,
    name: "Any project",
    rootPath,
    updatedAt: "2031-01-01T00:00:00.000Z",
  };
  const dependencies = {
    acceptanceTestsFileName: "EpicAcceptanceTests.md",
    createPreviousFailureBrief: vi.fn(() => "## Previous failure\n\nRecover this."),
    getNumberedPhases: vi.fn(() => [phase]),
    getPlanningArtifactPath: vi.fn(() => join(featureFolder, "planning-analysis-report.md")),
    readCurrentBranch: vi.fn(() => "branch-any\n"),
    renderLessons: vi.fn(() => "## Lessons\n\nPrevent recurrence."),
    renderPhaseTaskLedger: vi.fn(() => "## Phase Task Resume Ledger\n\n- [ ] next"),
    selectCodeReviewFiles: vi.fn(() => ["src/one.ts", "src/two.ts"]),
  };
  return { dependencies, epic, feature, featureFolder, memoryBankPath, phase, project, rootPath };
}

describe("feature workflow context collector", () => {
  it("collects bounded default workflow context and complete acceptance scenarios", () => {
    const current = fixture();
    const collector = new FeatureWorkflowContextCollector(current.dependencies);
    const context = collector.collect(current.project, current.feature, [current.feature, current.epic], {
      includeUiLanguageDocuments: true,
      lessonContext: { agentRole: "implementation", phase: current.phase },
    });

    expect(context).toContain("## Previous failure");
    expect(context).toContain("## Feature Folder Documents");
    expect(context).toContain("# Planning handoff");
    expect(context).toContain("# Linked group source");
    expect(context).toContain("Scenario: first\nScenario: final");
    expect(context).toContain("## Lessons");
    expect(context).toContain("# Project overview");
    expect(context).toContain("## MemoryBank UI Language And Design Context");
    expect(current.dependencies.renderPhaseTaskLedger).toHaveBeenCalledWith(
      current.project,
      current.feature,
      current.phase,
    );
  });

  it("limits code-review context to current state, target files, ledger, and lessons", () => {
    const current = fixture();
    const collector = new FeatureWorkflowContextCollector(current.dependencies);
    const context = collector.collect(current.project, current.feature, [current.feature], {
      contextMode: "code-review",
      includeUiLanguageDocuments: false,
      lessonContext: { agentRole: "reviewer", phase: current.phase },
    }, "## Explicit recovery brief");

    expect(context).toContain("## Explicit recovery brief");
    expect(context).toContain("Git branch: branch-any");
    expect(context).toContain("- src/one.ts\n- src/two.ts");
    expect(context).toContain("# Task ledger");
    expect(context).toContain("# Current phase status");
    expect(context).toContain("## Phase Task Resume Ledger");
    expect(context).toContain("## Lessons");
    expect(context).not.toContain("# Project overview");
    expect(current.dependencies.selectCodeReviewFiles).toHaveBeenCalledWith(
      current.project,
      current.feature,
      73,
    );
  });

  it("renders safe empty sections and bounded Markdown discovery", () => {
    const current = fixture();
    expect(renderContextSection("Empty", [])).toBe("## Empty\n\nNo documents found.");
    expect(collectMarkdownDocuments(current.memoryBankPath, current.rootPath, 2)).toHaveLength(2);
    expect(collectMarkdownDocuments(join(current.rootPath, "missing"), current.rootPath, 2)).toEqual([]);
    const document = join(current.rootPath, "long.md");
    writeFileSync(document, "abcdefghij");
    expect(readDocumentSnippet(document, 6)).toBe("abcde...");
    expect(readDocumentSnippet(join(current.rootPath, "absent.md"), 6)).toBe("");
  });
});
