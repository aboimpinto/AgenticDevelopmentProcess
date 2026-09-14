import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { WorkItemCard } from "@hepha/shared";
import { completionRecoveryBlockers } from "../src/application/features/completion-recovery-policy.js";

it("attributes artifact diagnostics by exact declared document ownership, not message or numbering", () => {
  const root = mkdtempSync(join(tmpdir(), "hepha-blocker-location-"));
  try {
    const documentPath = join(root, "verification.md"); writeFileSync(documentPath, "# Verification\n");
    const feature = { folderPath: root, stateFolder: "03_IN_PROGRESS", phases: [{ number: 41, title: "Verification", status: "COMPLETED", documentPath }],
      featureWorkflow: { findings: [], userCodeReviewCompletedAt: "recorded", readiness: { reasons: [
        { message: "Missing declared status", blocking: true, affectedPath: "verification.md" },
        { message: "Missing declared status", blocking: true, affectedPath: documentPath },
        { message: "Feature status mismatch", blocking: true, affectedPath: "FeatureTasks.md" },
        { message: "Phase 41 mentioned in text is not ownership", blocking: true, affectedPath: "unknown.md" },
      ] } }, validation: { needsValidationCount: 0 } } as unknown as WorkItemCard;
    const artifacts = completionRecoveryBlockers(feature, true).filter(b => b.id.startsWith("artifact-"));
    expect(artifacts.map(b => b.phaseNumber)).toEqual([41, 41, null, null]);
    expect(artifacts.every(b => b.action === "external")).toBe(true);
    expect(artifacts[0]!.prerequisite).toContain(documentPath);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
