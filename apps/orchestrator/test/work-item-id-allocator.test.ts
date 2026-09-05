import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  readPositiveIntegerFile,
  WorkItemIdAllocator,
} from "../src/application/work-items/work-item-id-allocator.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
});

function createProject() {
  const rootPath = mkdtempSync(join(tmpdir(), "hepha-id-allocator-"));
  const memoryBankPath = join(rootPath, "MemoryBank");
  temporaryDirectories.push(rootPath);
  mkdirSync(join(memoryBankPath, "Features", "00_EPICS"), { recursive: true });
  return { memoryBankPath, rootPath } as never;
}

describe("work-item ID allocator", () => {
  it("allocates from one when no counter or folders exist", () => {
    const project = createProject();
    const allocator = new WorkItemIdAllocator();

    expect(allocator.nextFeature(project)).toBe("FEAT-001");
    expect(readFileSync(join(project.memoryBankPath, "Features", "NEXT_FEATURE_ID.txt"), "utf8")).toBe("2\n");
    expect(allocator.nextEpic(project)).toBe("EPIC-001");
    expect(readFileSync(join(project.memoryBankPath, "Features", "00_EPICS", "NEXT_EPIC_ID.txt"), "utf8")).toBe("2\n");
  });

  it("uses the greater of the durable counter and observed folders", () => {
    const project = createProject();
    mkdirSync(join(project.memoryBankPath, "Features", "04_COMPLETED", "FEAT-012-complete"), { recursive: true });
    mkdirSync(join(project.memoryBankPath, "Features", "00_EPICS", "EPIC-009-existing"), { recursive: true });
    writeFileSync(join(project.memoryBankPath, "Features", "NEXT_FEATURE_ID.txt"), "7\n");
    writeFileSync(join(project.memoryBankPath, "Features", "00_EPICS", "NEXT_EPIC_ID.txt"), "15\n");
    const allocator = new WorkItemIdAllocator();

    expect(allocator.nextFeature(project)).toBe("FEAT-013");
    expect(allocator.nextEpic(project)).toBe("EPIC-015");
  });

  it("advances the feature counter beyond valid created IDs without moving it backwards", () => {
    const project = createProject();
    const counterPath = join(project.memoryBankPath, "Features", "NEXT_FEATURE_ID.txt");
    const allocator = new WorkItemIdAllocator();

    allocator.advanceFeaturePast(project, ["FEAT-004", "unrelated", "feat-019"]);
    expect(readFileSync(counterPath, "utf8")).toBe("20\n");
    writeFileSync(counterPath, "31\n");
    allocator.advanceFeaturePast(project, ["FEAT-008"]);
    expect(readFileSync(counterPath, "utf8")).toBe("31\n");
  });

  it("ignores an empty advance set and invalid counter content", () => {
    const project = createProject();
    const counterPath = join(project.memoryBankPath, "Features", "NEXT_FEATURE_ID.txt");
    const allocator = new WorkItemIdAllocator();

    allocator.advanceFeaturePast(project, ["invalid"]);
    expect(existsSync(counterPath)).toBe(false);
    writeFileSync(counterPath, "not-a-positive-integer\n");
    expect(readPositiveIntegerFile(counterPath)).toBeNull();
    expect(readPositiveIntegerFile(join(project.rootPath, "absent"))).toBeNull();
    expect(allocator.nextFeature(project)).toBe("FEAT-001");
  });
});
