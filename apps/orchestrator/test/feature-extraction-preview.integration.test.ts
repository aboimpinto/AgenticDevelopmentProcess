// Behavior suite: feature extraction preview.
import { describe, expect, it, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { buildPreviewPlan } from "../src/batch-preview/plan-builder.js";
import type { WorkItemCard } from "@hepha/shared";

// ──────────────────────────────────────────────
// Integration tests with isolated MemoryBank fixtures
// ──────────────────────────────────────────────

describe("preview/apply boundary with isolated MemoryBank fixtures", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { force: true, recursive: true });
    }
    tempDirs.length = 0;
  });

  function createMemoryBankFixture(epicMarkdown: string, existingFeats: string[] = []) {
    const root = resolve(tmpdir(), `hepha-preview-integration-${randomUUID()}`);
    tempDirs.push(root);

    // Create MemoryBank structure
    const featuresRoot = resolve(root, "Features");
    mkdirSync(resolve(featuresRoot, "00_EPICS"), { recursive: true });
    mkdirSync(resolve(featuresRoot, "01_SUBMITTED"), { recursive: true });
    mkdirSync(resolve(featuresRoot, "03_IN_PROGRESS"), { recursive: true });
    mkdirSync(resolve(featuresRoot, "04_COMPLETED"), { recursive: true });

    // Write EPIC document
    const epicFolder = resolve(featuresRoot, "00_EPICS", "EPIC-003-test-epic");
    mkdirSync(epicFolder, { recursive: true });
    writeFileSync(resolve(epicFolder, "EpicDescription.md"), epicMarkdown, "utf8");

    // Create existing feature folders
    for (const feat of existingFeats) {
      mkdirSync(resolve(featuresRoot, "04_COMPLETED", `${feat}-existing`), { recursive: true });
      writeFileSync(
        resolve(featuresRoot, "04_COMPLETED", `${feat}-existing`, "FeatureDescription.md"),
        `# ${feat}: Existing Feature`,
        "utf8",
      );
    }

    // Write NEXT_FEATURE_ID.txt
    writeFileSync(resolve(featuresRoot, "NEXT_FEATURE_ID.txt"), "100\n", "utf8");

    const epicCard: Partial<WorkItemCard> = {
      externalId: "EPIC-003",
      title: "Test EPIC",
      specMarkdown: epicMarkdown,
      folderName: "EPIC-003-test-epic",
      folderPath: epicFolder,
      documentPath: resolve(epicFolder, "EpicDescription.md"),
      kind: "epic",
    };

    return { root, epicCard: epicCard as WorkItemCard };
  }

  it("preview plan does not create any files or folders", () => {
    const epicMarkdown = `
| Feature ID | Title | Status | Dependencies | Priority |
|------------|-------|--------|--------------|----------|
| FEAT-001 | First | COMPLETED | | P1 |
| TBD | New Feature | SUBMITTED | FEAT-001 | P1 |
`;
    const { root, epicCard } = createMemoryBankFixture(epicMarkdown, ["FEAT-001"]);

    // Snapshot existing state
    const submittedBefore = resolve(root, "Features", "01_SUBMITTED");
    const submittedFilesBefore = existsSync(submittedBefore)
      ? readdirSync(submittedBefore)
      : [];
    const counterBefore = readFileSync(resolve(root, "Features", "NEXT_FEATURE_ID.txt"), "utf8");

    // Build preview plan
    const plan = buildPreviewPlan({
      epic: epicCard,
      epicDocumentPath: epicCard.documentPath ?? "",
      existingFeatureIds: new Set(["FEAT-001"]),
      memoryBankPath: root,
      discoveredFeatures: [],
    });

    // Verify plan structure
    expect(plan.explicitCandidates).toHaveLength(0); // No FEAT-IDs that miss folders besides existing ones
    expect(plan.warnings.some((w) => w.type === "tbd-row")).toBe(true);

    // Verify no filesystem changes
    const submittedAfter = resolve(root, "Features", "01_SUBMITTED");
    const submittedFilesAfter = existsSync(submittedAfter)
      ? readdirSync(submittedAfter)
      : [];
    const counterAfter = readFileSync(resolve(root, "Features", "NEXT_FEATURE_ID.txt"), "utf8");

    expect(submittedFilesAfter).toEqual(submittedFilesBefore);
    expect(counterAfter).toBe(counterBefore);
  });

  it("preview plan includes EPIC updates and warnings for TBD rows", () => {
    const epicMarkdown = `
# EPIC-003

## Features Breakdown

| Feature ID | Title | Status | Dependencies | Priority |
|------------|-------|--------|--------------|----------|
| FEAT-001 | Layer 1 | COMPLETED | | P1 |
| FEAT-003 | Layer 3 | COMPLETED | | P1 |
| TBD | New Feature | SUBMITTED | FEAT-001 | P1 |
`;
    const { root, epicCard } = createMemoryBankFixture(epicMarkdown, ["FEAT-001", "FEAT-003"]);

    const plan = buildPreviewPlan({
      epic: epicCard,
      epicDocumentPath: epicCard.documentPath ?? "",
      existingFeatureIds: new Set(["FEAT-001", "FEAT-003"]),
      memoryBankPath: root,
      discoveredFeatures: [
        {
          acceptanceCriteria: ["Preview works"],
          dependencyIds: ["FEAT-001"],
          description: "Implement preview/apply boundary.",
          priority: "P1",
          title: "Batch Preview",
        },
      ],
    });

    // Verify discovered candidates
    const candidate = plan.discoveredCandidates.find(({ title }) => title === "Batch Preview");

    expect(candidate).toMatchObject({
      dependencyIds: ["FEAT-001"],
      priority: "P1",
      title: "Batch Preview",
    });

    // Verify EPIC updates
    expect(plan.epicUpdates.length).toBeGreaterThan(0);
    expect(plan.epicUpdates.some((u) => u.section === "feature-table")).toBe(true);

    // Verify warnings
    expect(plan.warnings.some((w) => w.type === "tbd-row")).toBe(true);
    expect(plan.warnings.some((w) => w.type === "epic-order-gap")).toBe(true); // FEAT-001 to FEAT-003 gap

    // Verify apply is allowed
    expect(plan.applyAllowed).toBe(true);
  });

  it("preview plan sets applyAllowed=false when no candidates exist", () => {
    const epicMarkdown = `
| Feature ID | Title | Status |
|------------|-------|--------|
| FEAT-001 | Layer 1 | COMPLETED |
`;
    const { root, epicCard } = createMemoryBankFixture(epicMarkdown, ["FEAT-001"]);

    const plan = buildPreviewPlan({
      epic: epicCard,
      epicDocumentPath: epicCard.documentPath ?? "",
      existingFeatureIds: new Set(["FEAT-001"]),
      memoryBankPath: root,
      discoveredFeatures: [],
    });

    expect(plan.explicitCandidates).toHaveLength(0);
    expect(plan.discoveredCandidates).toHaveLength(0);
    expect(plan.applyAllowed).toBe(false);
  });
});
