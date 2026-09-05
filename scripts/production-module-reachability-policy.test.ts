import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  analyzeProductionModuleReachability,
  discoverProductionModules,
  discoverProductionRoots,
  extractModuleSpecifiers,
  findUnreachableProductionModules,
  isReachabilityProductionFile,
  resolveProductionDependency,
} from "./production-module-reachability-policy.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("production module reachability policy", () => {
  it("recognizes production source while excluding tests and declarations", () => {
    expect(isReachabilityProductionFile("owner.ts")).toBe(true);
    expect(isReachabilityProductionFile("view.tsx")).toBe(true);
    expect(isReachabilityProductionFile("runner.mjs")).toBe(true);
    expect(isReachabilityProductionFile("owner.test.ts")).toBe(false);
    expect(isReachabilityProductionFile("view.spec.tsx")).toBe(false);
    expect(isReachabilityProductionFile("models/test-support/fixture.ts")).toBe(false);
    expect(isReachabilityProductionFile("models\\fixtures\\fixture.ts")).toBe(false);
    expect(isReachabilityProductionFile("contract.d.ts")).toBe(false);
  });

  it("discovers application, package, config, and script modules with explicit entry roots", () => {
    const root = createWorkspace();
    writeSource(root, "apps/service/src/index.ts", "export {};\n");
    writeSource(root, "apps/service/src/worker.ts", "export {};\n");
    writeSource(root, "apps/client/src/main.tsx", "export {};\n");
    writeSource(root, "apps/client/vite.config.ts", "export {};\n");
    writeSource(root, "packages/contracts/src/index.ts", "export {};\n");
    writeSource(root, "packages/contracts/src/hidden.test.ts", "export {};\n");
    writeSource(root, "packages/contracts/src/test-support/fixture.ts", "export {};\n");
    writeSource(root, "scripts/quality.ts", "export {};\n");

    const modules = discoverProductionModules(root);
    expect(modules).toEqual([
      "apps/client/src/main.tsx",
      "apps/client/vite.config.ts",
      "apps/service/src/index.ts",
      "apps/service/src/worker.ts",
      "packages/contracts/src/index.ts",
      "scripts/quality.ts",
    ]);
    expect(discoverProductionRoots(root, modules)).toEqual([
      "apps/client/src/main.tsx",
      "apps/client/vite.config.ts",
      "apps/service/src/index.ts",
      "packages/contracts/src/index.ts",
      "scripts/quality.ts",
    ]);
  });

  it("extracts static, exported, dynamic, CommonJS, import-equals, and type-only dependencies", () => {
    expect(extractModuleSpecifiers("owner.ts", [
      'import "./static.js";',
      'export * from "./exported.js";',
      'const dynamic = import("./dynamic.js");',
      'const common = require("./common.js");',
      'import legacy = require("./legacy.js");',
      'type Contract = import("@scope/contracts").Contract;',
    ].join("\n"))).toEqual([
      "./common.js",
      "./dynamic.js",
      "./exported.js",
      "./legacy.js",
      "./static.js",
      "@scope/contracts",
    ]);
  });

  it("resolves emitted JavaScript specifiers, directory indexes, and workspace package subpaths", () => {
    const modules = new Set([
      "apps/service/src/local.ts",
      "apps/service/src/nested/index.ts",
      "packages/contracts/src/index.ts",
      "packages/contracts/src/models/item.ts",
    ]);
    const input = {
      modulePath: "apps/service/src/index.ts",
      modules,
      packageSourceRoots: new Map([["@scope/contracts", "packages/contracts/src"]]),
      workspaceRoot: "/workspace",
    };

    expect(resolveProductionDependency({ ...input, specifier: "./local.js" }))
      .toBe("apps/service/src/local.ts");
    expect(resolveProductionDependency({ ...input, specifier: "./nested" }))
      .toBe("apps/service/src/nested/index.ts");
    expect(resolveProductionDependency({ ...input, specifier: "@scope/contracts" }))
      .toBe("packages/contracts/src/index.ts");
    expect(resolveProductionDependency({ ...input, specifier: "@scope/contracts/models/item.js" }))
      .toBe("packages/contracts/src/models/item.ts");
    expect(resolveProductionDependency({ ...input, specifier: "node:fs" })).toBeNull();
  });

  it("traces every dependency form from generic roots and reports only disconnected modules", () => {
    const root = createWorkspace();
    writeManifest(root, "apps/service", "@scope/service");
    writeManifest(root, "packages/contracts", "@scope/contracts");
    writeSource(root, "apps/service/src/index.ts", [
      'import "./static.js";',
      'void import("./dynamic.js");',
      'require("./common.js");',
      'type Contract = import("@scope/contracts").Contract;',
    ].join("\n"));
    writeSource(root, "apps/service/src/static.ts", 'export * from "./nested/index.js";\n');
    writeSource(root, "apps/service/src/nested/index.ts", "export {};\n");
    writeSource(root, "apps/service/src/dynamic.ts", "export {};\n");
    writeSource(root, "apps/service/src/common.ts", "export {};\n");
    writeSource(root, "apps/service/src/disconnected.ts", "export {};\n");
    writeSource(root, "packages/contracts/src/index.ts", 'export * from "./model.js";\n');
    writeSource(root, "packages/contracts/src/model.ts", "export interface Contract {}\n");

    const analysis = analyzeProductionModuleReachability(root);
    expect(analysis.roots).toEqual([
      "apps/service/src/index.ts",
      "packages/contracts/src/index.ts",
    ]);
    expect(analysis.dependencies["apps/service/src/index.ts"]).toEqual([
      "apps/service/src/common.ts",
      "apps/service/src/dynamic.ts",
      "apps/service/src/static.ts",
      "packages/contracts/src/index.ts",
    ]);
    expect(analysis.unreachable).toEqual(["apps/service/src/disconnected.ts"]);
    expect(findUnreachableProductionModules(root)).toEqual(["apps/service/src/disconnected.ts"]);
  });
});

function createWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "hepha-module-reachability-"));
  temporaryRoots.push(root);
  return root;
}

function writeManifest(root: string, relativeRoot: string, name: string): void {
  writeSource(root, `${relativeRoot}/package.json`, `${JSON.stringify({ name })}\n`);
}

function writeSource(root: string, relativePath: string, contents: string): void {
  const target = join(root, relativePath);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, contents, "utf8");
}
