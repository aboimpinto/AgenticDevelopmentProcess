import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const featurePath = fileURLToPath(new URL("./generic-feature-epic-link-application.feature", import.meta.url));
const applicationPath = fileURLToPath(new URL(
  "../src/application/features/feature-epic-link-application.ts",
  import.meta.url,
));
const orchestratorPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));

describe("generic feature/EPIC relationship Gherkin integration", () => {
  it("binds every scenario to the production relationship application", () => {
    const feature = readFileSync(featurePath, "utf8");
    const application = readFileSync(applicationPath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");
    expect(feature.match(/^  Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase 2|architecture debt/i);
    expect(application).toContain("this.dependencies.link({");
    expect(application).toContain("await this.dependencies.scan(project)");
    expect(application).toContain("this.dependencies.syncEpic(epicCard, items)");
    expect(orchestrator).toContain("featureEpicLinkApplication.execute(project, cardId, input)");
  });
});
