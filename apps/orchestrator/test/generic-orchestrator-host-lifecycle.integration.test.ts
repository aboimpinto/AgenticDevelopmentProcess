import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createRuntimeMetadataStore, prepareRegisteredProjects, startOrchestratorHost } from "../src/bootstrap/orchestrator-host-lifecycle.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-orchestrator-host-lifecycle.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");

describe("generic orchestrator host lifecycle Gherkin integration", () => {
  it("specifies host behavior without project-specific identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|limmat|sharks|dashboard/i);
  });

  it("exports the metadata, project preparation, and server lifecycle boundaries", () => {
    expect(createRuntimeMetadataStore).toBeTypeOf("function");
    expect(prepareRegisteredProjects).toBeTypeOf("function");
    expect(startOrchestratorHost).toBeTypeOf("function");
  });

  it("leaves host startup as root delegation", () => {
    expect(root).toContain("startOrchestratorHost({");
    expect(root).not.toContain("function createRuntimeCardMetadataStore");
    expect(root).not.toContain("function prepareRegisteredProjectsOnStartup");
  });
});
