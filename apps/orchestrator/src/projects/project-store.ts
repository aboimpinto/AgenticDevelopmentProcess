import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isStoredProject, type StoredProject } from "./stored-project.js";

export function loadStoredProjects(storePath: string): StoredProject[] {
  if (!existsSync(storePath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8")) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isStoredProject) : [];
  } catch {
    return [];
  }
}

export function saveStoredProjects(
  storePath: string,
  projects: Iterable<StoredProject>,
): void {
  mkdirSync(dirname(storePath), { recursive: true });
  writeFileSync(storePath, JSON.stringify([...projects], null, 2), "utf8");
}
