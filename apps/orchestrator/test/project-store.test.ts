import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadStoredProjects, saveStoredProjects } from "../src/projects/project-store.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { force: true, recursive: true });
  }
  temporaryRoots.length = 0;
});

function temporaryPath(name: string): string {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-project-store-"));
  temporaryRoots.push(root);
  return resolve(root, name);
}

function project(id: string): StoredProject {
  return {
    id,
    createdAt: "2026-07-20T10:00:00.000Z",
    memoryBankPath: `/projects/${id}/MemoryBank`,
    name: id,
    rootPath: `/projects/${id}`,
    updatedAt: "2026-07-20T10:00:00.000Z",
  };
}

describe("project store", () => {
  it("returns no projects when the configured store does not exist", () => {
    expect(loadStoredProjects(temporaryPath("missing/projects.json"))).toEqual([]);
  });

  it("ignores an invalid document and malformed records", () => {
    const malformedJsonPath = temporaryPath("malformed.json");
    writeFileSync(malformedJsonPath, "{", "utf8");
    expect(loadStoredProjects(malformedJsonPath)).toEqual([]);

    const mixedPath = temporaryPath("mixed.json");
    writeFileSync(mixedPath, JSON.stringify([project("valid"), { id: "invalid" }]), "utf8");
    expect(loadStoredProjects(mixedPath)).toEqual([project("valid")]);
  });

  it("creates the parent directory and round-trips the configured store", () => {
    const storePath = temporaryPath("nested/state/projects.json");
    const projects = [project("first"), project("second")];

    saveStoredProjects(storePath, projects);

    expect(loadStoredProjects(storePath)).toEqual(projects);
    expect(JSON.parse(readFileSync(storePath, "utf8"))).toEqual(projects);
  });

  it("does not read a neighboring default store when another path is configured", () => {
    const root = temporaryPath("paths");
    mkdirSync(root, { recursive: true });
    const configuredPath = resolve(root, "configured.json");
    const neighboringPath = resolve(root, "projects.json");
    writeFileSync(configuredPath, JSON.stringify([project("configured")]), "utf8");
    writeFileSync(neighboringPath, JSON.stringify([project("neighbor")]), "utf8");

    expect(loadStoredProjects(configuredPath)).toEqual([project("configured")]);
  });
});
