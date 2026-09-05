import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const featurePath = fileURLToPath(new URL("./orchestrator-http-boundary.feature", import.meta.url));
const envKeys = [
  "HEPHA_AGENT_CWD",
  "HEPHA_DATABASE_PATH",
  "HEPHA_DISABLE_METADATA_STORE",
  "HEPHA_PROJECT_STORE_PATH",
  "HEPHA_PROVIDER_CONNECTION_DATABASE_PATH",
  "HEPHA_VAULT_DATABASE_PATH",
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

let fixtureRoot: string;
let projectRoot: string;
let projectStorePath: string;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  fixtureRoot = mkdtempSync(resolve(tmpdir(), "hepha-http-boundary-"));
  projectRoot = resolve(fixtureRoot, "project");
  projectStorePath = resolve(fixtureRoot, "state", "projects.json");
  mkdirSync(resolve(projectRoot, ".git"), { recursive: true });
  mkdirSync(resolve(projectRoot, "MemoryBank"), { recursive: true });
  mkdirSync(resolve(fixtureRoot, "state"), { recursive: true });

  process.env.HEPHA_AGENT_CWD = fixtureRoot;
  process.env.HEPHA_DATABASE_PATH = resolve(fixtureRoot, "state", "metadata.sqlite");
  process.env.HEPHA_DISABLE_METADATA_STORE = "1";
  process.env.HEPHA_PROJECT_STORE_PATH = projectStorePath;
  process.env.HEPHA_PROVIDER_CONNECTION_DATABASE_PATH = resolve(fixtureRoot, "state", "providers.sqlite");
  process.env.HEPHA_VAULT_DATABASE_PATH = resolve(fixtureRoot, "state", "vault.sqlite");

  vi.resetModules();
  const { createOrchestratorRequestListener } = await import("../src/index.js");
  server = createServer(createOrchestratorRequestListener(() => undefined));
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an ephemeral TCP address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 30_000);

