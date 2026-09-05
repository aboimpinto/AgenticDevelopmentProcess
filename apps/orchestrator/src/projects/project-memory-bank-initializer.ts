import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { MemoryBankStateFolder } from "@hepha/shared";
import type { StoredProject } from "./stored-project.js";

const stateFolders: MemoryBankStateFolder[] = [
  "00_EPICS",
  "01_SUBMITTED",
  "02_READY_TO_DEVELOP",
  "03_IN_PROGRESS",
  "04_COMPLETED",
  "05_CANCELLED",
];

const memoryBankDirectories = [
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
] as const;

export interface ProjectMemoryBankInitializationResult {
  createdDirectories: string[];
  createdFiles: string[];
}

export async function initializeProjectMemoryBank(
  project: StoredProject,
): Promise<ProjectMemoryBankInitializationResult> {
  const createdDirectories: string[] = [];

  for (const directory of memoryBankDirectories) {
    const targetPath = resolve(project.memoryBankPath, directory);
    const existedBefore = existsSync(targetPath);
    await mkdir(targetPath, { recursive: true });
    if (!existedBefore) createdDirectories.push(targetPath);
  }

  const createdFiles = initializeCounters(project);
  return { createdDirectories, createdFiles };
}

export function getNextWorkItemNumber(
  project: StoredProject,
  prefix: "EPIC" | "FEAT",
): number {
  const featuresRoot = resolve(project.memoryBankPath, "Features");
  const searchFolders = prefix === "EPIC"
    ? [resolve(featuresRoot, "00_EPICS")]
    : stateFolders
        .filter((stateFolder) => stateFolder !== "00_EPICS")
        .map((stateFolder) => resolve(featuresRoot, stateFolder));
  const pattern = new RegExp(`\\b${prefix}-(\\d+)\\b`, "i");
  let maxId = 0;

  for (const folder of searchFolders) {
    for (const entry of readDirectory(folder)) {
      const match = entry.match(pattern);
      if (match?.[1]) maxId = Math.max(maxId, Number.parseInt(match[1], 10));
    }
  }

  return maxId + 1;
}

function initializeCounters(project: StoredProject): string[] {
  const counterPaths: Array<[string, "EPIC" | "FEAT"]> = [
    [resolve(project.memoryBankPath, "Features", "00_EPICS", "NEXT_EPIC_ID.txt"), "EPIC"],
    [resolve(project.memoryBankPath, "Features", "NEXT_FEATURE_ID.txt"), "FEAT"],
  ];

  return counterPaths.flatMap(([path, prefix]) =>
    createCounterFileIfMissing(path, getNextWorkItemNumber(project, prefix)) ? [path] : [],
  );
}

function createCounterFileIfMissing(path: string, value: number): boolean {
  if (existsSync(path)) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${value}\n`, "utf8");
  return true;
}

function readDirectory(path: string): string[] {
  try {
    return existsSync(path) ? readdirSync(path) : [];
  } catch {
    return [];
  }
}
