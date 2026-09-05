import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getNextWorkItemNumber } from "../../projects/project-memory-bank-initializer.js";
import type { StoredProject } from "../../projects/stored-project.js";

/** Allocates durable, collision-aware FEAT and EPIC identifiers from MemoryBank counters. */
export class WorkItemIdAllocator {
  nextFeature(project: StoredProject) {
    const counterPath = resolve(project.memoryBankPath, "Features", "NEXT_FEATURE_ID.txt");
    const nextFromCounter = readPositiveIntegerFile(counterPath);
    const nextFromFolders = getNextWorkItemNumber(project, "FEAT");
    const nextNumber = Math.max(nextFromCounter ?? 1, nextFromFolders);

    writeCounter(counterPath, nextNumber + 1);

    return formatWorkItemId("FEAT", nextNumber);
  }

  advanceFeaturePast(project: StoredProject, featureIds: string[]) {
    const maxCreatedNumber = featureIds.reduce((max, featureId) => {
      const match = featureId.match(/^FEAT-(\d+)$/i);
      const value = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;

      return Number.isInteger(value) ? Math.max(max, value) : max;
    }, 0);

    if (maxCreatedNumber === 0) {
      return;
    }

    const counterPath = resolve(project.memoryBankPath, "Features", "NEXT_FEATURE_ID.txt");
    const nextFromCounter = readPositiveIntegerFile(counterPath);
    const nextNumber = Math.max(nextFromCounter ?? 1, maxCreatedNumber + 1);

    writeCounter(counterPath, nextNumber);
  }

  nextEpic(project: StoredProject) {
    const counterPath = resolve(project.memoryBankPath, "Features", "00_EPICS", "NEXT_EPIC_ID.txt");
    const nextFromCounter = readPositiveIntegerFile(counterPath);
    const nextFromFolders = getNextWorkItemNumber(project, "EPIC");
    const nextNumber = Math.max(nextFromCounter ?? 1, nextFromFolders);

    writeCounter(counterPath, nextNumber + 1);

    return formatWorkItemId("EPIC", nextNumber);
  }
}

export function readPositiveIntegerFile(path: string) {
  if (!existsSync(path)) {
    return null;
  }

  const value = Number.parseInt(readFileSync(path, "utf8").trim(), 10);

  return Number.isInteger(value) && value > 0 ? value : null;
}

function writeCounter(path: string, value: number) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${value}\n`, "utf8");
}

function formatWorkItemId(prefix: "EPIC" | "FEAT", value: number) {
  return `${prefix}-${String(value).padStart(3, "0")}`;
}