afterAll(async () => {
  if (server?.listening) {
    await new Promise<void>((resolveClose, reject) => {
      server.close((error) => error ? reject(error) : resolveClose());
    });
  }
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  if (fixtureRoot) {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

describe("generic orchestrator HTTP boundary Gherkin integration", () => {
  it("binds generic scenarios without a historical feature or phase topology", () => {
    const feature = readFileSync(featurePath, "utf8");

    expect(feature).toContain("Scenario: A valid JSON command passes through the public HTTP boundary");
    expect(feature).toContain("Scenario: A new empty directory is accepted as a project root");
    expect(feature).toContain("Scenario: Runtime health passes through the public boundary");
    expect(feature).toContain("Scenario: A typed command failure passes through the public error boundary");
    expect(feature).toContain("Scenario: Registered projects pass through the project collection route");
    expect(feature).toContain("Scenario: A registered project initializes its MemoryBank through the public route");
    expect(feature).toContain("Scenario: Work items are listed through the registered project boundary");
    expect(feature).toContain("Scenario: A current work-item document is read through the project boundary");
    expect(feature).toContain("Scenario: A generated design document is read through the project boundary");
    expect(feature).toContain("Scenario: A registered project opens its MemoryBank event stream");
    expect(feature).toContain("Scenario: A registered project opens its live-activity stream");
    expect(feature).toContain("Scenario: A batch command failure passes through the public error boundary");
    expect(feature).toContain("Scenario: A work-item submission failure passes through the public error boundary");
    expect(feature).toContain("Scenario: A relationship command resolves its registered project boundary");
    expect(feature).toContain("Scenario: An EPIC refinement failure passes through the public error boundary");
    expect(feature).toContain("Scenario: A lifecycle command failure passes through the public error boundary");
    expect(feature).toContain("Scenario: A human-review command failure passes through the public error boundary");
    expect(feature).toContain("Scenario: A manual-test query validates its public contract");
    expect(feature).toContain("Scenario: A workflow console is read through the public boundary");
    expect(feature).toContain("Scenario: A deep-dive lookup failure passes through the public error boundary");
    expect(feature).toContain("Scenario: A delivery query validates its public contract");
    expect(feature).toContain("Scenario: Agent tasks are listed through the public boundary");
    expect(feature).toContain("Scenario: Approvals are listed when optional metadata storage is unavailable");
    expect(feature).toContain("Scenario: An empty phase timeline passes through the public boundary");
    expect(feature).toContain("Scenario: Empty run analytics pass through the public boundary");
    expect(feature).toContain("Scenario: Empty receipt evidence passes through the public boundary");
    expect(feature).toContain("Scenario: Provider connections pass through their public boundary");
    expect(feature).toContain("Scenario: A browser preflight passes through the public HTTP boundary");
    expect(feature).not.toMatch(/FEAT-\d+|Phase \d+|Data Layer|Business Logic/i);
  });

  it("reads runtime health through the production listener", async () => {
    const response = await fetch(`${baseUrl}/api/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      env: expect.objectContaining({ HEPHA_DATABASE_PATH: expect.any(Boolean) }),
      ok: true,
      piCommandDiagnostics: expect.any(Array),
      piCommandStatus: expect.stringMatching(/^(available|missing)$/),
    }));
  });

  it("registers a new empty directory through the production listener", async () => {
    const emptyProjectRoot = resolve(fixtureRoot, "new-empty-project");
    mkdirSync(emptyProjectRoot, { recursive: true });

    const response = await fetch(`${baseUrl}/api/projects`, {
      body: JSON.stringify({
        memoryBankPath: "MemoryBank",
        name: "New empty project fixture",
        rootPath: emptyProjectRoot,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      project: expect.objectContaining({
        memoryBankPath: resolve(emptyProjectRoot, "MemoryBank"),
        name: "New empty project fixture",
        needsInitialization: true,
        rootPath: emptyProjectRoot,
      }),
    });
  });

  it("lists registered projects through the production project collection route", async () => {
    const secondProjectRoot = resolve(fixtureRoot, "another-project");
    const thirdProjectRoot = resolve(fixtureRoot, "zulu-project");
    mkdirSync(resolve(secondProjectRoot, ".git"), { recursive: true });
    mkdirSync(resolve(secondProjectRoot, "MemoryBank"), { recursive: true });
    mkdirSync(resolve(thirdProjectRoot, ".git"), { recursive: true });
    mkdirSync(resolve(thirdProjectRoot, "MemoryBank"), { recursive: true });
    const createdIds: string[] = [];
    for (const registration of [
      { name: "Zulu collection fixture", rootPath: thirdProjectRoot },
      { name: "Alpha collection fixture", rootPath: secondProjectRoot },
    ]) {
      const createResponse = await fetch(`${baseUrl}/api/projects`, {
        body: JSON.stringify({
          memoryBankPath: "MemoryBank",
          ...registration,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      expect(createResponse.status).toBe(201);
      const createdBody = await createResponse.json() as { project: { id: string } };
      createdIds.push(createdBody.project.id);
    }

    const response = await fetch(`${baseUrl}/api/projects`);

    expect(response.status).toBe(200);
    const body = await response.json() as {
      projects: Array<{
        counts: Record<string, number>;
        detectedStack: string[];
        id: string;
        memoryBankRelativePath: string;
        name: string;
      }>;
    };
    const names = body.projects.map(({ name }) => name);
    expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right)));
    for (const id of createdIds) {
      expect(body.projects.filter((project) => project.id === id)).toHaveLength(1);
    }
    expect(body.projects.find((project) => project.id === createdIds[0])).toEqual(expect.objectContaining({
      counts: expect.objectContaining({ "04_COMPLETED": 0 }),
      detectedStack: ["Unknown"],
      memoryBankRelativePath: "MemoryBank",
    }));
  });

  it("initializes a registered project idempotently through the production route", async () => {
    const initializationRoot = resolve(fixtureRoot, "initialization-project");
    const memoryBankPath = resolve(initializationRoot, "MemoryBank");
    mkdirSync(resolve(initializationRoot, ".git"), { recursive: true });
    mkdirSync(memoryBankPath, { recursive: true });
    const registration = await fetch(`${baseUrl}/api/projects`, {
      body: JSON.stringify({
        memoryBankPath: "MemoryBank",
        name: "Initialization fixture",
        rootPath: initializationRoot,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const registrationBody = await registration.json() as { project: { id: string } };
    const initializationUrl = `${baseUrl}/api/projects/${encodeURIComponent(registrationBody.project.id)}/initialize-memory-bank`;

    const first = await fetch(initializationUrl, { method: "POST" });

    expect(first.status).toBe(201);
    const firstBody = await first.json() as {
      createdDirectories: string[];
      createdFiles: string[];
      project: { featuresRootExists: boolean; needsInitialization: boolean };
    };
    expect(firstBody.createdDirectories).toHaveLength(11);
    expect(firstBody.createdFiles).toHaveLength(2);
    expect(firstBody.project).toEqual(expect.objectContaining({
      featuresRootExists: true,
      needsInitialization: false,
    }));
    for (const path of [...firstBody.createdDirectories, ...firstBody.createdFiles]) {
      expect(existsSync(path)).toBe(true);
    }
    const featureCounterPath = resolve(memoryBankPath, "Features", "NEXT_FEATURE_ID.txt");
    writeFileSync(featureCounterPath, "77\n", "utf8");

    const second = await fetch(initializationUrl, { method: "POST" });

    expect(second.status).toBe(201);
    await expect(second.json()).resolves.toEqual(expect.objectContaining({
      createdDirectories: [],
      createdFiles: [],
    }));
    expect(readFileSync(featureCounterPath, "utf8")).toBe("77\n");
  });

  it("lists scanned work items through the production project boundary", async () => {
    const workItemRoot = resolve(fixtureRoot, "work-item-project");
    const memoryBankPath = resolve(workItemRoot, "MemoryBank");
    mkdirSync(resolve(workItemRoot, ".git"), { recursive: true });
    mkdirSync(memoryBankPath, { recursive: true });
    const registration = await fetch(`${baseUrl}/api/projects`, {
      body: JSON.stringify({
        memoryBankPath: "MemoryBank",
        name: "Work-item fixture",
        rootPath: workItemRoot,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const registrationBody = await registration.json() as { project: { id: string } };
    const projectId = registrationBody.project.id;
    const encodedProjectId = encodeURIComponent(projectId);
    expect((await fetch(
      `${baseUrl}/api/projects/${encodedProjectId}/initialize-memory-bank`,
      { method: "POST" },
    )).status).toBe(201);
    const featureFolder = resolve(
      memoryBankPath,
      "Features",
      "01_SUBMITTED",
      "FEAT-901-collection-item",
    );
    mkdirSync(featureFolder, { recursive: true });
    writeFileSync(resolve(featureFolder, "FeatureDescription.md"), [
      "# Collection Item",
      "",
      "| Field | Value |",
      "| --- | --- |",
      "| Feature ID | FEAT-901 |",
      "| Status | SUBMITTED |",
      "",
      "## Summary",
      "",
      "A generic work item exposed through the project boundary.",
    ].join("\n"), "utf8");
    writeFileSync(resolve(featureFolder, "design-summary.md"), [
      "# Generated Design Summary",
      "",
      "A generated design document exposed independently from the source specification.",
    ].join("\n"), "utf8");

    const response = await fetch(`${baseUrl}/api/projects/${encodedProjectId}/work-items`);

    expect(response.status).toBe(200);
    const body = await response.json() as {
      items: Array<{ externalId: string; id: string }>;
      project: { id: string; counts: Record<string, number> };
      scanStatus: { epicScanFailed: boolean };
      scannedAt: string;
    };
    expect(body.items.map((item) => item.externalId)).toContain("FEAT-901");
    expect(body.project).toEqual(expect.objectContaining({
      id: projectId,
      counts: expect.objectContaining({ "01_SUBMITTED": 1 }),
    }));
    expect(body.scanStatus.epicScanFailed).toBe(false);
    expect(Number.isNaN(Date.parse(body.scannedAt))).toBe(false);

    const listedItem = body.items.find((item) => item.externalId === "FEAT-901");
    expect(listedItem).toBeDefined();
    const documentResponse = await fetch(
      `${baseUrl}/api/projects/${encodedProjectId}/work-items/${encodeURIComponent(listedItem!.id)}/document`,
    );
    expect(documentResponse.status).toBe(200);
    await expect(documentResponse.json()).resolves.toEqual(expect.objectContaining({
      cardId: listedItem!.id,
      externalId: "FEAT-901",
      content: expect.stringContaining("# Collection Item"),
    }));

    const designResponse = await fetch(
      `${baseUrl}/api/projects/${encodedProjectId}/work-items/${encodeURIComponent(listedItem!.id)}/design-artifacts/design-summary.md`,
    );
    expect(designResponse.status).toBe(200);
    await expect(designResponse.json()).resolves.toEqual(expect.objectContaining({
      cardId: listedItem!.id,
      content: expect.stringContaining("# Generated Design Summary"),
      documentRelativePath: expect.stringMatching(/design-summary\.md$/),
    }));

    const arbitraryFileResponse = await fetch(
      `${baseUrl}/api/projects/${encodedProjectId}/work-items/${encodeURIComponent(listedItem!.id)}/design-artifacts/FeatureDescription.md`,
    );
    expect(arbitraryFileResponse.status).toBe(404);
  });

  it("opens the production MemoryBank event stream for a registered project", async () => {
    const eventRoot = resolve(fixtureRoot, "event-project");
    mkdirSync(resolve(eventRoot, ".git"), { recursive: true });
    mkdirSync(resolve(eventRoot, "MemoryBank"), { recursive: true });
    const registration = await fetch(`${baseUrl}/api/projects`, {
      body: JSON.stringify({
        memoryBankPath: "MemoryBank",
        name: "Event fixture",
        rootPath: eventRoot,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const registrationBody = await registration.json() as { project: { id: string } };
    const projectId = registrationBody.project.id;
    const encodedProjectId = encodeURIComponent(projectId);
    expect((await fetch(
      `${baseUrl}/api/projects/${encodedProjectId}/initialize-memory-bank`,
      { method: "POST" },
    )).status).toBe(201);
    const controller = new AbortController();

    try {
      const response = await fetch(
        `${baseUrl}/api/projects/${encodedProjectId}/memory-bank-events`,
        { signal: controller.signal },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
      const firstChunk = await response.body!.getReader().read();
      const event = new TextDecoder().decode(firstChunk.value);
      expect(event).toContain("event: memorybank.connected");
      expect(event).toContain(`\"projectId\":\"${projectId}\"`);
    } finally {
      controller.abort();
    }

    const activityController = new AbortController();
    try {
      const activityResponse = await fetch(
        `${baseUrl}/api/projects/${encodedProjectId}/live-activity`,
        { signal: activityController.signal },
      );
      expect(activityResponse.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
      const firstActivityChunk = await activityResponse.body!.getReader().read();
      const activityEvent = new TextDecoder().decode(firstActivityChunk.value);
      expect(activityEvent).toContain("event: live-activity.connected");
      expect(activityEvent).toContain(`\"projectId\":\"${projectId}\"`);
    } finally {
      activityController.abort();
    }
  });

  it("executes JSON decoding, serialization, CORS, and durable registration through the production listener", async () => {
    const response = await fetch(`${baseUrl}/api/projects`, {
      body: JSON.stringify({
        memoryBankPath: "MemoryBank",
        name: "HTTP boundary fixture",
        rootPath: projectRoot,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
    await expect(response.json()).resolves.toEqual({
      project: expect.objectContaining({
        memoryBankPath: resolve(projectRoot, "MemoryBank"),
        name: "HTTP boundary fixture",
        rootPath: projectRoot,
      }),
    });
    expect(existsSync(projectStorePath)).toBe(true);
    expect(readFileSync(projectStorePath, "utf8")).toContain("HTTP boundary fixture");
  });

  it("preserves typed failures through the production listener error boundary", async () => {
    const response = await fetch(`${baseUrl}/api/projects`, {
      body: JSON.stringify({
        memoryBankPath: "MemoryBank",
        name: "Missing project",
        rootPath: resolve(fixtureRoot, "missing"),
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "MISSING_FOLDER",
      error: expect.stringContaining("does not exist"),
      field: "rootPath",
    });
  });

  it("preserves missing-feature application failures through the production listener", async () => {
    const response = await fetch(`${baseUrl}/api/missing-features/preview`, {
      body: JSON.stringify({
        cardId: "missing-card",
        projectId: "missing-project",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Project not found." });
  });

  it("preserves work-item submission failures through the production listener", async () => {
    const response = await fetch(`${baseUrl}/api/submit-feature`, {
      body: JSON.stringify({
        projectId: "missing-project",
        summary: "Exercise the production submission boundary.",
        title: "Boundary fixture",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Project not found." });
  });

  it("resolves relationship commands through the production project boundary", async () => {
    const response = await fetch(
      `${baseUrl}/api/projects/missing-project/features/FEAT-001/link-epic`,
      {
        body: JSON.stringify({ operation: "link", targetEpicCardId: "EPIC-001" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Project not found" });
  });

  it("preserves EPIC refinement failures through the production listener", async () => {
    const response = await fetch(`${baseUrl}/api/epic-refinements`, {
      body: JSON.stringify({
        cardId: "missing-card",
        projectId: "missing-project",
        request: "Clarify the boundary.",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Project not found." });
  });

  it("preserves feature lifecycle failures through the production listener", async () => {
    const response = await fetch(`${baseUrl}/api/feature-ui-requirement`, {
      body: JSON.stringify({ cardId: "missing-card", projectId: "missing-project" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Project not found." });
  });

  it("preserves human-review failures through the production listener", async () => {
    const response = await fetch(`${baseUrl}/api/feature-human-review`, {
      body: JSON.stringify({
        cardId: "missing-card",
        check: "manual-tests",
        projectId: "missing-project",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Project not found." });
  });

  it("validates manual-test queries through the production listener", async () => {
    const response = await fetch(
      `${baseUrl}/api/manual-test-verification/status?projectId=registered-without-card`,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "projectId and cardId query parameters are required.",
    });
  });

  it("reads an empty workflow console through the production listener", async () => {
    const runId = "workflow-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const response = await fetch(`${baseUrl}/api/workflow-console/${runId}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      files: [],
      runId,
      refreshedAt: expect.any(String),
    }));
  });

  it("preserves deep-dive lookup failures through the production listener", async () => {
    const response = await fetch(`${baseUrl}/api/deep-dive-sessions/dd-missing-session`);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "SQLite metadata is required for Hepha deep-dive sessions.",
    });
  });

  it("validates delivery status queries through the production listener", async () => {
    const response = await fetch(`${baseUrl}/api/delivery/status?projectId=project-without-card`);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "projectId and cardId are required.",
    });
  });

  it("lists agent tasks through the production listener", async () => {
    const response = await fetch(`${baseUrl}/api/tasks`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ tasks: [] });
  });

  it("lists no approvals when optional metadata storage is disabled", async () => {
    const response = await fetch(`${baseUrl}/api/approvals?projectId=project`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ approvals: [] });
  });

  it("reads an empty generic phase timeline when optional storage is disabled", async () => {
    const response = await fetch(
      `${baseUrl}/api/projects/project/features/card/timeline/phase/2`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      cardKey: "card",
      invocations: [],
      phaseNumber: 2,
      phaseTitle: "Phase 2",
      projectId: "project",
    });
  });

  it("reads empty run analytics when optional storage is disabled", async () => {
    const response = await fetch(`${baseUrl}/api/projects/project/analytics/runs`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      grouped: [],
      modelComparisons: [],
      outliers: [],
      projectId: "project",
      totals: expect.objectContaining({ totalInvocations: 0 }),
    }));
  });

  it("searches empty receipt evidence when optional storage is disabled", async () => {
    const response = await fetch(`${baseUrl}/api/projects/project/receipts`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      projectId: "project",
      results: [],
      totalCount: 0,
    });
  });

  it("lists provider connections through the production listener", async () => {
    const response = await fetch(`${baseUrl}/api/provider-connections`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("serves preflight responses through the production listener", async () => {
    const response = await fetch(`${baseUrl}/api/projects`, { method: "OPTIONS" });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
    expect(await response.text()).toBe("");
  });
});
