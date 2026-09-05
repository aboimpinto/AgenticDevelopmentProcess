import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findProductionModuleSizeViolations,
  isProductionModuleFile,
  measureProductionModules,
} from "./production-module-size-policy.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("production module size policy", () => {
  it("recognizes production source extensions and excludes tests and declarations", () => {
    expect(isProductionModuleFile("owner.ts")).toBe(true);
    expect(isProductionModuleFile("view.tsx")).toBe(true);
    expect(isProductionModuleFile("runtime.mjs")).toBe(true);
    expect(isProductionModuleFile("owner.test.ts")).toBe(false);
    expect(isProductionModuleFile("view.spec.tsx")).toBe(false);
    expect(isProductionModuleFile("models/test-support/fixture.ts")).toBe(false);
    expect(isProductionModuleFile("models\\fixtures\\fixture.ts")).toBe(false);
    expect(isProductionModuleFile("contracts.d.ts")).toBe(false);
    expect(isProductionModuleFile("styles.css")).toBe(false);
  });

  it("measures nested production modules across application and package source roots", () => {
    const root = createWorkspace();
    writeSource(root, "apps/example/src/index.ts", "one\ntwo\n");
    writeSource(root, "apps/example/src/nested/view.tsx", "one");
    writeSource(root, "packages/example/src/index.test.ts", "ignored\nignored");
    writeSource(root, "packages/example/src/test-support/fixture.ts", "ignored\nignored");
    writeSource(root, "packages/example/src/contracts.ts", "one\ntwo\nthree");
    mkdirSync(join(root, "packages/without-source"), { recursive: true });

    expect(measureProductionModules(root)).toEqual([
      { path: "apps/example/src/index.ts", lines: 2 },
      { path: "apps/example/src/nested/view.tsx", lines: 1 },
      { path: "packages/example/src/contracts.ts", lines: 3 },
    ]);
  });

  it("returns only modules above the configured ceiling in descending size order", () => {
    expect(findProductionModuleSizeViolations([
      { path: "within.ts", lines: 1_000 },
      { path: "larger.ts", lines: 1_200 },
      { path: "large.ts", lines: 1_001 },
    ])).toEqual([
      { path: "larger.ts", lines: 1_200 },
      { path: "large.ts", lines: 1_001 },
    ]);
  });
});

function createWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "hepha-module-size-policy-"));
  temporaryRoots.push(root);
  mkdirSync(join(root, "apps/example/src"), { recursive: true });
  mkdirSync(join(root, "packages/example/src"), { recursive: true });
  return root;
}

function writeSource(root: string, relativePath: string, contents: string): void {
  const target = join(root, relativePath);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, contents, "utf8");
}
