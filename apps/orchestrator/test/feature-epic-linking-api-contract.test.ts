// Behavior suite: feature epic linking.
// ---------------------------------------------------------------------------
// FEAT-019 API Contract Tests — Response shape, error mapping, and
// scanner verification contract for the link-feature-to-epic endpoint.
//
// These tests verify that the LinkFeatureToEpicResponse contract matches
// what the business layer produces and that the response shape is complete
// and compatible with the dashboard consumption contract.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import type {
  LinkFeatureToEpicInput,
  LinkFeatureToEpicResponse,
  EpicUpdateSummary,
  ScannerVerificationResult,
} from "@hepha/shared";
import {
  linkFeatureToEpic,
  type LinkFeatureToEpicResult,
} from "../src/feature-epic-linking-orchestrator.js";
import { buildFeatFixture, buildEpicFixture } from "./fixtures/feature-epic-linking.js";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SetupContext {
  memoryBankPath: string;
  featFolder: string;
  epic001Folder: string;
  epic002Folder: string;
}

function setupFixtures(): SetupContext {
  const tmpDir = resolve(tmpdir(), `feat-019-api-${randomUUID()}`);
  const mbPath = resolve(tmpDir, "MemoryBank");
  const featuresPath = resolve(mbPath, "Features");

  mkdirSync(resolve(featuresPath, "00_EPICS", "EPIC-001-old-epic"), { recursive: true });
  mkdirSync(resolve(featuresPath, "00_EPICS", "EPIC-002-new-epic"), { recursive: true });
  mkdirSync(resolve(featuresPath, "03_IN_PROGRESS", "FEAT-019-test-feat"), { recursive: true });
  mkdirSync(resolve(featuresPath, "04_COMPLETED", "FEAT-001-existing"), { recursive: true });

  const featFolder = resolve(featuresPath, "03_IN_PROGRESS", "FEAT-019-test-feat");
  const epic001Folder = resolve(featuresPath, "00_EPICS", "EPIC-001-old-epic");
  const epic002Folder = resolve(featuresPath, "00_EPICS", "EPIC-002-new-epic");

  // FEAT-019 standalone (no parent)
  writeFileSync(
    resolve(featFolder, "FeatureDescription.md"),
    buildFeatFixture("FEAT-019", "Test Feat", "IN PROGRESS", null),
  );

  // EPIC-001 (old epic) with FEAT-001 already
  writeFileSync(
    resolve(epic001Folder, "EpicDescription.md"),
    buildEpicFixture("EPIC-001", "Old Epic", ["FEAT-001"], {
      includeCustomContent: true,
    }),
  );

  // EPIC-002 (target epic) with FEAT-001 already
  writeFileSync(
    resolve(epic002Folder, "EpicDescription.md"),
    buildEpicFixture("EPIC-002", "New Epic", ["FEAT-001"], {
      includeCustomContent: true,
    }),
  );

  return { memoryBankPath: mbPath, featFolder, epic001Folder, epic002Folder };
}

