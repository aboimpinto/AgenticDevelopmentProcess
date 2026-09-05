import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { createDeliveryApplications } from "../src/bootstrap/delivery-applications.js";
import { preparePr } from "../src/delivery-adapter.js";
import {
  prepareFeatureDelivery,
  readFeatureDeliveryStatus,
  type DeliveryApplicationDependencies,
} from "../src/application/delivery/delivery-application.js";

vi.mock("../src/delivery-adapter.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/delivery-adapter.js")>(),
  preparePr: vi.fn(async () => ({ message: "Prepared.", outcome: "started", prNumber: 62, prUrl: "https://example.test/pr/62" })),
}));

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function fixture() {
  const rootPath = mkdtempSync(resolve(tmpdir(), "hepha-delivery-application-"));
  roots.push(rootPath);
  const memoryBankPath = resolve(rootPath, "MemoryBank");
  const folderName = "FEAT-001-delivery-boundary";
  const folderPath = resolve(memoryBankPath, "Features", "03_IN_PROGRESS", folderName);
  mkdirSync(resolve(folderPath, "Phases"), { recursive: true });
  writeFileSync(resolve(folderPath, "FeatureDescription.md"), [
    "# FEAT-001: Delivery Boundary",
    "",
    "## Summary",
    "",
    "Prepare delivery through an application service.",
    "",
    "## Hepha Delivery",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| Delivery Mode | pull_request |",
    "| Target Branch | master |",
    "| Pull Request | |",
    "| Delivery Status | ready |",
  ].join("\n"), "utf8");
  writeFileSync(
    resolve(folderPath, "Phases", "phase-0-any-name.md"),
    "# Phase 0 Any Name\n\n**Status:** COMPLETED\n",
    "utf8",
  );
  const project = {
    id: "project",
    memoryBankPath,
    name: "Delivery fixture",
    rootPath,
  } as StoredProject;
  return { cardId: `project:03_IN_PROGRESS:${folderName}`, folderName, folderPath, project };
}

function dependencies(project: StoredProject): DeliveryApplicationDependencies {
  return {
    findProject: vi.fn((projectId) => projectId === project.id ? project : undefined),
    getDeliveryMetadata: vi.fn(async () => null),
    now: vi.fn(() => "2026-07-21T00:00:00.000Z"),
    notifyProjectChanged: vi.fn(),
    prepare: vi.fn(async () => ({
      message: "Prepared.", outcome: "started", prNumber: 12, prUrl: "https://example.test/pr/12",
    })),
  };
}

