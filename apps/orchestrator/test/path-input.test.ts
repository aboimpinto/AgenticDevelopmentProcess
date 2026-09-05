import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolvePathInput } from "../src/path-input.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const tempRoot of tempRoots) {
    rmSync(tempRoot, { force: true, recursive: true });
  }

  tempRoots.length = 0;
});

describe("resolvePathInput", () => {
  it("expands home-relative paths before resolving them", () => {
    const homeDirectory = createTempRoot();

    expect(resolvePathInput("~/myWork/project", { homeDirectory })).toBe(
      resolve(homeDirectory, "myWork/project"),
    );
  });

  it("keeps absolute paths independent from the process working directory", () => {
    const projectRoot = createTempRoot();

    expect(resolvePathInput(projectRoot, { basePath: resolve(projectRoot, "apps/orchestrator") })).toBe(
      projectRoot,
    );
  });

  it("resolves relative paths against the provided base path", () => {
    const projectRoot = createTempRoot();

    expect(resolvePathInput("MemoryBank", { basePath: projectRoot })).toBe(
      resolve(projectRoot, "MemoryBank"),
    );
  });

  it("does not resolve home-relative MemoryBank paths under the project root", () => {
    const homeDirectory = createTempRoot();
    const projectRoot = createTempRoot();

    expect(resolvePathInput("~/MemoryBank", { basePath: projectRoot, homeDirectory })).toBe(
      resolve(homeDirectory, "MemoryBank"),
    );
  });
});

function createTempRoot() {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-path-input-"));
  tempRoots.push(root);
  return root;
}
