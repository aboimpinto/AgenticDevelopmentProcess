import type { Page } from "@playwright/test";
import type { ProjectSummary, WorkItemCard, WorkItemDocumentDetail, WorkItemListResponse } from "@hepha/shared";

export const FIXTURE_TIME = "2026-07-19T12:00:00.000Z";

export const DASHBOARD_PROJECT: ProjectSummary = {
  counts: {
    "00_EPICS": 1,
    "01_SUBMITTED": 1,
    "02_READY_TO_DEVELOP": 0,
    "03_IN_PROGRESS": 1,
    "04_COMPLETED": 0,
    "05_CANCELLED": 0,
  },
  createdAt: FIXTURE_TIME,
  defaultBranch: "master",
  detectedStack: ["typescript", "react"],
  featuresRootExists: true,
  id: "hepha",
  memoryBankPath: "/workspace/AgenticDevelopmentProcess/MemoryBank",
  memoryBankRelativePath: "MemoryBank",
  name: "Hepha",
  needsInitialization: false,
  rootPath: "/workspace/AgenticDevelopmentProcess",
  updatedAt: FIXTURE_TIME,
};

export function makeWorkItem(overrides: Partial<WorkItemCard> = {}): WorkItemCard {
  const isEpic = overrides.kind === "epic";
  const externalId = overrides.externalId ?? (isEpic ? "EPIC-TEST" : "FEAT-TEST");
  const title = overrides.title ?? `${externalId}: Dashboard fixture`;
  const stateFolder = overrides.stateFolder ?? (isEpic ? "00_EPICS" : "03_IN_PROGRESS");

  return {
    documentPath: `/workspace/AgenticDevelopmentProcess/MemoryBank/Features/${stateFolder}/${externalId}/FeatureDescription.md`,
    documentRelativePath: `MemoryBank/Features/${stateFolder}/${externalId}/FeatureDescription.md`,
    documentUpdatedAt: FIXTURE_TIME,
    epicRefinements: [],
    epicState: isEpic ? "in-progress" : null,
    externalId,
    featureWorkflow: null,
    folderName: externalId,
    folderPath: `/workspace/AgenticDevelopmentProcess/MemoryBank/Features/${stateFolder}/${externalId}`,
    id: externalId.toLowerCase(),
    implementationEvidence: null,
    kind: isEpic ? "epic" : "feature",
    linkedEpicIds: [],
    linkedEpics: [],
    linkedFeatureIds: [],
    linkedFeatures: [],
    missingFeatureIds: [],
    phases: [],
    specMarkdown: `# ${title}\n\nFixture document content.`,
    stateFolder,
    stateLabel: stateFolder === "00_EPICS" ? "Epics" : "In Progress",
    summary: "Deterministic dashboard fixture.",
    title,
    validation: {
      blocksFeatureExtraction: false,
      changedSinceHephaDeepDive: false,
      deepDiveMessage: "The source document matches the current Deep-Dive.",
      deepDiveStatus: "current",
      lastHephaDeepDiveAt: FIXTURE_TIME,
      needsValidationCount: 0,
    },
    ...overrides,
  };
}

export function documentDetailFor(item: WorkItemCard, overrides: Partial<WorkItemDocumentDetail> = {}): WorkItemDocumentDetail {
  return {
    cardId: item.id,
    content: item.specMarkdown,
    documentPath: item.documentPath,
    documentRelativePath: item.documentRelativePath,
    documentUpdatedAt: item.documentUpdatedAt,
    externalId: item.externalId,
    folderName: item.folderName,
    kind: item.kind,
    readError: null,
    readStatus: "ok",
    stateFolder: item.stateFolder,
    stateLabel: item.stateLabel,
    title: item.title,
    ...overrides,
  };
}

export async function installDashboardFixtures(
  page: Page,
  items: WorkItemCard[],
  options: { readonly documentDetail?: (item: WorkItemCard) => WorkItemDocumentDetail } = {},
) {
  const response: WorkItemListResponse = {
    items,
    project: DASHBOARD_PROJECT,
    scannedAt: FIXTURE_TIME,
    scanStatus: {
      epicDocumentCount: items.filter((item) => item.kind === "epic").length,
      epicFolderExists: true,
      epicInvalidSourceCount: 0,
      epicScanFailed: false,
      epicValidItemCount: items.filter((item) => item.kind === "epic").length,
      message: null,
    },
    sourceIssues: [],
  };

  await page.route("**/api/projects", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { projects: [DASHBOARD_PROJECT] } });
  });
  await page.route("**/api/projects/hepha/work-items", async (route) => {
    await route.fulfill({ contentType: "application/json", json: response });
  });
  await page.route("**/api/projects/hepha/memory-bank-events", async (route) => {
    await route.fulfill({ body: ": connected\n\n", contentType: "text/event-stream", status: 200 });
  });
  await page.route("**/api/projects/hepha/features/**/runtime-evidence", async (route) => {
    const encodedCardKey = new URL(route.request().url()).pathname.match(/\/features\/([^/]+)\/runtime-evidence$/u)?.[1];
    await route.fulfill({
      contentType: "application/json",
      json: {
        schemaVersion: "runtime-execution/v1",
        projectId: DASHBOARD_PROJECT.id,
        cardKey: encodedCardKey ? decodeURIComponent(encodedCardKey) : "feature:FEAT-TEST",
        phases: [],
      },
    });
  });
  await page.route("**/api/projects/hepha/work-items/*/document", async (route) => {
    const itemId = new URL(route.request().url()).pathname.split("/").at(-2);
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) {
      await route.fulfill({ contentType: "application/json", json: { error: "Not found" }, status: 404 });
      return;
    }
    await route.fulfill({ contentType: "application/json", json: options.documentDetail?.(item) ?? documentDetailFor(item) });
  });
}
