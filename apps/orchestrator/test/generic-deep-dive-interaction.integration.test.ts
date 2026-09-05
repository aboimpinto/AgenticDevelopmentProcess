import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-deep-dive-interaction.feature"), "utf8");
const orchestratorSource = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const compositionSource = readFileSync(resolve(testRoot, "../src/bootstrap/deep-dive-applications.ts"), "utf8");

describe("generic Deep-Dive interaction Gherkin integration", () => {
  it("defines three identity-blind interaction outcomes", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(specification).not.toMatch(/(?:FEAT|EPIC|Phase|Task)-?\d+/i);
  });

  it("composes extracted policy and chat responsibilities", () => {
    expect(orchestratorSource).toContain("createDeepDiveApplications({");
    expect(compositionSource).toContain("new DeepDiveChatResponder");
    expect(compositionSource).toContain("deepDiveChatResponder.createReply");
    expect(orchestratorSource).not.toContain("function createDeepDiveChatReply");
    expect(orchestratorSource).not.toContain("function createStaleDeepDiveRecoveryQuestion");
    expect(orchestratorSource).not.toContain("function getDeepDiveWorkflowCommand");
  });
});
