import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it } from "vitest";
import { WorkflowTransitionReceiptPolicy } from "../src/workflows/receipts/workflow-transition-receipt-policy.js";
import type { StoredProject } from "../src/projects/stored-project.js";

describe("workflow transition receipt policy", () => {
  it("builds deterministic source, task-plan, pack, and workflow context", () => {
    const root = mkdtempSync(join(tmpdir(), "hepha-transition-context-"));
    const documentPath = join(root, "FeatureDescription.md");
    const tasksPath = join(root, "FeatureTasks.md");
    writeFileSync(documentPath, "# Scope", "utf8");
    writeFileSync(tasksPath, "# Tasks", "utf8");
    const policy = new WorkflowTransitionReceiptPolicy({ normalizePath: (_from, to) => to.slice(root.length + 1) });
    const result = policy.createContext(
      { rootPath: root } as StoredProject,
      { documentPath, externalId: "ITEM-ANY", folderPath: root, kind: "feature", specMarkdown: "# Scope", stateFolder: "02_READY_TO_DEVELOP" } as WorkItemCard,
      { name: "Selected", packId: "pack-any", path: ".hepha/context.json" },
    );

    expect(result.packRefs).toEqual([{ name: "Selected", packId: "pack-any", path: ".hepha/context.json" }]);
    expect(result.context).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "file", path: "FeatureDescription.md", packId: "pack-any" }),
      expect.objectContaining({ kind: "file", path: "FeatureTasks.md", packId: "pack-any" }),
      expect.objectContaining({ kind: "workflow", path: ".workflows/feature-02_READY_TO_DEVELOP.metadata" }),
    ]));
  });

  it("returns an actionable error for invalid receipt context", () => {
    const policy = new WorkflowTransitionReceiptPolicy({ normalizePath: (_from, to) => to });
    const error = policy.validate({
      cardKey: "feature:item-any", command: "refine-feature",
      context: [],
      nextState: "02_READY_TO_DEVELOP", projectId: "project", projectRoot: "/missing-project", stage: "promote-ready",
    });
    expect(error?.message).toContain("Receipt validation blocked the promote-ready transition");
  });
});
