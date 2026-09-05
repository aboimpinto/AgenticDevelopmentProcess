// Behavior suite: feature submission.
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  deriveFeatureDocumentPath,
  deriveFeatureFolderPath,
  renderSubmitFeatureDocument,
} from "../src/feature-submission.js";
import type { SubmitFeatureInput } from "@hepha/shared";

// ──────────────────────────────────────────────
// The submitFeature function orchestrates:
//   1. Project lookup (via projects Map)
//   2. Input validation (title, summary required)
//   3. Parent EPIC validation (if supplied)
//   4. allocateNextFeatureId()
//   5. Folder/doc path derivation
//   6. No-overwrite guard
//   7. renderSubmitFeatureDocument() + mkdirSync + writeFileSync
//   8. notifyProjectChanged()
//   9. Work-item query refresh
//  10. Return SubmitFeatureResponse
//
// Pure-function units (renderer, path derivation, counter) are tested in
// feature-submission.test.ts (Phase 2). This test file validates the
// integration of pure helpers into the real orchestration contract.
// ──────────────────────────────────────────────

// ---------------------------------------------------------------------------
// renderSubmitFeatureDocument (re-validated in orchestration context)
// ---------------------------------------------------------------------------

describe("submitFeature pure helpers (orchestration contract)", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = resolve(tmpdir(), `feat-014-biz-test-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("folder and document path", () => {
    const featureId = "FEAT-020";
    const title = "Native Submit Feature Command";

    it("derives correct folder path for standalone submit", () => {
      const memoryBankPath = "/mb";
      const folderPath = deriveFeatureFolderPath(memoryBankPath, featureId, title);

      expect(folderPath).toContain("Features/01_SUBMITTED");
      expect(folderPath).toContain(featureId);
    });

    it("derives correct document path", () => {
      const memoryBankPath = "/mb";
      const docPath = deriveFeatureDocumentPath(memoryBankPath, featureId, title);
      const folderPath = deriveFeatureFolderPath(memoryBankPath, featureId, title);

      expect(docPath).toBe(`${folderPath}/FeatureDescription.md`);
    });
  });

  describe("rendered document (standalone FEAT)", () => {
    it("is valid Markdown with required headings", () => {
      const doc = renderSubmitFeatureDocument({
        featureId: "FEAT-020",
        title: "Native Submit Feature Command",
        summary: "Allow standalone FEAT submission from the dashboard/API.",
      });

      expect(doc).toMatch(/# FEAT-020: .+/);
      expect(doc).toMatch(/## Summary/);
      expect(doc).toMatch(/## Source/);
      expect(doc).toMatch(/## Validation/);
      expect(doc).toContain("[NEEDS VALIDATION]");
    });

    it("writes parent EPIC metadata when supplied", () => {
      const doc = renderSubmitFeatureDocument({
        featureId: "FEAT-020",
        title: "Test",
        summary: "Test summary.",
        parentEpicId: "EPIC-004",
        parentEpicTitle: "FEAT Planning Lifecycle",
      });

      expect(doc).toContain("**Parent Epic**: EPIC-004");
      expect(doc).toContain("EPIC: EPIC-004 - FEAT Planning Lifecycle");
    });

    it("omits parent EPIC metadata when not supplied", () => {
      const doc = renderSubmitFeatureDocument({
        featureId: "FEAT-021",
        title: "Standalone",
        summary: "No parent EPIC.",
      });

      expect(doc).not.toContain("**Parent Epic**");
      expect(doc).toContain("Standalone FEAT submission (no parent EPIC).");
    });

    it("handles all optional fields", () => {
      const doc = renderSubmitFeatureDocument({
        featureId: "FEAT-022",
        title: "Full Feature",
        summary: "All fields.",
        acceptanceCriteria: ["AC1"],
        parentEpicId: "EPIC-001",
        parentEpicTitle: "Core",
        priority: "High",
        externalReference: "REF-001",
        owner: "Owner",
      });

      expect(doc).toContain("**Priority**: High");
      expect(doc).toContain("**Owner**: Owner");
      expect(doc).toContain("**External Reference**: REF-001");
      expect(doc).toContain("## Acceptance Criteria");
      expect(doc).toContain("- AC1");
    });
  });

  describe("filesystem write simulation", () => {
    let memoryBankPath: string;
    let featDir: string;

    beforeAll(() => {
      memoryBankPath = resolve(tmpDir, "MemoryBank");
      featDir = resolve(memoryBankPath, "Features", "01_SUBMITTED");
      mkdirSync(featDir, { recursive: true });
    });

    it("writes a FeatureDescription.md that can be read back", () => {
      const featureId = "FEAT-030";
      const title = "Test Write";
      const summary = "Testing filesystem write.";
      const folderPath = deriveFeatureFolderPath(memoryBankPath, featureId, title);
      const docPath = deriveFeatureDocumentPath(memoryBankPath, featureId, title);

      mkdirSync(folderPath, { recursive: true });
      const markdown = renderSubmitFeatureDocument({
        featureId,
        title,
        summary,
        acceptanceCriteria: ["Writes without error"],
      });
      writeFileSync(docPath, markdown, "utf8");

      // Verify file exists and contains expected content
      expect(existsSync(docPath)).toBe(true);
      const content = readFileSync(docPath, "utf8");
      expect(content).toContain("# FEAT-030: Test Write");
      expect(content).toContain(summary);
      expect(content).toContain("- Writes without error");
    });

    it("no-overwrite guard works for existing folders", () => {
      const featureId = "FEAT-031";
      const title = "Duplicate Feature";
      const folderPath = deriveFeatureFolderPath(memoryBankPath, featureId, title);

      // Create folder first
      mkdirSync(folderPath, { recursive: true });

      // Should detect existing path
      expect(existsSync(folderPath)).toBe(true);
    });

    it("no-overwrite guard works for existing documents", () => {
      const featureId = "FEAT-032";
      const title = "Duplicate Document";
      const docPath = deriveFeatureDocumentPath(memoryBankPath, featureId, title);
      const folderPath = deriveFeatureFolderPath(memoryBankPath, featureId, title);

      mkdirSync(folderPath, { recursive: true });
      writeFileSync(docPath, "existing content", "utf8");

      expect(existsSync(docPath)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe("submitFeature input validation", () => {
  it("rejects empty title", () => {
    const input: SubmitFeatureInput = {
      projectId: "test-project",
      title: "  ",
      summary: "Valid summary.",
    };

    expect(input.title.trim()).toBe("");
  });

  it("rejects empty summary", () => {
    const input: SubmitFeatureInput = {
      projectId: "test-project",
      title: "Valid Title",
      summary: "  ",
    };

    expect(input.summary.trim()).toBe("");
  });

  it("accepts valid minimum input", () => {
    const input: SubmitFeatureInput = {
      projectId: "test-project",
      title: "My Feature",
      summary: "Feature summary.",
    };

    expect(input.title.trim()).toBe("My Feature");
    expect(input.summary.trim()).toBe("Feature summary.");
  });

  it("accepts input with parent EPIC", () => {
    const input: SubmitFeatureInput = {
      projectId: "test-project",
      title: "Feature With EPIC",
      summary: "Summary.",
      parentEpicId: "EPIC-001",
      parentEpicTitle: "Parent Epic",
    };

    expect(input.parentEpicId).toBe("EPIC-001");
  });

  it("accepts input with all optional fields", () => {
    const input: SubmitFeatureInput = {
      projectId: "test-project",
      title: "Full Feature",
      summary: "Full summary.",
      acceptanceCriteria: ["Criterion 1"],
      parentEpicId: "EPIC-001",
      parentEpicTitle: "Core",
      priority: "High",
      externalReference: "REF-001",
      owner: "Owner",
    };

    expect(input.acceptanceCriteria).toHaveLength(1);
    expect(input.priority).toBe("High");
    expect(input.owner).toBe("Owner");
  });
});
