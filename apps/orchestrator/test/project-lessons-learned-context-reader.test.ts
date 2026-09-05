import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProjectLessonsLearnedFocus,
  extractLessonFocusTerms,
  isLessonRuleLine,
  isPathInsideDirectory,
  normalizeLessonRuleLine,
  ProjectLessonsLearnedContextReader,
  scoreProjectActiveLessonDocument,
  scoreProjectLessonText,
} from "../src/application/context/project-lessons-learned-context-reader.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
});

function createProject() {
  const rootPath = mkdtempSync(join(tmpdir(), "hepha-lessons-context-"));
  const memoryBankPath = join(rootPath, "MemoryBank");
  temporaryDirectories.push(rootPath);
  mkdirSync(join(memoryBankPath, "LessonsLearned", "Active"), { recursive: true });
  writeFileSync(join(rootPath, "Cargo.toml"), "[package]\nname = \"generic\"\n");
  return {
    createdAt: "now",
    id: "generic-project",
    memoryBankPath,
    name: "Generic project",
    rootPath,
    updatedAt: "now",
  } satisfies StoredProject;
}

describe("project LessonsLearned context reader", () => {
  it("renders focused active rules before bounded fallback documents", () => {
    const project = createProject();
    const lessons = join(project.memoryBankPath, "LessonsLearned");
    writeFileSync(join(lessons, "Active", "common.md"), "# Common\n\n- Rule: Never waive a failing build gate.");
    writeFileSync(join(lessons, "Active", "rust-cargo.md"), "# Cargo\n\n- Run exactly one Cargo command at a time.");
    writeFileSync(join(lessons, "Active", "index.md"), "# Index\n\n- Must not become an execution rule.");
    writeFileSync(join(lessons, "history.md"), "# History\n\nA code review finding should become prevention.");

    const rendered = new ProjectLessonsLearnedContextReader().render(project, {
      agentRole: "rust verification",
      maxActiveDocuments: 2,
      maxDocuments: 1,
    });

    expect(rendered).toContain("Active Rule Documents Selected For This Run");
    expect(rendered).toContain("MemoryBank/LessonsLearned/Active/common.md");
    expect(rendered).toContain("MemoryBank/LessonsLearned/Active/rust-cargo.md");
    expect(rendered).toContain("Active Rules Selected For This Run");
    expect(rendered).toContain("Never waive a failing build gate.");
    expect(rendered).toContain("Raw LessonsLearned Source Documents");
    expect(rendered).toContain("MemoryBank/LessonsLearned/history.md");
    expect(rendered).not.toContain("#### MemoryBank/LessonsLearned/Active/index.md");
  });

  it("reports a stable empty context when no lesson documents exist", () => {
    const project = createProject();

    expect(new ProjectLessonsLearnedContextReader().render(project)).toContain(
      "No LessonsLearned documents found.",
    );
  });

  it("derives focus from stack, role, phase, and project entries without stop words", () => {
    const project = createProject();
    mkdirSync(join(project.rootPath, "review-console"));

    const focus = createProjectLessonsLearnedFocus(project, {
      agentRole: "recovery specialist",
      phase: { number: 91, title: "Cargo Verification" },
    });

    expect(focus.keywords).toEqual(expect.arrayContaining(["rust", "recovery", "specialist", "cargo", "verification", "review-console"]));
    expect(focus.keywords).not.toContain("phase");
    expect(extractLessonFocusTerms("Tests and package work with Rust Rust")).toEqual(["work", "rust"]);
  });

  it("scores common and context-specific active documents while excluding the index", () => {
    const focus = { displayKeywords: [], keywords: ["rust", "review", "verification"] };

    expect(scoreProjectActiveLessonDocument("common.md", "a required rule", focus)).toBeGreaterThan(80);
    expect(scoreProjectActiveLessonDocument("rust-cargo.md", "cargo build verification", focus)).toBeGreaterThan(40);
    expect(scoreProjectActiveLessonDocument("index.md", "rust review verification", focus)).toBe(0);
    expect(scoreProjectLessonText("Code review findings must prevent recurrence", focus)).toBeGreaterThan(0);
  });

  it("normalizes executable rule lines and enforces directory boundaries", () => {
    expect(normalizeLessonRuleLine("  3.   Must   validate output  ")).toBe("Must validate output");
    expect(isLessonRuleLine("Must validate every generated contract before publishing it.")).toBe(true);
    expect(isLessonRuleLine("short note")).toBe(false);
    expect(isPathInsideDirectory("/repo/Lessons/Active/rule.md", "/repo/Lessons/Active")).toBe(true);
    expect(isPathInsideDirectory("/repo/Lessons/history.md", "/repo/Lessons/Active")).toBe(false);
    expect(isPathInsideDirectory("/repo/Lessons/Active", "/repo/Lessons/Active")).toBe(false);
  });
});
