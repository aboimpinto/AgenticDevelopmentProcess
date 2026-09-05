import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectLessonsLearnedContextReader } from "../src/application/context/project-lessons-learned-context-reader.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-project-lessons-learned-context.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
});

describe("generic project LessonsLearned context Gherkin integration", () => {
  it("specifies focused, index-safe, boundary-safe context without work-item identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds workflow prompt composition to the extracted context reader", () => {
    const rootPath = mkdtempSync(join(tmpdir(), "hepha-generic-lessons-"));
    const memoryBankPath = join(rootPath, "MemoryBank");
    temporaryDirectories.push(rootPath);
    mkdirSync(join(memoryBankPath, "LessonsLearned", "Active"), { recursive: true });
    writeFileSync(join(memoryBankPath, "LessonsLearned", "Active", "common.md"), "Rule: Must retain generic recovery evidence.");

    const rendered = new ProjectLessonsLearnedContextReader().render({
      createdAt: "now",
      id: "project-any",
      memoryBankPath,
      name: "Project",
      rootPath,
      updatedAt: "now",
    });

    expect(rendered).toContain("Active Rules Selected For This Run");
    expect(orchestratorSource).toContain("new ProjectLessonsLearnedContextReader");
    expect(orchestratorSource).toContain("projectLessonsLearnedContextReader.render");
    expect(orchestratorSource).not.toContain("function renderProjectLessonsLearnedContext");
  });
});
