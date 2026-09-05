import { readFileSync, readdirSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../src", import.meta.url));
const compositionRootPath = resolve(sourceRoot, "index.ts");

function collectTypeScriptSources(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(folder, entry.name);
    if (entry.isDirectory()) {
      return collectTypeScriptSources(path);
    }
    return extname(entry.name) === ".ts" ? [readFileSync(path, "utf8")] : [];
  });
}

function findDefinitionOnlyFunctions(compositionRoot: string, productionSources: string[]): string[] {
  const declarations = [
    ...compositionRoot.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm),
  ].map((match) => match[1]);
  const productionText = productionSources.join("\n");

  return declarations.filter((name) => {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return [...productionText.matchAll(new RegExp(`\\b${escapedName}\\b`, "g"))].length <= 1;
  });
}

describe("orchestrator production caller audit", () => {
  it("does not retain composition-root functions referenced only by their declaration", () => {
    const compositionRoot = readFileSync(compositionRootPath, "utf8");
    const productionSources = collectTypeScriptSources(sourceRoot);

    expect(findDefinitionOnlyFunctions(compositionRoot, productionSources)).toEqual([]);
  });
});