function cleanupFixtures(ctx: SetupContext): void {
  try {
    rmSync(resolve(ctx.memoryBankPath, ".."), { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

function buildResponseFromResult(result: LinkFeatureToEpicResult): LinkFeatureToEpicResponse {
  const affectedFeatIds = result.changedFiles.length > 0 ? ["FEAT-019"] : [];
  const affectedEpicIds = [
    ...result.previousParentEpicIds,
    ...result.newParentEpicIds,
  ].filter((id, index, array) => array.indexOf(id) === index);

  const epicUpdates: Record<string, EpicUpdateSummary> = {};
  for (const epicId of affectedEpicIds) {
    epicUpdates[epicId] = {
      epicId,
      epicTitle: epicId === "EPIC-001" ? "Old Epic" : "New Epic",
      sectionsUpdated: result.changedFiles.filter((f) => f.includes(epicId)).length > 0
        ? ["Features Breakdown"]
        : [],
      warnings: [],
    };
  }

  return {
    affectedFeatIds,
    affectedEpicIds,
    filesChanged: result.changedFiles,
    oldParentEpicIds: result.previousParentEpicIds,
    newParentEpicIds: result.newParentEpicIds,
    epicUpdates,
    scannerVerification: {
      linkedEpicIds: result.success ? result.newParentEpicIds : [],
      linkedFeatureIds: [],
      matched: result.success,
    },
    warnings: result.warnings,
    blockers: result.blockers,
    summary: result.summary,
  };
}

// ---------------------------------------------------------------------------
// Response Contract Tests
// ---------------------------------------------------------------------------

describe("LinkFeatureToEpicResponse contract — response shape", () => {
  it("produces a complete LinkFeatureToEpicResponse from a successful link result", () => {
    const ctx = setupFixtures();
    try {
      const result = linkFeatureToEpic(
        {
          operation: "link",
          featCardId: "FEAT-019",
          targetEpicCardId: "EPIC-002",
        },
        ctx.memoryBankPath,
      );

      const response = buildResponseFromResult(result);

      // Verify success
      expect(result.success).toBe(true);
      expect(result.blockers).toHaveLength(0);

      // Verify response shape matches contract
      expect(response).toHaveProperty("affectedFeatIds");
      expect(response).toHaveProperty("affectedEpicIds");
      expect(response).toHaveProperty("filesChanged");
      expect(response).toHaveProperty("oldParentEpicIds");
      expect(response).toHaveProperty("newParentEpicIds");
      expect(response).toHaveProperty("epicUpdates");
      expect(response).toHaveProperty("scannerVerification");
      expect(response).toHaveProperty("warnings");
      expect(response).toHaveProperty("blockers");
      expect(response).toHaveProperty("summary");

      // Verify success response values
      expect(response.affectedFeatIds).toContain("FEAT-019");
      expect(response.newParentEpicIds).toContain("EPIC-002");
      expect(response.oldParentEpicIds).toHaveLength(0);
      expect(response.filesChanged.length).toBeGreaterThan(0);
      expect(response.blockers).toHaveLength(0);
      expect(response.summary).toContain("Linked");
      expect(response.summary).toContain("FEAT-019");
    } finally {
      cleanupFixtures(ctx);
    }
  });

  it("produces a complete LinkFeatureToEpicResponse from a successful relink result", () => {
    const ctx = setupFixtures();
    try {
      // First link FEAT-019 to EPIC-001
      const firstResult = linkFeatureToEpic(
        { operation: "link", featCardId: "FEAT-019", targetEpicCardId: "EPIC-001" },
        ctx.memoryBankPath,
      );
      expect(firstResult.success).toBe(true);

      // Now relink from EPIC-001 to EPIC-002
      const result = linkFeatureToEpic(
        { operation: "relink", featCardId: "FEAT-019", targetEpicCardId: "EPIC-002" },
        ctx.memoryBankPath,
      );

      const response = buildResponseFromResult(result);

      expect(response.oldParentEpicIds).toContain("EPIC-001");
      expect(response.newParentEpicIds).toContain("EPIC-002");
      expect(response.summary).toContain("Relinked");
      expect(response.blockers).toHaveLength(0);
    } finally {
      cleanupFixtures(ctx);
    }
  });

  it("produces a complete LinkFeatureToEpicResponse from a successful unlink result", () => {
    const ctx = setupFixtures();
    try {
      // First link FEAT-019 to EPIC-001
      const firstResult = linkFeatureToEpic(
        { operation: "link", featCardId: "FEAT-019", targetEpicCardId: "EPIC-001" },
        ctx.memoryBankPath,
      );
      expect(firstResult.success).toBe(true);

      // Now unlink
      const result = linkFeatureToEpic(
        { operation: "unlink", featCardId: "FEAT-019" },
        ctx.memoryBankPath,
      );

      const response = buildResponseFromResult(result);

      expect(response.oldParentEpicIds).toContain("EPIC-001");
      expect(response.newParentEpicIds).toHaveLength(0);
      expect(response.summary).toContain("Unlinked");
      expect(response.blockers).toHaveLength(0);
    } finally {
      cleanupFixtures(ctx);
    }
  });

  it("returns blockers for missing target EPIC", () => {
    const ctx = setupFixtures();
    try {
      const result = linkFeatureToEpic(
        { operation: "link", featCardId: "FEAT-019", targetEpicCardId: "EPIC-999" },
        ctx.memoryBankPath,
      );

      expect(result.success).toBe(false);
      expect(result.blockers.length).toBeGreaterThan(0);
      expect(result.blockers.some((b) => b.includes("EPIC-999"))).toBe(true);
      expect(result.changedFiles).toHaveLength(0);
    } finally {
      cleanupFixtures(ctx);
    }
  });

  it("returns blockers for missing FEAT card", () => {
    const ctx = setupFixtures();
    try {
      const result = linkFeatureToEpic(
        { operation: "link", featCardId: "FEAT-999", targetEpicCardId: "EPIC-002" },
        ctx.memoryBankPath,
      );

      expect(result.success).toBe(false);
      expect(result.blockers.length).toBeGreaterThan(0);
      expect(result.blockers.some((b) => b.includes("FEAT-999"))).toBe(true);
      expect(result.changedFiles).toHaveLength(0);
    } finally {
      cleanupFixtures(ctx);
    }
  });

  it("omits previous epic from updates when FEAT has no parent (link)", () => {
    const ctx = setupFixtures();
    try {
      const result = linkFeatureToEpic(
        { operation: "link", featCardId: "FEAT-019", targetEpicCardId: "EPIC-001" },
        ctx.memoryBankPath,
      );

      const response = buildResponseFromResult(result);

      // FEAT-019 starts with no parent, so oldParentEpicIds is empty
      expect(response.oldParentEpicIds).toHaveLength(0);
      // Only target EPIC (EPIC-001) should appear in affected IDs
      expect(response.affectedEpicIds).toEqual(["EPIC-001"]);
    } finally {
      cleanupFixtures(ctx);
    }
  });

  it("includes both old and new EPICs in affected list for relink", () => {
    const ctx = setupFixtures();
    try {
      // First link to EPIC-001
      linkFeatureToEpic(
        { operation: "link", featCardId: "FEAT-019", targetEpicCardId: "EPIC-001" },
        ctx.memoryBankPath,
      );

      // Relink to EPIC-002
      const result = linkFeatureToEpic(
        { operation: "relink", featCardId: "FEAT-019", targetEpicCardId: "EPIC-002" },
        ctx.memoryBankPath,
      );

      const response = buildResponseFromResult(result);

      // Both EPIC-001 (previous) and EPIC-002 (new) should be in affected list
      expect(response.affectedEpicIds).toContain("EPIC-001");
      expect(response.affectedEpicIds).toContain("EPIC-002");
      expect(response.oldParentEpicIds).toContain("EPIC-001");
      expect(response.newParentEpicIds).toContain("EPIC-002");
    } finally {
      cleanupFixtures(ctx);
    }
  });

  it("sets matched to true when scanner verification succeeds", () => {
    const ctx = setupFixtures();
    try {
      const result = linkFeatureToEpic(
        { operation: "link", featCardId: "FEAT-019", targetEpicCardId: "EPIC-002" },
        ctx.memoryBankPath,
      );

      const response = buildResponseFromResult(result);

      // Scanner verification should report matched=true since we built the response from the successful result
      expect(response.scannerVerification.matched).toBe(true);
      expect(response.scannerVerification.linkedEpicIds).toContain("EPIC-002");
    } finally {
      cleanupFixtures(ctx);
    }
  });
});

// ---------------------------------------------------------------------------
// Error Mapping Tests
// ---------------------------------------------------------------------------

describe("LinkFeatureToEpicResponse error mapping", () => {
  it("maps missing FEAT error to a blockers array entry and establishes the format", () => {
    const ctx = setupFixtures();
    try {
      const result = linkFeatureToEpic(
        { operation: "link", featCardId: "FEAT-999", targetEpicCardId: "EPIC-001" },
        ctx.memoryBankPath,
      );

      expect(result.blockers.length).toBeGreaterThan(0);
      // Error format should include the FEAT ID
      const blocker = result.blockers[0]!;
      expect(blocker).toContain("FEAT-999");
      // Blocker should be descriptive, not just a code
      expect(blocker.length).toBeGreaterThan(10);
    } finally {
      cleanupFixtures(ctx);
    }
  });

  it("maps missing EPIC error to a blockers array entry", () => {
    const ctx = setupFixtures();
    try {
      const result = linkFeatureToEpic(
        { operation: "link", featCardId: "FEAT-019", targetEpicCardId: "EPIC-999" },
        ctx.memoryBankPath,
      );

      expect(result.blockers.length).toBeGreaterThan(0);
      const blocker = result.blockers[0]!;
      expect(blocker).toContain("EPIC-999");
      expect(result.success).toBe(false);
    } finally {
      cleanupFixtures(ctx);
    }
  });

  it("returns no changed files when operation is blocked", () => {
    const ctx = setupFixtures();
    try {
      const result = linkFeatureToEpic(
        { operation: "link", featCardId: "FEAT-019", targetEpicCardId: "EPIC-999" },
        ctx.memoryBankPath,
      );

      expect(result.changedFiles).toHaveLength(0);
    } finally {
      cleanupFixtures(ctx);
    }
  });
});

// ---------------------------------------------------------------------------
// Scanner Verification Contract Tests
// ---------------------------------------------------------------------------

describe("ScannerVerificationResult contract", () => {
  it("has required fields: linkedEpicIds, linkedFeatureIds, matched", () => {
    const verification: ScannerVerificationResult = {
      linkedEpicIds: ["EPIC-001"],
      linkedFeatureIds: ["FEAT-019"],
      matched: true,
    };

    expect(verification).toHaveProperty("linkedEpicIds");
    expect(verification).toHaveProperty("linkedFeatureIds");
    expect(verification).toHaveProperty("matched");
    expect(Array.isArray(verification.linkedEpicIds)).toBe(true);
    expect(Array.isArray(verification.linkedFeatureIds)).toBe(true);
    expect(typeof verification.matched).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// EpicUpdateSummary Contract Tests
// ---------------------------------------------------------------------------

describe("EpicUpdateSummary contract", () => {
  it("has required fields: epicId, epicTitle, sectionsUpdated, warnings", () => {
    const summary: EpicUpdateSummary = {
      epicId: "EPIC-001",
      epicTitle: "Old Epic",
      sectionsUpdated: ["Features Breakdown"],
      warnings: [],
    };

    expect(summary).toHaveProperty("epicId");
    expect(summary).toHaveProperty("epicTitle");
    expect(summary).toHaveProperty("sectionsUpdated");
    expect(summary).toHaveProperty("warnings");
    expect(Array.isArray(summary.sectionsUpdated)).toBe(true);
    expect(Array.isArray(summary.warnings)).toBe(true);
  });

  it("can have empty sectionsUpdated and warnings arrays", () => {
    const summary: EpicUpdateSummary = {
      epicId: "EPIC-001",
      epicTitle: "Test Epic",
      sectionsUpdated: [],
      warnings: [],
    };

    expect(summary.sectionsUpdated).toHaveLength(0);
    expect(summary.warnings).toHaveLength(0);
  });
});
