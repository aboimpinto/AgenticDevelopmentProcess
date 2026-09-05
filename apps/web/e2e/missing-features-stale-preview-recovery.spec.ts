import { expect, test, type Page } from "@playwright/test";
import type {
  BatchPreviewPlan,
  ProjectSummary,
  WorkItemCard,
  WorkItemListResponse,
} from "@hepha/shared";

const now = "2026-07-04T10:00:00.000Z";

const project: ProjectSummary = {
  counts: {
    "00_EPICS": 1,
    "01_SUBMITTED": 0,
    "02_READY_TO_DEVELOP": 0,
    "03_IN_PROGRESS": 0,
    "04_COMPLETED": 0,
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

const epic: WorkItemCard = {
  documentPath: "/workspace/AgenticDevelopmentProcess/MemoryBank/Features/00_EPICS/EPIC-004/EpicDescription.md",
  documentRelativePath: "MemoryBank/Features/00_EPICS/EPIC-004/EpicDescription.md",
  documentUpdatedAt: now,
  epicRefinements: [],
  epicState: "in-progress",
  externalId: "EPIC-004",
  featureWorkflow: null,
  folderName: "EPIC-004-feat-planning-lifecycle",
  folderPath: "/workspace/AgenticDevelopmentProcess/MemoryBank/Features/00_EPICS/EPIC-004",
  id: "epic-004",
  implementationEvidence: null,
  kind: "epic",
  linkedEpicIds: [],
  linkedEpics: [],
  linkedFeatureIds: [],
  linkedFeatures: [],
  missingFeatureIds: [],
  phases: [],
  specMarkdown: "# EPIC-004: FEAT Planning Lifecycle\n\n## Features Breakdown\n\nTBD rows need FEATs.",
  stateFolder: "00_EPICS",
  stateLabel: "Epics",
  summary: "Create FEATs from EPIC planning rows.",
  title: "FEAT Planning Lifecycle",
  validation: {
    blocksFeatureExtraction: false,
    changedSinceHephaDeepDive: false,
    deepDiveMessage: "The source document matches the last Hepha deep-dive record.",
    deepDiveStatus: "current",
    lastHephaDeepDiveAt: now,
    needsValidationCount: 0,
  },
};

const staleApplyError = "Preview plan is stale. EPIC document or existing FEATs have changed. Request a new preview.";

test("stale missing-FEAT apply closes the old preview and allows a new preview", async ({ page }) => {
  let previewRequests = 0;

  await mockHephaApi(page, {
    getPreviewPlan: () => {
      previewRequests += 1;

      return createPreviewPlan(previewRequests === 1 ? "plan-old" : "plan-fresh");
    },
    rejectApplyAsStale: true,
  });

  await page.goto("/");

  await page.getByRole("button", { name: /FEAT Planning Lifecycle/ }).click();
  await page.getByRole("button", { name: /Preview FEATs/ }).click();

  await expect(page.getByText("Plan: plan-old")).toBeVisible();
  await page.getByRole("button", { name: /Create FEATs \(1\)/ }).click();

  await expect(page.getByText(staleApplyError)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Create FEATs/ })).toBeHidden();

  await page.getByRole("button", { name: /Preview FEATs/ }).click();

  await expect(page.getByText("Plan: plan-fresh")).toBeVisible();
  await expect(page.getByRole("button", { name: /Create FEATs \(1\)/ })).toBeVisible();
});

test("unchanged missing-FEAT preview creates the planned FEATs", async ({ page }) => {
  await mockHephaApi(page, {
    getPreviewPlan: () => createPreviewPlan("plan-ready"),
    rejectApplyAsStale: false,
  });

  await page.goto("/");

  await page.getByRole("button", { name: /FEAT Planning Lifecycle/ }).click();
  await page.getByRole("button", { name: /Preview FEATs/ }).click();

  await expect(page.getByText("Plan: plan-ready")).toBeVisible();
  await page.getByRole("button", { name: /Create FEATs \(1\)/ }).click();

  await expect(page.getByText("Created 1 FEAT(s): FEAT-020.")).toBeVisible();
  await expect(page.getByText("Plan: plan-ready")).toBeHidden();
  await expect(page.getByText(staleApplyError)).toBeHidden();
});

