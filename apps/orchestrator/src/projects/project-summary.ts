import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { MemoryBankStateFolder, ProjectSummary } from "@hepha/shared";
import type { StoredProject } from "./stored-project.js";

const stateFolders: MemoryBankStateFolder[] = [
  "00_EPICS",
  "01_SUBMITTED",
  "02_READY_TO_DEVELOP",
  "03_IN_PROGRESS",
  "04_COMPLETED",
  "05_CANCELLED",
];

export function toProjectSummary(project: StoredProject): ProjectSummary {
  const featuresRoot = resolve(project.memoryBankPath, "Features");
  const featuresRootExists = existsSync(featuresRoot);

  return {
    id: project.id,
    counts: countWorkItems(project.memoryBankPath),
    createdAt: project.createdAt,
    defaultBranch: detectDefaultBranch(project.rootPath),
    detectedStack: detectProjectStack(project.rootPath),
    featuresRootExists,
    memoryBankPath: project.memoryBankPath,
    memoryBankRelativePath: relativeProjectPath(project.rootPath, project.memoryBankPath),
    name: project.name,
    needsInitialization: !featuresRootExists,
    originalMemoryBankPathInput: project.originalMemoryBankPathInput,
    originalRootPathInput: project.originalRootPathInput,
    rootPath: project.rootPath,
    updatedAt: project.updatedAt,
  };
}

export function detectProjectStack(rootPath: string): string[] {
  const stack: string[] = [];

  if (existsSync(resolve(rootPath, "package.json"))) stack.push("Node.js");
  if (existsSync(resolve(rootPath, "tsconfig.json"))) stack.push("TypeScript");
  if (hasAnyFile(rootPath, ["vite.config.ts", "vite.config.js"])) stack.push("Vite");
  if (hasAnyFile(rootPath, ["next.config.js", "next.config.mjs"])) stack.push("Next.js");
  if (existsSync(resolve(rootPath, "Cargo.toml"))) stack.push("Rust");
  if (readDirectory(rootPath).some((entry) => entry.endsWith(".sln") || entry.endsWith(".csproj"))) {
    stack.push(".NET");
  }

  return stack.length > 0 ? stack : ["Unknown"];
}

function countWorkItems(memoryBankPath: string): Record<MemoryBankStateFolder, number> {
  return Object.fromEntries(stateFolders.map((stateFolder) => {
    const folderPath = resolve(memoryBankPath, "Features", stateFolder);
    const count = readDirectory(folderPath)
      .filter((entry) => isDirectory(resolve(folderPath, entry)))
      .length;
    return [stateFolder, count];
  })) as Record<MemoryBankStateFolder, number>;
}

function detectDefaultBranch(rootPath: string): string {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      cwd: rootPath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }).trim() || "unknown";
  } catch {
    return "unknown";
  }
}

function hasAnyFile(rootPath: string, fileNames: string[]): boolean {
  return fileNames.some((fileName) => existsSync(resolve(rootPath, fileName)));
}

function readDirectory(path: string): string[] {
  try {
    return existsSync(path) ? readdirSync(path) : [];
  } catch {
    return [];
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function relativeProjectPath(rootPath: string, targetPath: string): string {
  const relativePath = relative(rootPath, targetPath);
  return relativePath && !relativePath.startsWith("..")
    ? relativePath.replaceAll("\\", "/")
    : targetPath;
}
