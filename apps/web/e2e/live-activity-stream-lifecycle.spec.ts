import { expect, test, type Page } from "@playwright/test";
import type { ProjectSummary, WorkItemListResponse } from "@hepha/shared";

declare global {
  interface Window {
    __liveActivityStreams?: { closed: number; created: number };
  }
}

const now = "2026-07-10T08:00:00.000Z";

const project: ProjectSummary = {
  counts: {
    "00_EPICS": 0,
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

async function mockDashboardApi(page: Page) {
  await page.route("**/api/projects", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { projects: [project] } });
  });

  await page.route("**/api/projects/hepha/work-items", async (route) => {
    const response: WorkItemListResponse = {
      items: [],
      project,
      scannedAt: now,
      scanStatus: {
        epicDocumentCount: 0,
        epicFolderExists: true,
        epicInvalidSourceCount: 0,
        epicScanFailed: false,
        epicValidItemCount: 0,
        message: null,
      },
      sourceIssues: [],
    };

    await route.fulfill({ contentType: "application/json", json: response });
  });

  await page.route("**/api/approvals?*", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { approvals: [] } });
  });
}

test("live activity rerenders retain one stream", async ({ page }) => {
  await page.addInitScript(() => {
    const streams = { closed: 0, created: 0 };
    window.__liveActivityStreams = streams;

    class ControlledEventSource extends EventTarget {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSED = 2;
      readonly url: string;
      onerror: ((this: EventSource, event: Event) => unknown) | null = null;
      readyState = ControlledEventSource.CONNECTING;
      withCredentials = false;

      constructor(url: string | URL) {
        super();
        this.url = String(url);

        if (this.url.includes("/live-activity")) {
          streams.created += 1;
          queueMicrotask(() => {
            this.readyState = ControlledEventSource.OPEN;
            this.dispatchEvent(new MessageEvent("live-activity.connected", { data: "{}" }));
          });
        }
      }

      close() {
        if (this.readyState !== ControlledEventSource.CLOSED && this.url.includes("/live-activity")) {
          streams.closed += 1;
        }
        this.readyState = ControlledEventSource.CLOSED;
      }
    }

    Object.defineProperty(window, "EventSource", {
      configurable: true,
      value: ControlledEventSource,
      writable: true,
    });
  });

  await mockDashboardApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hepha" })).toBeVisible();

  await expect.poll(() => page.evaluate(() => window.__liveActivityStreams?.created ?? 0)).toBe(1);
  await page.waitForTimeout(100);
  await expect(page.evaluate(() => window.__liveActivityStreams)).resolves.toEqual({ closed: 0, created: 1 });

});
