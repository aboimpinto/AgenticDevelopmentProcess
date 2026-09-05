import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getNextWorkItemNumber,
  initializeProjectMemoryBank,
} from "../src/projects/project-memory-bank-initializer.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots) rmSync(root, { force: true, recursive: true });
  temporaryRoots.length = 0;
});

function projectFixture(): StoredProject {
  const rootPath = mkdtempSync(resolve(tmpdir(), "hepha-memory-bank-init-"));
  temporaryRoots.push(rootPath);
  return {
    id: "project-initializer",
    createdAt: "2026-07-20T10:00:00.000Z",
    memoryBankPath: resolve(rootPath, "MemoryBank"),
    name: "Initializer",
    rootPath,
    updatedAt: "2026-07-20T10:00:00.000Z",
  };
}

describe("project MemoryBank initializer", () => {
  it("creates the canonical MemoryBank skeleton and initial counters", async () => {
    const project = projectFixture();

    const result = await initializeProjectMemoryBank(project);

    expect(result.createdDirectories).toHaveLength(11);
    for (const directory of [
      "Features/00_EPICS",
      "Features/01_SUBMITTED",
      "Features/02_READY_TO_DEVELOP",
      "Features/03_IN_PROGRESS",
      "Features/04_COMPLETED",
      "Features/05_CANCELLED",
      "Overview",
      "CodeGuidelines",
      "Architecture",
      "LessonsLearned",
      "Tools",
    ]) {
      expect(existsSync(resolve(project.memoryBankPath, directory))).toBe(true);
    }
    expect(result.createdFiles).toEqual([
      resolve(project.memoryBankPath, "Features", "00_EPICS", "NEXT_EPIC_ID.txt"),
      resolve(project.memoryBankPath, "Features", "NEXT_FEATURE_ID.txt"),
    ]);
    expect(readFileSync(result.createdFiles[0]!, "utf8")).toBe("1\n");
    expect(readFileSync(result.createdFiles[1]!, "utf8")).toBe("1\n");
  });

  it("derives the next IDs from all relevant lifecycle folders", () => {
    const project = projectFixture();
    for (const folder of [
      "Features/00_EPICS/EPIC-007-existing",
      "Features/01_SUBMITTED/FEAT-003-submitted",
      "Features/03_IN_PROGRESS/FEAT-021-active",
      "Features/04_COMPLETED/FEAT-013-complete",
    ]) {
      mkdirSync(resolve(project.memoryBankPath, folder), { recursive: true });
    }

    expect(getNextWorkItemNumber(project, "EPIC")).toBe(8);
    expect(getNextWorkItemNumber(project, "FEAT")).toBe(22);
  });

  it("is idempotent and never overwrites existing counter state", async () => {
    const project = projectFixture();
    const first = await initializeProjectMemoryBank(project);
    writeFileSync(first.createdFiles[0]!, "42\n", "utf8");
    writeFileSync(first.createdFiles[1]!, "99\n", "utf8");

    const second = await initializeProjectMemoryBank(project);

    expect(second).toEqual({ createdDirectories: [], createdFiles: [] });
    expect(readFileSync(first.createdFiles[0]!, "utf8")).toBe("42\n");
    expect(readFileSync(first.createdFiles[1]!, "utf8")).toBe("99\n");
  });
});