test("empty missing-FEAT preview explains that no FEATs can be created", async ({ page }) => {
  await mockHephaApi(page, {
    getPreviewPlan: () => createEmptyPreviewPlan("plan-empty"),
    rejectApplyAsStale: false,
  });

  await page.goto("/");

  await page.getByRole("button", { name: /FEAT Planning Lifecycle/ }).click();
  await page.getByRole("button", { name: /Preview FEATs/ }).click();

  await expect(page.getByText("Plan: plan-empty")).toBeVisible();
  await expect(page.getByText("No new FEAT candidates were found.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Create FEATs/ })).toBeHidden();
});

async function mockHephaApi(
  page: Page,
  options: {
    getPreviewPlan: () => BatchPreviewPlan;
    rejectApplyAsStale: boolean;
  },
) {
  await page.route("**/api/projects", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { projects: [project] },
    });
  });

  await page.route("**/api/projects/hepha/work-items", async (route) => {
    const response: WorkItemListResponse = {
      items: [epic],
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

  await page.route("**/api/projects/hepha/work-items/epic-004/document", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        cardId: epic.id,
        content: epic.specMarkdown,
        documentPath: epic.documentPath,
        documentRelativePath: epic.documentRelativePath,
        documentUpdatedAt: epic.documentUpdatedAt,
        externalId: epic.externalId,
        folderName: epic.folderName,
        kind: epic.kind,
        readError: null,
        readStatus: "ok",
        stateFolder: epic.stateFolder,
        stateLabel: epic.stateLabel,
        title: epic.title,
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

  await page.route("**/api/missing-features/preview", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        items: [epic],
        plan: options.getPreviewPlan(),
        project,
      },
    });
  });

  await page.route("**/api/missing-features", async (route) => {
    const requestBody = route.request().postDataJSON() as {
      planHash?: string;
      previewPlan?: BatchPreviewPlan;
      sourceDocumentHash?: string;
    };

    expect(requestBody.previewPlan?.planHash).toBe(requestBody.planHash);
    expect(requestBody.previewPlan?.epicDocumentHash).toBe(requestBody.sourceDocumentHash);

    if (!options.rejectApplyAsStale) {
      await route.fulfill({
        contentType: "application/json",
        json: {
          createdFeatureIds: ["FEAT-020"],
          discoveredFeatureCount: 1,
          items: [
            epic,
            {
              ...epic,
              documentPath:
                "/workspace/AgenticDevelopmentProcess/MemoryBank/Features/01_SUBMITTED/FEAT-020-native-submit-feature-command/FeatureDescription.md",
              documentRelativePath:
                "MemoryBank/Features/01_SUBMITTED/FEAT-020-native-submit-feature-command/FeatureDescription.md",
              epicState: null,
              externalId: "FEAT-020",
              folderName: "FEAT-020-native-submit-feature-command",
              id: "feat-020",
              kind: "feature",
              stateFolder: "01_SUBMITTED",
              stateLabel: "Submitted",
              summary: "Create the native submit-feature command.",
              title: "Native Submit Feature Command",
            },
          ],
          project,
          skippedFeatureIds: [],
        },
        status: 201,
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      json: { error: staleApplyError },
      status: 409,
    });
  });
}

function createPreviewPlan(planHash: string): BatchPreviewPlan {
  return {
    applyAllowed: true,
    discoveredCandidates: [
      {
        backlinkText: "- EPIC: EPIC-004",
        dependencyIds: [],
        fromExplicitLink: false,
        parentEpic: "EPIC-004",
        plannedDocumentPath:
          "/workspace/AgenticDevelopmentProcess/MemoryBank/Features/01_SUBMITTED/FEAT-020-native-submit-feature-command/FeatureDescription.md",
        plannedFeatureId: "FEAT-020",
        plannedFolderName: "FEAT-020-native-submit-feature-command",
        priority: "P1",
        sourceOrder: 1,
        summary: "Create the native submit-feature command.",
        title: "Native Submit Feature Command",
      },
    ],
    epicDocumentHash: "epic-hash-at-preview",
    epicId: "EPIC-004",
    epicUpdates: [
      {
        afterDescription: "Add FEAT-020 to the feature table.",
        beforeDescription: "Add 1 new FEAT row to the Features Breakdown table.",
        section: "feature-table",
      },
    ],
    explicitCandidates: [],
    planHash,
    previewGeneratedAt: now,
    warnings: [],
  };
}

function createEmptyPreviewPlan(planHash: string): BatchPreviewPlan {
  return {
    applyAllowed: false,
    discoveredCandidates: [],
    epicDocumentHash: "epic-hash-at-preview",
    epicId: "EPIC-004",
    epicUpdates: [],
    explicitCandidates: [],
    planHash,
    previewGeneratedAt: now,
    warnings: [],
  };
}
