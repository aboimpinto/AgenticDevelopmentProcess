import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectRegistry } from "../src/projects/project-registry.js";
import { saveStoredProjects } from "../src/projects/project-store.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { force: true, recursive: true });
  }
  temporaryRoots.length = 0;
});

function temporaryRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-project-registry-"));
  temporaryRoots.push(root);
  return root;
}

function storedProject(id: string, rootPath: string): StoredProject {
  return {
    id,
    createdAt: "2026-07-20T10:00:00.000Z",
    memoryBankPath: resolve(rootPath, "MemoryBank"),
    name: id,
    rootPath,
    updatedAt: "2026-07-20T10:00:00.000Z",
  };
}

describe("project registry", () => {
  it("loads stored projects and exposes lookup without exposing its mutable map", () => {
    const root = temporaryRoot();
    const storePath = resolve(root, "state", "projects.json");
    const loaded = storedProject("loaded", resolve(root, "loaded"));
    saveStoredProjects(storePath, [loaded]);

    const registry = new ProjectRegistry({
      basePath: root,
      resolveStorePath: () => storePath,
    });

    expect(registry.get("loaded")).toEqual(loaded);
    expect(registry.get("missing")).toBeUndefined();
    expect(registry.list()).toEqual([loaded]);
    expect(registry.list()).not.toBe(registry.list());
  });

  it("registers and persists a canonical project with injected identity and time", () => {
    const root = temporaryRoot();
    const projectRoot = resolve(root, "project");
    const storePath = resolve(root, "state", "projects.json");
    mkdirSync(resolve(projectRoot, ".git"), { recursive: true });
    mkdirSync(resolve(projectRoot, "MemoryBank"), { recursive: true });
    const registry = new ProjectRegistry({
      basePath: root,
      createId: () => "project-created",
      now: () => "2026-07-20T11:00:00.000Z",
      resolveStorePath: () => storePath,
    });

    const created = registry.register({
      memoryBankPath: "MemoryBank",
      name: "  Created  ",
      rootPath: projectRoot,
    });

    expect(created).toEqual(expect.objectContaining({
      id: "project-created",
      createdAt: "2026-07-20T11:00:00.000Z",
      memoryBankPath: resolve(projectRoot, "MemoryBank"),
      name: "Created",
      rootPath: projectRoot,
      updatedAt: "2026-07-20T11:00:00.000Z",
    }));
    expect(JSON.parse(readFileSync(storePath, "utf8"))).toEqual([created]);
  });

  it("updates a matching canonical root while preserving identity and creation time", () => {
    const root = temporaryRoot();
    const projectRoot = resolve(root, "project");
    const storePath = resolve(root, "state", "projects.json");
    mkdirSync(resolve(projectRoot, ".git"), { recursive: true });
    mkdirSync(resolve(projectRoot, "MemoryBank"), { recursive: true });
    saveStoredProjects(storePath, [storedProject("existing", projectRoot)]);
    const registry = new ProjectRegistry({
      basePath: root,
      createId: () => "must-not-be-used",
      now: () => "2026-07-20T12:00:00.000Z",
      resolveStorePath: () => storePath,
    });

    const updated = registry.register({
      memoryBankPath: "MemoryBank",
      name: "Updated",
      rootPath: projectRoot,
    });

    expect(updated.id).toBe("existing");
    expect(updated.createdAt).toBe("2026-07-20T10:00:00.000Z");
    expect(updated.updatedAt).toBe("2026-07-20T12:00:00.000Z");
    expect(registry.list()).toHaveLength(1);
  });

  it("rejects a blank project name before mutating or persisting", () => {
    const root = temporaryRoot();
    const storePath = resolve(root, "state", "projects.json");
    const registry = new ProjectRegistry({
      basePath: root,
      resolveStorePath: () => storePath,
    });

    expect(() => registry.register({
      memoryBankPath: "MemoryBank",
      name: "  ",
      rootPath: root,
    })).toThrow("Project name is required");
    expect(registry.list()).toEqual([]);
  });
});
