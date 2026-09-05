import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const webStyles = readFileSync(resolve(testDir, "../../web/src/styles.css"), "utf8");

function extractCssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, "m").exec(webStyles);
  return match?.[1] ?? null;
}

describe("workflow position CSS", () => {
  it("keeps workflow-position rules outside the validation warning badge block", () => {
    const warningRule = extractCssRule(".validation-badge.warning");

    expect(warningRule).not.toBeNull();
    expect(warningRule).toContain("background: rgba(255, 193, 116, 0.16);");
    expect(warningRule).toContain("color: var(--primary);");
    expect(warningRule).not.toContain(".card-workflow-position");
    expect(warningRule).not.toContain(".detail-workflow-synopsis");
  });

  it("defines workflow-position card and detail layout as top-level CSS rules", () => {
    expect(extractCssRule(".card-workflow-position")).toContain("display: flex;");
    expect(extractCssRule(".synopsis-details")).toContain("display: flex;");
    expect(extractCssRule(".synopsis-row")).toContain("display: inline-flex;");
  });

  it("defines Run Trace as a Workflow Readiness card", () => {
    expect(extractCssRule(".workflow-trace-card")).toContain("border: 1px solid");
    expect(extractCssRule(".workflow-trace-card-header")).toContain("display: flex;");
    expect(extractCssRule(".workflow-trace-card-header strong")).toContain("text-transform: uppercase;");
  });
});