describe("delivery application", () => {
  it("composes project lookup and persisted metadata through the public delivery read", async () => {
    const { cardId, folderName, project } = fixture();
    const getDeliveryMetadata = vi.fn(async () => ({ deliveryStatus: "open", pullRequest: 62 }));
    const applications = createDeliveryApplications({
      metadataStore: { getDeliveryMetadata } as never,
      notifyProjectChanged: vi.fn(),
      projects: { get: vi.fn((projectId) => projectId === project.id ? project : undefined) },
    });

    await expect(applications.readStatus({ cardId, projectId: project.id })).resolves.toMatchObject({
      status: 200,
      body: { pullRequest: 62, status: "open" },
    });
    expect(getDeliveryMetadata).toHaveBeenCalledWith(project.id, folderName);
  });

  it("composes preparation with the same project, metadata, clock, and notification boundary", async () => {
    const { cardId, project } = fixture();
    const notifyProjectChanged = vi.fn();
    const applications = createDeliveryApplications({
      metadataStore: { getDeliveryMetadata: vi.fn(async () => null) } as never,
      notifyProjectChanged,
      projects: { get: vi.fn(() => project) },
    });

    await expect(applications.prepare({ approved: true, cardId, projectId: project.id })).resolves.toMatchObject({
      status: 200,
      body: { outcome: "started" },
    });
    expect(vi.mocked(preparePr)).toHaveBeenCalledWith(
      expect.objectContaining({ repoPath: project.rootPath }),
      expect.objectContaining({ approvalState: "approved" }),
      expect.anything(),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    );
    expect(notifyProjectChanged).toHaveBeenCalledWith(project.id, "delivery.preparation.succeeded", expect.any(String));
  });

  it("builds status from the current feature document and overlays persisted delivery state", async () => {
    const { cardId, folderName, project } = fixture();
    const deps = dependencies(project);
    vi.mocked(deps.getDeliveryMetadata).mockResolvedValue({
      deliveryStatus: "open",
      pullRequest: 12,
    });

    const result = await readFeatureDeliveryStatus({ cardId, projectId: project.id }, deps);

    expect(result.status).toBe(200);
    expect(result.body).toEqual(expect.objectContaining({
      cardKey: cardId,
      pullRequest: 12,
      status: "open",
      statusLabel: expect.any(String),
    }));
    expect(deps.getDeliveryMetadata).toHaveBeenCalledWith(project.id, folderName);
  });

  it("treats persisted metadata lookup as a non-blocking enhancement", async () => {
    const { cardId, project } = fixture();
    const deps = dependencies(project);
    vi.mocked(deps.getDeliveryMetadata).mockRejectedValue(new Error("store unavailable"));

    const result = await readFeatureDeliveryStatus({ cardId, projectId: project.id }, deps);

    expect(result).toEqual(expect.objectContaining({
      status: 200,
      body: expect.objectContaining({ status: "ready", pullRequest: null }),
    }));
  });

  it("returns explicit project, card, and feature lookup failures", async () => {
    const { project } = fixture();
    const deps = dependencies(project);

    await expect(readFeatureDeliveryStatus(
      { cardId: "missing:03_IN_PROGRESS:item", projectId: "missing" }, deps,
    )).resolves.toEqual({ status: 404, body: { error: "Project not found." } });
    await expect(readFeatureDeliveryStatus(
      { cardId: "invalid", projectId: project.id }, deps,
    )).resolves.toEqual({ status: 400, body: { error: "Invalid cardId format." } });
    await expect(readFeatureDeliveryStatus(
      { cardId: "project:03_IN_PROGRESS:missing", projectId: project.id }, deps,
    )).resolves.toEqual({ status: 404, body: { error: "Feature not found." } });
  });

  it("builds the preparation request, phase evidence, and conservative human gates", async () => {
    const { cardId, folderName, folderPath, project } = fixture();
    const deps = dependencies(project);

    const result = await prepareFeatureDelivery(
      { approved: true, cardId, projectId: project.id }, deps,
    );

    expect(result.status).toBe(200);
    expect(deps.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        cardKey: folderName,
        externalId: folderName,
        featureDescription: "Prepare delivery through an application service.",
        featureFolderPath: folderPath,
        featureTitle: "FEAT-001: Delivery Boundary",
        projectId: project.id,
        repoPath: project.rootPath,
      }),
      expect.objectContaining({
        approvalState: "approved",
        manualTestVerificationAccepted: false,
        phaseStatuses: { "phase-0-any-name": "COMPLETED" },
        userCodeReviewAccepted: false,
      }),
      "2026-07-21T00:00:00.000Z",
    );
    expect(deps.notifyProjectChanged).toHaveBeenCalledWith(
      project.id, "delivery.preparation.succeeded", folderName,
    );
  });

  it("maps blocked/error preparation outcomes and notifies only errors", async () => {
    const { cardId, project } = fixture();
    const deps = dependencies(project);
    vi.mocked(deps.prepare).mockResolvedValue({
      message: "Blocked.", outcome: "blocked", prNumber: null, prUrl: null,
    });
    await expect(prepareFeatureDelivery({ cardId }, deps)).resolves.toEqual(expect.objectContaining({ status: 400 }));
    expect(deps.notifyProjectChanged).not.toHaveBeenCalled();

    vi.mocked(deps.prepare).mockResolvedValue({
      message: "Failed.", outcome: "error", prNumber: null, prUrl: null,
    });
    await expect(prepareFeatureDelivery({ cardId }, deps)).resolves.toEqual(expect.objectContaining({ status: 400 }));
    expect(deps.notifyProjectChanged).toHaveBeenCalledWith(
      project.id, "delivery.preparation.failed", expect.any(String),
    );
  });
});
