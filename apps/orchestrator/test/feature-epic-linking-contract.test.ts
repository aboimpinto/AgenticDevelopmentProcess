// Behavior suite: feature epic linking.
import { describe, expect, it } from "vitest";
import {
  type FeatEpicLinkInput,
  type FeatIdentity,
  type LinkOperation,
} from "../src/feature-epic-linking/link-types.js";
import { buildFeatEpicLinkPlan } from "../src/feature-epic-linking/link-plan.js";
import { planEpicChildPatch } from "../src/feature-epic-linking/epic-child-patch.js";
import { planFeatMetadataPatch } from "../src/feature-epic-linking/feature-metadata-patch.js";
import { buildEpicFixture, buildFeatFixture } from "./fixtures/feature-epic-linking.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeat(overrides?: Partial<FeatIdentity>): FeatIdentity {
  return {
    featId: "FEAT-019",
    title: "Link Feature To Epic Workflow",
    statusText: "IN PROGRESS",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// planFeatMetadataPatch — FEAT parent EPIC metadata
// ---------------------------------------------------------------------------

describe("planFeatMetadataPatch", () => {
  const feat = makeFeat();

  describe("link", () => {
    it("inserts **Parent Epic** line when absent", () => {
      const md = buildFeatFixture("FEAT-019", "Test", "READY", null);
      const result = planFeatMetadataPatch(md, feat, "link", "EPIC-001");

      expect(result.changed).toBe(true);
      expect(result.blockers).toHaveLength(0);
      expect(result.patchedMarkdown).toContain("**Parent Epic**: EPIC-001");
    });

    it("updates existing **Parent Epic** line when different", () => {
      const md = buildFeatFixture("FEAT-019", "Test", "READY", "EPIC-001");
      const result = planFeatMetadataPatch(md, feat, "link", "EPIC-002");

      expect(result.changed).toBe(true);
      expect(result.patchedMarkdown).toContain("**Parent Epic**: EPIC-002");
      expect(result.patchedMarkdown).not.toContain("**Parent Epic**: EPIC-001");
    });

    it("reports no-op when FEAT already linked to the same EPIC", () => {
      const md = buildFeatFixture("FEAT-019", "Test", "IN PROGRESS", "EPIC-001");
      const result = planFeatMetadataPatch(md, feat, "link", "EPIC-001");

      expect(result.changed).toBe(false);
      expect(result.warnings.some((w) => w.includes("already linked"))).toBe(true);
    });

    it("blocks when target EPIC ID is empty", () => {
      const md = buildFeatFixture("FEAT-019", "Test", "READY", null);
      const result = planFeatMetadataPatch(md, feat, "link", null);

      expect(result.blockers.length).toBeGreaterThan(0);
      expect(result.blockers[0]).toContain("required");
    });

    it("inserts EPIC backlink in Source section", () => {
      const md = buildFeatFixture("FEAT-019", "Test", "READY", null);
      const result = planFeatMetadataPatch(md, feat, "link", "EPIC-001");

      expect(result.patchedMarkdown).toContain("- EPIC: EPIC-001 - Link Feature To Epic Workflow");
    });

    it("updates existing backlink in Source section", () => {
      const md = buildFeatFixture("FEAT-019", "Test", "READY", "EPIC-001");
      const result = planFeatMetadataPatch(md, feat, "link", "EPIC-002");

      expect(result.patchedMarkdown).toContain("- EPIC: EPIC-002 - Link Feature To Epic Workflow");
      expect(result.patchedMarkdown).not.toContain("- EPIC: EPIC-001 -");
    });
  });

  describe("relink", () => {
    it("updates **Parent Epic** line to new EPIC", () => {
      const md = buildFeatFixture("FEAT-019", "Test", "IN PROGRESS", "EPIC-001");
      const result = planFeatMetadataPatch(md, feat, "relink", "EPIC-002");

      expect(result.changed).toBe(true);
      expect(result.patchedMarkdown).toContain("**Parent Epic**: EPIC-002");
      expect(result.patchedMarkdown).not.toContain("**Parent Epic**: EPIC-001");
    });
  });

  describe("unlink", () => {
    it("removes **Parent Epic** line when present", () => {
      const md = buildFeatFixture("FEAT-019", "Test", "IN PROGRESS", "EPIC-001");
      const result = planFeatMetadataPatch(md, feat, "unlink", null);

      expect(result.changed).toBe(true);
      expect(result.patchedMarkdown).not.toContain("**Parent Epic**");
    });

    it("reports warning when FEAT has no parent EPIC to remove", () => {
      const md = buildFeatFixture("FEAT-019", "Test", "READY", null);
      const result = planFeatMetadataPatch(md, feat, "unlink", null);

      expect(result.changed).toBe(false);
      expect(result.warnings.some((w) => w.includes("already has no parent"))).toBe(true);
    });

    it("removes EPIC backlink from Source section", () => {
      const md = buildFeatFixture("FEAT-019", "Test", "IN PROGRESS", "EPIC-001");
      const result = planFeatMetadataPatch(md, feat, "unlink", null);

      expect(result.patchedMarkdown).not.toContain("- EPIC: EPIC-001");
    });
  });

  describe("no-destructive-write guards", () => {
    it("blocks when multiple **Parent Epic** lines exist", () => {
      const md = buildFeatFixture("FEAT-019", "Test", "READY", "EPIC-001") +
        "\n**Parent Epic**: EPIC-002\n";
      const result = planFeatMetadataPatch(md, feat, "link", "EPIC-003");

      expect(result.blockers.length).toBeGreaterThan(0);
      expect(result.blockers[0]).toContain("Ambiguous");
      expect(result.changed).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// planEpicChildPatch — EPIC child FEAT references
// ---------------------------------------------------------------------------

describe("planEpicChildPatch", () => {
  const feat = makeFeat();

  describe("link to target EPIC", () => {
    it("inserts FEAT row in Features Breakdown table", () => {
      const md = buildEpicFixture("EPIC-001", "Test Epic", ["FEAT-001"]);
      const result = planEpicChildPatch(md, feat, "link", "target");

      expect(result.changed).toBe(true);
      expect(result.patchedMarkdown).toContain("| FEAT-019 | Link Feature To Epic Workflow | IN PROGRESS | - | - |");
    });

    it("updates existing FEAT row status", () => {
      const md = buildEpicFixture("EPIC-001", "Test Epic", ["FEAT-019"]);
      // Replace the default status
      const mdWithStatus = md.replace("| FEAT-019 | FEAT-019 feature | IN PROGRESS | - | - |", "| FEAT-019 | Link Feature To Epic Workflow | READY | - | - |");
      const result = planEpicChildPatch(mdWithStatus, feat, "link", "target");

      expect(result.changed).toBe(true);
      expect(result.patchedMarkdown).toContain("IN PROGRESS");
    });
  });

  describe("relink cleanup (previous EPIC)", () => {
    it("removes FEAT row from previous EPIC Features Breakdown", () => {
      const md = buildEpicFixture("EPIC-001", "Old Epic", ["FEAT-019", "FEAT-001"]);
      const result = planEpicChildPatch(md, feat, "relink", "previous");

      expect(result.changed).toBe(true);
      // FEAT-019 row removed from Features Breakdown table
      expect(result.patchedMarkdown).not.toContain("| FEAT-019 | FEAT-019 feature |");
    });

    it("preserves unrelated FEAT rows in previous EPIC", () => {
      const md = buildEpicFixture("EPIC-001", "Old Epic", ["FEAT-001", "FEAT-019", "FEAT-002"]);
      const result = planEpicChildPatch(md, feat, "relink", "previous");

      expect(result.changed).toBe(true);
      expect(result.patchedMarkdown).toContain("FEAT-001");
      expect(result.patchedMarkdown).toContain("FEAT-002");
      // FEAT-019 row removed from Features Breakdown table (Feature Details/Progress Tracking preserved)
      expect(result.patchedMarkdown).not.toContain("| FEAT-019 | FEAT-019 feature |");
    });
  });

  describe("unlink", () => {
    it("removes FEAT row from EPIC Features Breakdown", () => {
      const md = buildEpicFixture("EPIC-001", "Test Epic", ["FEAT-019", "FEAT-001"]);
      const result = planEpicChildPatch(md, feat, "unlink", "target");

      expect(result.changed).toBe(true);
      // FEAT-019 row removed from Features Breakdown table (Feature Details/Progress Tracking preserved)
      expect(result.patchedMarkdown).not.toContain("| FEAT-019 | FEAT-019 feature |");
    });
  });

  describe("EPIC document without Features Breakdown", () => {
    it("adds a minimal Features Breakdown section for link operation", () => {
      const md = buildEpicFixture("EPIC-001", "Simple Epic", []);
      const result = planEpicChildPatch(md, feat, "link", "target");

      expect(result.changed).toBe(true);
      expect(result.patchedMarkdown).toContain("## Features Breakdown");
      expect(result.patchedMarkdown).toContain("| FEAT-019 | Link Feature To Epic Workflow | IN PROGRESS | - | - |");
    });
  });
});

// ---------------------------------------------------------------------------
// buildFeatEpicLinkPlan — Complete plan coordination
// ---------------------------------------------------------------------------

describe("buildFeatEpicLinkPlan", () => {
  const feat = makeFeat();

  it("builds link plan: FEAT metadata + target EPIC update", () => {
    const featMd = buildFeatFixture("FEAT-019", "Test", "READY", null);
    const targetEpicMd = buildEpicFixture("EPIC-002", "Target Epic", ["FEAT-001"]);

    const input: FeatEpicLinkInput = {
      feat,
      operation: "link",
      featMarkdown: featMd,
      previousEpicMarkdown: null,
      targetEpicMarkdown: targetEpicMd,
    };

    const plan = buildFeatEpicLinkPlan(input);

    expect(plan.operation).toBe("link");
    expect(plan.featPatch.changed).toBe(true);
    expect(plan.featPatch.patchedMarkdown).toContain("**Parent Epic**: EPIC-002");
    expect(plan.targetEpicPatch).not.toBeNull();
    expect(plan.targetEpicPatch!.changed).toBe(true);
    expect(plan.targetEpicPatch!.patchedMarkdown).toContain("FEAT-019");
    expect(plan.previousEpicPatch).toBeNull();
    expect(plan.targetEpicId).toBe("EPIC-002");
    expect(plan.globalBlockers).toHaveLength(0);
  });

  it("builds relink plan: FEAT metadata update + previous EPIC cleanup + target EPIC update", () => {
    const featMd = buildFeatFixture("FEAT-019", "Test", "IN PROGRESS", "EPIC-001");
    const previousEpicMd = buildEpicFixture("EPIC-001", "Old Epic", ["FEAT-019", "FEAT-001"]);
    const targetEpicMd = buildEpicFixture("EPIC-002", "New Epic", ["FEAT-002"]);

    const input: FeatEpicLinkInput = {
      feat,
      operation: "relink",
      featMarkdown: featMd,
      previousEpicMarkdown: previousEpicMd,
      targetEpicMarkdown: targetEpicMd,
    };

    const plan = buildFeatEpicLinkPlan(input);

    expect(plan.operation).toBe("relink");
    expect(plan.featPatch.changed).toBe(true);
    expect(plan.featPatch.patchedMarkdown).toContain("**Parent Epic**: EPIC-002");
    expect(plan.featPatch.patchedMarkdown).not.toContain("**Parent Epic**: EPIC-001");

    // Previous EPIC: FEAT-019 removed
    expect(plan.previousEpicPatch).not.toBeNull();
    expect(plan.previousEpicPatch!.changed).toBe(true);
    // FEAT-019 row removed from previous EPIC Features Breakdown
    expect(plan.previousEpicPatch!.patchedMarkdown).not.toContain("| FEAT-019 | FEAT-019 feature |");

    // Target EPIC: FEAT-019 added
    expect(plan.targetEpicPatch).not.toBeNull();
    expect(plan.targetEpicPatch!.changed).toBe(true);
    expect(plan.targetEpicPatch!.patchedMarkdown).toContain("FEAT-019");

    // Previous parent extracted
    expect(plan.previousParentEpicIds).toContain("EPIC-001");
    expect(plan.targetEpicId).toBe("EPIC-002");
    expect(plan.globalBlockers).toHaveLength(0);
  });

  it("builds unlink plan: FEAT metadata removal + EPIC cleanup", () => {
    const featMd = buildFeatFixture("FEAT-019", "Test", "IN PROGRESS", "EPIC-001");
    const previousEpicMd = buildEpicFixture("EPIC-001", "Old Epic", ["FEAT-019", "FEAT-001"]);

    const input: FeatEpicLinkInput = {
      feat,
      operation: "unlink",
      featMarkdown: featMd,
      previousEpicMarkdown: previousEpicMd,
      targetEpicMarkdown: null,
    };

    const plan = buildFeatEpicLinkPlan(input);

    expect(plan.operation).toBe("unlink");
    expect(plan.featPatch.changed).toBe(true);
    expect(plan.featPatch.patchedMarkdown).not.toContain("**Parent Epic**");

    // EPIC cleanup
    expect(plan.previousEpicPatch).not.toBeNull();
    expect(plan.previousEpicPatch!.changed).toBe(true);
    // FEAT-019 row removed from EPIC Features Breakdown
    expect(plan.previousEpicPatch!.patchedMarkdown).not.toContain("| FEAT-019 | FEAT-019 feature |");

    expect(plan.targetEpicPatch).toBeNull();
    expect(plan.previousParentEpicIds).toContain("EPIC-001");
    expect(plan.globalBlockers).toHaveLength(0);
  });

  it("preserves unrelated content in previous EPIC during relink", () => {
    const featMd = buildFeatFixture("FEAT-019", "Test", "IN PROGRESS", "EPIC-001");
    const previousEpicMd = buildEpicFixture("EPIC-001", "Old Epic", ["FEAT-001", "FEAT-019", "FEAT-002"], {
      includeCustomContent: true,
      includeMermaid: true,
    });
    const targetEpicMd = buildEpicFixture("EPIC-002", "New Epic", ["FEAT-003"]);

    const input: FeatEpicLinkInput = {
      feat,
      operation: "relink",
      featMarkdown: featMd,
      previousEpicMarkdown: previousEpicMd,
      targetEpicMarkdown: targetEpicMd,
    };

    const plan = buildFeatEpicLinkPlan(input);

    // Previous EPIC: FEAT-019 removed, but unrelated content preserved
    const prevMd = plan.previousEpicPatch!.patchedMarkdown;
    expect(prevMd).toContain("FEAT-001");
    expect(prevMd).toContain("FEAT-002");
    // FEAT-019 row removed from Features Breakdown table (unrelated content preserved elsewhere)
    expect(prevMd).not.toContain("| FEAT-019 | FEAT-019 feature |");
    expect(prevMd).toContain("Custom Notes");
    expect(prevMd).toContain("Key 1");
    expect(prevMd).toContain("mermaid");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  const feat = makeFeat();

  it("handles no-op link (FEAT already linked to target EPIC)", () => {
    const featMd = buildFeatFixture("FEAT-019", "Test", "IN PROGRESS", "EPIC-001");
    const targetEpicMd = buildEpicFixture("EPIC-001", "Same Epic", ["FEAT-019"]);

    const input: FeatEpicLinkInput = {
      feat,
      operation: "link",
      featMarkdown: featMd,
      previousEpicMarkdown: null,
      targetEpicMarkdown: targetEpicMd,
    };

    const plan = buildFeatEpicLinkPlan(input);
    // FEAT already has Parent Epic: EPIC-001, so feat patch is no-op
    expect(plan.featPatch.warnings.some((w) => w.includes("already linked"))).toBe(true);
  });

  it("blocks on ambiguous parent lines", () => {
    const featMd = buildFeatFixture("FEAT-019", "Test", "READY", "EPIC-001") +
      "\n**Parent Epic**: EPIC-002\n";
    const targetEpicMd = buildEpicFixture("EPIC-003", "Target", []);

    const input: FeatEpicLinkInput = {
      feat,
      operation: "link",
      featMarkdown: featMd,
      previousEpicMarkdown: null,
      targetEpicMarkdown: targetEpicMd,
    };

    const plan = buildFeatEpicLinkPlan(input);
    expect(plan.globalBlockers.length).toBeGreaterThan(0);
    expect(plan.featPatch.changed).toBe(false);
  });

  it("handles FEAT without any parent EPIC (standalone)", () => {
    const featMd = buildFeatFixture("FEAT-019", "Standalone", "READY", null);

    const result = planFeatMetadataPatch(featMd, feat, "unlink", null);
    expect(result.changed).toBe(false);
    expect(result.warnings.some((w) => w.includes("already has no parent"))).toBe(true);
  });
});
