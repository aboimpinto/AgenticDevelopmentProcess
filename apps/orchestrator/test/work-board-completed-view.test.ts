import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(testDir, "../../web/src");
const appShell = readFileSync(resolve(webRoot, "app-shell.tsx"), "utf8");
const appShellView = readFileSync(resolve(webRoot, "composition/app-shell-view.tsx"), "utf8");
const selectors = readFileSync(resolve(webRoot, "boards/board-selectors.ts"), "utf8");
const boardTypes = readFileSync(resolve(webRoot, "boards/board-types.ts"), "utf8");
const workBoard = readFileSync(resolve(webRoot, "boards/work-board.tsx"), "utf8");
const epicBoard = readFileSync(resolve(webRoot, "boards/epic-board.tsx"), "utf8");
const completedFeatures = readFileSync(resolve(webRoot, "boards/completed-features-view.tsx"), "utf8");
const epicSubmission = readFileSync(resolve(webRoot, "submissions/use-epic-submission.ts"), "utf8");
const appNavigation = readFileSync(resolve(webRoot, "composition/use-app-navigation.ts"), "utf8");
const documentPreview = readFileSync(resolve(webRoot, "details/document-preview.tsx"), "utf8");
const mermaidDiagram = readFileSync(resolve(webRoot, "details/mermaid-diagram.tsx"), "utf8");
const webStyles = readFileSync(resolve(webRoot, "styles.css"), "utf8");

// FEAT-055 split board and document presentation from app-shell.tsx.
describe("Work Board completed item view", () => {
  it("keeps completed EPIC filtering and completed FEAT preview limits in board selectors", () => {
    expect(selectors).toContain('(item.epicState === "completed" || item.epicState === "cancelled")');
    expect(selectors).toContain("COMPLETED_COLUMN_PREVIEW_LIMIT");
    expect(selectors).toContain("hiddenCount");
    expect(boardTypes).toContain("export const COMPLETED_COLUMN_PREVIEW_LIMIT = 6");
    expect(workBoard).toContain("completed-overflow-card");
  });

  it("renders the shared EPIC board model and invalid source cards in its owning board module", () => {
    expect(appShellView).toContain("buildEpicBoardModel(workspace.workItems, workspace.sourceIssues, workspace.scanStatus)");
    expect(appShellView).toContain('props.activeView === "epic-board"');
    expect(epicBoard).toContain("boardModel.columns.map");
    expect(epicBoard).toContain('column.id === "invalid-sources"');
    expect(epicBoard).toContain("InvalidSourceCard");
  });

  it("connects EPIC cards and invalid sources through the navigation controller", () => {
    expect(appNavigation).toContain("function selectItem");
    expect(appNavigation).toContain("function selectSourceIssue");
    expect(appShellView).toContain("onSelectItem={navigation.selectExpandedItem}");
    expect(appShellView).toContain("onSelectSourceIssue={navigation.selectSourceIssue}");
  });

  it("adds EPICs through the board and bounded submission controller", () => {
    expect(epicBoard).toContain('column.id === "not-started"');
    expect(epicBoard).toContain("add-epic-card");
    expect(appNavigation).toContain("openSubmitEpicOverlay: () => openSubmission(options.openEpicSubmission)");
    expect(appShellView).toContain("onAddEpic={navigation.openSubmitEpicOverlay}");
    expect(appShell).toContain('from "./submissions/use-epic-submission.js"');
    expect(epicSubmission).toContain('apiPost<SubmitEpicResponse>("/api/submit-epic"');
    expect(webStyles).toContain(".add-epic-card");
  });

  it("renders completed FEAT navigation in its dedicated view", () => {
    expect(completedFeatures).toContain('aria-label="Completed FEATs"');
    expect(completedFeatures).toContain("onSelectFeature(item.id)");
    expect(completedFeatures).toContain("Go to Work Board");
    expect(webStyles).toContain(".completed-page");
    expect(webStyles).toContain(".completed-feature-row");
  });

  it("keeps selected-card centering in WorkBoard", () => {
    expect(workBoard).toContain("shouldCenterSelectedItem");
    expect(workBoard).toContain("centerSelectedItemInBoard(boardElement, selectedCardElement)");
    expect(workBoard).toContain("window.requestAnimationFrame");
  });

  it("renders Mermaid fences through the extracted document modules", () => {
    expect(documentPreview).toContain('if (language === "mermaid")');
    expect(documentPreview).toContain("getMermaidCodeSource");
    expect(documentPreview).toContain("MermaidDiagram");
    expect(mermaidDiagram).toContain('await import("mermaid")');
    expect(mermaidDiagram).toContain('securityLevel: "strict"');
    expect(webStyles).toContain(".mermaid-diagram");
    expect(webStyles).toContain(".mermaid-diagram-error");
  });
});
