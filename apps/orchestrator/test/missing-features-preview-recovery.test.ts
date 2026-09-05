import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const previewControllerSource = readFileSync(
  resolve(testDir, "../../web/src/missing-features/use-missing-feature-preview.ts"),
  "utf8",
);
const orchestratorSource = readFileSync(resolve(testDir, "../src/index.ts"), "utf8");
const batchApplicationSource = readFileSync(
  resolve(testDir, "../src/application/features/missing-feature-batch-application.ts"),
  "utf8",
);

function getWebFunctionSource(functionName: string) {
  return getFunctionSource(previewControllerSource, functionName, "\n  function ");
}

function getFunctionSource(source: string, functionName: string, nextFunctionMarker: string) {
  const start = source.indexOf(`function ${functionName}`);
  const end = source.indexOf(nextFunctionMarker, start + 1);

  return source.slice(start, end === -1 ? undefined : end);
}

describe("missing FEAT preview recovery", () => {
  it("clears stale preview state when apply asks for a new preview", () => {
    const applySource = getWebFunctionSource("apply");

    expect(previewControllerSource).toContain("isRecoverableMissingFeaturesPreviewError");
    expect(applySource).toContain("isRecoverableMissingFeaturesPreviewError(message)");
    expect(applySource).toContain("reset()");
  });

  it("sends and applies the approved preview plan without rediscovering candidates", () => {
    const applySource = getWebFunctionSource("apply");
    const createSource = batchApplicationSource;

    expect(applySource).toContain("previewPlan: candidatePlan");
    expect(createSource).toContain("input.previewPlan ?? (await this.createCurrentPlan(project, epic, workItems))");
    expect(createSource).toContain("validateApprovedPreviewPlan");
    expect(createSource).toContain("approvedPreviewPlan.discoveredCandidates");
    expect(orchestratorSource).toContain("missingFeatureBatchApplication.create(input)");
    expect(orchestratorSource).not.toContain("function createMissingFeatures");
  });
});
