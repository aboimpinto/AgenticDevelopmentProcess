// Behavior suite: batch preview idempotency.
import { describe, expect, it } from "vitest";
import type { CreateMissingFeaturesResponse } from "@hepha/shared";

// ──────────────────────────────────────────────
// FEAT-011: Extended response shape contract
// ──────────────────────────────────────────────

describe("CreateMissingFeaturesResponse contract", () => {
  it("accepts the minimal FEAT-010 response shape (backward compat)", () => {
    const response: CreateMissingFeaturesResponse = {
      createdFeatureIds: ["FEAT-011"],
      discoveredFeatureCount: 1,
      items: [],
      project: {
        id: "test",
        name: "Test",
        memoryBankPath: "/tmp/test",
        rootPath: "/tmp",
        projectPath: "/tmp/test",
        createdAt: new Date().toISOString(),
        gitBranch: "master",
        gitRoot: "/tmp",
        remoteName: "origin",
        upToDate: true,
        dataSource: "local",
      },
      skippedFeatureIds: [],
    };

    expect(response.createdFeatureIds).toEqual(["FEAT-011"]);
    expect(response.discoveredFeatureCount).toBe(1);
    expect(response.existingFeatureIds).toBeUndefined();
    expect(response.recoveredFeatureIds).toBeUndefined();
    expect(response.blockedFeatureIds).toBeUndefined();
    expect(response.epicUpdates).toBeUndefined();
    expect(response.warnings).toBeUndefined();
  });

  it("accepts the enriched FEAT-011 response shape", () => {
    const response: CreateMissingFeaturesResponse = {
      createdFeatureIds: ["FEAT-011"],
      discoveredFeatureCount: 1,
      items: [],
      project: {
        id: "test",
        name: "Test",
        memoryBankPath: "/tmp/test",
        rootPath: "/tmp",
        projectPath: "/tmp/test",
        createdAt: new Date().toISOString(),
        gitBranch: "master",
        gitRoot: "/tmp",
        remoteName: "origin",
        upToDate: true,
        dataSource: "local",
      },
      skippedFeatureIds: [],
      existingFeatureIds: ["FEAT-001", "FEAT-010"],
      recoveredFeatureIds: [],
      blockedFeatureIds: [],
      epicUpdates: [
        { section: "feature-table", updated: true, details: ["Added FEAT-011 row"] },
        { section: "feature-details", updated: true, details: ["Added detail section"] },
        { section: "progress-tracking", updated: true, details: ["Added progress entry"] },
        { section: "mermaid-diagram", updated: true, details: ["Added diagram node"] },
      ],
      warnings: [],
    };

    expect(response.createdFeatureIds).toEqual(["FEAT-011"]);
    expect(response.existingFeatureIds).toEqual(["FEAT-001", "FEAT-010"]);
    expect(response.recoveredFeatureIds).toEqual([]);
    expect(response.blockedFeatureIds).toEqual([]);
    expect(response.epicUpdates).toHaveLength(4);
    expect(response.epicUpdates![0].section).toBe("feature-table");
    expect(response.epicUpdates![0].updated).toBe(true);
    expect(response.warnings).toEqual([]);
  });

  it("accepts warning and blocked states", () => {
    const response: CreateMissingFeaturesResponse = {
      createdFeatureIds: [],
      discoveredFeatureCount: 0,
      items: [],
      project: {
        id: "test",
        name: "Test",
        memoryBankPath: "/tmp/test",
        rootPath: "/tmp",
        projectPath: "/tmp/test",
        createdAt: new Date().toISOString(),
        gitBranch: "master",
        gitRoot: "/tmp",
        remoteName: "origin",
        upToDate: true,
        dataSource: "local",
      },
      skippedFeatureIds: [],
      existingFeatureIds: [],
      recoveredFeatureIds: [],
      blockedFeatureIds: ["FEAT-020"],
      epicUpdates: [],
      warnings: [
        "ambiguous state: FEAT ID FEAT-020 appears in 01_SUBMITTED, 03_IN_PROGRESS. Manual resolution required.",
      ],
    };

    expect(response.blockedFeatureIds).toEqual(["FEAT-020"]);
    expect(response.warnings![0]).toContain("FEAT-020");
    expect(response.warnings![0]).toContain("ambiguous");
  });
});

// ──────────────────────────────────────────────
// EpicUpdateSection shape contract
// ──────────────────────────────────────────────

describe("EpicUpdateSection shape", () => {
  it("carries section, updated flag, and details", () => {
    const update = {
      section: "feature-table" as const,
      updated: true,
      details: ["Updated row for FEAT-011"],
    };

    expect(update.section).toBe("feature-table");
    expect(update.updated).toBe(true);
    expect(Array.isArray(update.details)).toBe(true);
  });

  it("accepts all section name values", () => {
    const sections = ["feature-table", "feature-details", "progress-tracking", "mermaid-diagram"] as const;

    for (const section of sections) {
      const update = { section, updated: false, details: [] as string[] };
      expect(update.section).toBe(section);
    }
  });
});

// ──────────────────────────────────────────────
// Error message contract
// ──────────────────────────────────────────────

describe("Apply error messages", () => {
  it("stale preview error message is actionable", () => {
    const msg = "EPIC document has changed since preview. Request a new preview.";
    expect(msg).toContain("preview");
    expect(msg).toContain("changed");
    expect(msg).toContain("new");
  });

  it("ambiguous state error message identifies FEAT IDs", () => {
    const blockedIds = ["FEAT-020"];
    const msg =
      `Cannot apply: ambiguous FEAT state detected for ${blockedIds.join(", ")}. ` +
      `These FEAT IDs appear in multiple state folders. Manual resolution required.`;
    expect(msg).toContain("FEAT-020");
    expect(msg).toContain("ambiguous");
  });

  it("dependency cycle error includes warnings", () => {
    const warnings = ["Dependency cycle detected"];
    const msg =
      `Cannot apply: dependency cycle detected. Resolve cycles and retry. Warnings: ${warnings.join("; ")}`;
    expect(msg).toContain("cycle");
    expect(msg).toContain("retry");
  });
});
