import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DirectImplementationSkillApplication } from "../src/workflows/implementation/direct-implementation-skill-application.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-direct-implementation-skill.feature", import.meta.url)), "utf8");
const source = readFileSync(fileURLToPath(new URL("../src/workflows/implementation/direct-implementation-skill-application.ts", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(fileURLToPath(new URL("../src/bootstrap/implementation-worker-applications.ts", import.meta.url)), "utf8");
const autonomousWorkflow = readFileSync(fileURLToPath(new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url)), "utf8");

describe("generic direct implementation skill Gherkin integration", () => {
  it("specifies direct recovery without fixed workflow identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("owns both feature-level implementation roles", () => {
    expect(DirectImplementationSkillApplication).toBeTypeOf("function");
    expect(source).toContain('"start-feature"');
    expect(source).toContain('"continue-implementation"');
    expect(source).toContain("worker.execute");
  });

  it("leaves only composition and delegation in the root", () => {
    expect(composition).toContain("directImplementation: directImplementationSkillApplication");
    expect(autonomousWorkflow).toContain("this.dependencies.directImplementation.execute(");
    expect(root).not.toContain("function runDirectImplementationSkillWorkflow");
  });
});
