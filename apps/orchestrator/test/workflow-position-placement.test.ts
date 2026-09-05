import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(testDir, "../../web/src");
const detailBlade = readFileSync(resolve(webRoot, "details/work-item-detail-blade.tsx"), "utf8");
const cardStackSource = readFileSync(resolve(webRoot, "workflow-position-card-stack.tsx"), "utf8");

describe("workflow position placement", () => {
  it("keeps workflow panel content after source metadata in the extracted detail blade", () => {
    const metadataIndex = detailBlade.indexOf('<div className="meta-row">');
    const sourceIndex = detailBlade.indexOf('<section className="active-run" aria-labelledby="document-source-title">');
    const panelsIndex = detailBlade.indexOf("{panelContents}");

    expect(metadataIndex).toBeGreaterThanOrEqual(0);
    expect(sourceIndex).toBeGreaterThan(metadataIndex);
    expect(panelsIndex).toBeGreaterThan(sourceIndex);
  });

  it("owns card workflow-position status presentation in WorkflowPositionCardStack", () => {
    expect(cardStackSource).toContain("export function WorkflowPositionCardStack");
    expect(cardStackSource).toContain("buildCardStatusStack(workflowPosition)");
    expect(cardStackSource).toContain("wp-execution-state");
    expect(cardStackSource).toContain("wp-quality-gate");
  });
});
