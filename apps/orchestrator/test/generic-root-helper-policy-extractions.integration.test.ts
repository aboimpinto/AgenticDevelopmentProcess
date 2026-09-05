import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ProjectChangeNotifier } from "../src/application/projects/project-change-notifier.js";
import { normalizeRelativeProjectPath } from "../src/application/projects/relative-project-path-policy.js";
import { slugifySessionFileComponent } from "../src/runtime/pi/session-file-name-policy.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-root-helper-policy-extractions.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const infrastructure = readFileSync(fileURLToPath(new URL("../src/bootstrap/workflow-infrastructure-applications.ts", import.meta.url)), "utf8");

describe("generic extracted root helper policy Gherkin integration", () => {
  it("specifies reusable behavior without workflow identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+/i);
  });
  it("exports all owners and removes their former root implementations", () => {
    expect(ProjectChangeNotifier).toBeTypeOf("function");
    expect(normalizeRelativeProjectPath).toBeTypeOf("function");
    expect(slugifySessionFileComponent).toBeTypeOf("function");
    expect(infrastructure).toContain("projectChangeNotifier.notify.bind(projectChangeNotifier)");
    expect(root).not.toContain("function normalizeRelativePath");
    expect(root).not.toContain("function slugify");
  });
});
