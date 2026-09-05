import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectProjectStack, toProjectSummary } from "../src/projects/project-summary.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { force: true, recursive: true });
  }
  temporaryRoots.length = 0;
});

function temporaryRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-project-summary-"));
  temporaryRoots.push(root);
  return root;
}

describe("project summary", () => {
  it("detects supported project-stack markers in their stable display order", () => {
    const root = temporaryRoot();
    for (const file of [
      "package.json",
      "tsconfig.json",
      "vite.config.ts",
      "next.config.mjs",
      "Cargo.toml",
      "application.sln",
    ]) {
      writeFileSync(resolve(root, file), "", "utf8");
    }

    expect(detectProjectStack(root)).toEqual([
      "Node.js",
      "TypeScript",
      "Vite",
      "Next.js",
      "Rust",
      ".NET",
    ]);
  });

  it("reports an unknown stack when no supported marker exists", () => {
    expect(detectProjectStack(temporaryRoot())).toEqual(["Unknown"]);
  });

  it("builds filesystem-derived initialization and work-item counts", () => {
    const root = temporaryRoot();
    const memoryBankPath = resolve(root, "MemoryBank");
    mkdirSync(resolve(memoryBankPath, "Features", "00_EPICS", "EPIC-one"), { recursive: true });
    mkdirSync(resolve(memoryBankPath, "Features", "01_SUBMITTED", "FEAT-one"), { recursive: true });
    mkdirSync(resolve(memoryBankPath, "Features", "01_SUBMITTED", "FEAT-two"), { recursive: true });
    writeFileSync(resolve(memoryBankPath, "Features", "01_SUBMITTED", "README.md"), "ignored", "utf8");
    const project: StoredProject = {
      id: "project-summary",
      createdAt: "2026-07-20T10:00:00.000Z",
      memoryBankPath,
      name: "Summary",
      rootPath: root,
      updatedAt: "2026-07-20T11:00:00.000Z",
      originalMemoryBankPathInput: "MemoryBank",
      originalRootPathInput: ".",
    };

    expect(toProjectSummary(project)).toEqual(expect.objectContaining({
      counts: expect.objectContaining({
        "00_EPICS": 1,
        "01_SUBMITTED": 2,
        "04_COMPLETED": 0,
      }),
      defaultBranch: "unknown",
      detectedStack: ["Unknown"],
      featuresRootExists: true,
      memoryBankRelativePath: "MemoryBank",
      needsInitialization: false,
      originalMemoryBankPathInput: "MemoryBank",
      originalRootPathInput: ".",
    }));
  });

  it("keeps an external MemoryBank path absolute and marks missing Features for initialization", () => {
    const root = temporaryRoot();
    const externalMemoryBank = temporaryRoot();
    const project: StoredProject = {
      id: "external-memory-bank",
      createdAt: "2026-07-20T10:00:00.000Z",
      memoryBankPath: externalMemoryBank,
      name: "External",
      rootPath: root,
      updatedAt: "2026-07-20T11:00:00.000Z",
    };

    expect(toProjectSummary(project)).toEqual(expect.objectContaining({
      featuresRootExists: false,
      memoryBankRelativePath: externalMemoryBank,
      needsInitialization: true,
    }));
  });

  it("keeps expected Git discovery failures out of operator stderr", () => {
    const root = temporaryRoot();
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const project: StoredProject = {
      id: "not-a-git-repository",
      createdAt: "2026-07-20T10:00:00.000Z",
      memoryBankPath: resolve(root, "MemoryBank"),
      name: "No Git",
      rootPath: root,
      updatedAt: "2026-07-20T11:00:00.000Z",
    };

    try {
      expect(toProjectSummary(project).defaultBranch).toBe("unknown");
      expect(stderrWrite).not.toHaveBeenCalled();
    } finally {
      stderrWrite.mockRestore();
    }
  });
});
