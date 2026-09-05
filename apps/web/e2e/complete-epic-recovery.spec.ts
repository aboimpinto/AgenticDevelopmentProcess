import { expect, test, type Page } from "@playwright/test";
import type {
  FeatureWorkflowActionResponse,
  ProjectSummary,
  WorkItemCard,
  WorkItemListResponse,
} from "@hepha/shared";

const now = "2026-07-06T12:00:00.000Z";

const project: ProjectSummary = {
  counts: {
    "00_EPICS": 1,
    "01_SUBMITTED": 0,
    "02_READY_TO_DEVELOP": 0,
    "03_IN_PROGRESS": 0,
    "04_COMPLETED": 1,
    "05_CANCELLED": 0,
  },
  createdAt: now,
  defaultBranch: "master",
  detectedStack: ["typescript", "react"],
  featuresRootExists: true,
  id: "hepha",
  memoryBankPath: "/workspace/AgenticDevelopmentProcess/MemoryBank",
  memoryBankRelativePath: "MemoryBank",
  name: "HEPHA",
  needsInitialization: false,
  rootPath: "/workspace/AgenticDevelopmentProcess",
  updatedAt: now,
};

const completedFeatureRelation = {
  externalId: "FEAT-020",
  id: "feat-020",
  kind: "feature" as const,
  stateFolder: "04_COMPLETED" as const,
  stateLabel: "Completed",
  title: "Completed Child Feature",
};

const epicNeedingCompletion: WorkItemCard = {
  documentPath: "/workspace/AgenticDevelopmentProcess/MemoryBank/Features/00_EPICS/EPIC-020/EpicDescription.md",
  documentRelativePath: "MemoryBank/Features/00_EPICS/EPIC-020/EpicDescription.md",
  documentUpdatedAt: now,
  epicRefinements: [],
  epicState: "in-progress",
  externalId: "EPIC-020",
  featureWorkflow: null,
  folderName: "EPIC-020-completion-recovery",
  folderPath: "/workspace/AgenticDevelopmentProcess/MemoryBank/Features/00_EPICS/EPIC-020",
  id: "epic-020",
  implementationEvidence: null,
  kind: "epic",
  linkedEpicIds: [],
  linkedEpics: [],
  linkedFeatureIds: ["FEAT-020"],
  linkedFeatures: [completedFeatureRelation],
  missingFeatureIds: [],
  phases: [],
  specMarkdown: [
    "# EPIC-020: Completion Recovery",
    "",
    "| Field | Value |",
    "|-------|-------|",
    "| Epic ID | EPIC-020 |",
    "| State | InProgress |",
    "",
    "## Features Breakdown",
    "",
    "| Feature ID | Title | Status | Dependencies | Priority |",
    "|------------|-------|--------|--------------|----------|",
    "| FEAT-020 | Completed Child Feature | COMPLETED | | P1 |",
  ].join("\n"),
  stateFolder: "00_EPICS",
  stateLabel: "Epics",
  summary: "Completion recovery fixture.",
  title: "Completion Recovery",
  validation: {
    blocksFeatureExtraction: false,
    changedSinceHephaDeepDive: false,
    deepDiveMessage: "The source document matches the last Hepha deep-dive record.",
    deepDiveStatus: "current",
    lastHephaDeepDiveAt: now,
    needsValidationCount: 0,
  },
};

const completedEpic: WorkItemCard = {
  ...epicNeedingCompletion,
  epicState: "completed",
  specMarkdown: epicNeedingCompletion.specMarkdown.replace("| State | InProgress |", "| State | Completed |"),
};

test("all-completed EPIC exposes a Complete EPIC recovery action", async ({ page }) => {
  let completeEpicRequests = 0;

  await mockHephaApi(page, () => {
    completeEpicRequests += 1;

    const response: FeatureWorkflowActionResponse = {
      filesChanged: ["MemoryBank/Features/00_EPICS/EPIC-020/EpicDescription.md"],
      filesCreated: [],
      items: [completedEpic],
      project,
      summary: "EPIC-020 marked Completed because all 1 linked FEAT is completed.",
    };

    return response;
  });

  await page.goto("/");

  await page.getByRole("button", { name: /Completion Recovery/ }).click();
  await expect(page.getByRole("button", { name: /Complete EPIC/ })).toBeVisible();

  await page.getByRole("button", { name: /Complete EPIC/ }).click();

  await expect(page.getByText("EPIC-020 marked Completed because all 1 linked FEAT is completed.")).toBeVisible();
  expect(completeEpicRequests).toBe(1);
});

async function mockHephaApi(
  page: Page,
  completeEpic: () => FeatureWorkflowActionResponse,
) {
  await page.route("**/api/projects", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { projects: [project] },
    });
  });

  await page.route("**/api/projects/hepha/work-items", async (route) => {
    const response: WorkItemListResponse = {
      items: [epicNeedingCompletion],
      project,
      scannedAt: now,
      scanStatus: {
        epicDocumentCount: 1,
        epicFolderExists: true,
        epicInvalidSourceCount: 0,
        epicScanFailed: false,
        epicValidItemCount: 1,
        message: null,
      },
      sourceIssues: [],
    };

    await route.fulfill({
      contentType: "application/json",
      json: response,
    });
  });

  await page.route("**/api/projects/hepha/work-items/epic-020/document", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        cardId: epicNeedingCompletion.id,
        content: epicNeedingCompletion.specMarkdown,
        documentPath: epicNeedingCompletion.documentPath,
        documentRelativePath: epicNeedingCompletion.documentRelativePath,
        documentUpdatedAt: epicNeedingCompletion.documentUpdatedAt,
        externalId: epicNeedingCompletion.externalId,
        folderName: epicNeedingCompletion.folderName,
        kind: epicNeedingCompletion.kind,
        readError: null,
        readStatus: "ok",
        stateFolder: epicNeedingCompletion.stateFolder,
        stateLabel: epicNeedingCompletion.stateLabel,
        title: epicNeedingCompletion.title,
      },
    });
  });

  await page.route("**/api/projects/hepha/memory-bank-events", async (route) => {
    await route.fulfill({
      body: "",
      contentType: "text/event-stream",
      status: 200,
    });
  });

  await page.route("**/api/complete-epic", async (route) => {
    const requestBody = route.request().postDataJSON() as { cardId?: string; projectId?: string };

    expect(requestBody.cardId).toBe(epicNeedingCompletion.id);
    expect(requestBody.projectId).toBe(project.id);

    await route.fulfill({
      contentType: "application/json",
      json: completeEpic(),
      status: 200,
    });
  });
}
