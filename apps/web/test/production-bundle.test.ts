// @vitest-environment node
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";

type Chunk = {
  fileName: string;
  name: string;
  isEntry: boolean;
  modules: Record<string, unknown>;
  imports: string[];
  dynamicImports: string[];
};

function reachable(chunks: Chunk[], roots: string[], includeDynamic = false): Set<string> {
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const seen = new Set<string>();
  const pending = [...roots];
  while (pending.length > 0) {
    const name = pending.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const chunk = byName.get(name);
    if (chunk) pending.push(...chunk.imports, ...(includeDynamic ? chunk.dynamicImports : []));
  }
  return seen;
}

function containsPackage(chunk: Chunk, name: string): boolean {
  return Object.keys(chunk.modules).some((id) => id.replaceAll("\\", "/").includes(`/node_modules/${name}/`));
}

describe("production bundle boundaries", () => {
  let chunks: Chunk[];
  let initial: Set<string>;

  beforeAll(async () => {
    const root = fileURLToPath(new URL("../", import.meta.url));
    const result = await build({
      root,
      configFile: resolve(root, "vite.config.ts"),
      logLevel: "silent",
      build: { write: false },
    });
    chunks = [];
    for (const output of Array.isArray(result) ? result : [result]) {
      if (!("output" in output)) throw new Error("Expected a production build, not a watcher");
      for (const item of output.output) if (item.type === "chunk") chunks.push(item);
    }
    const entries = chunks.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName);
    expect(entries.length).toBeGreaterThan(0);
    initial = reachable(chunks, entries);
  }, 30_000);

  it("loads React and React DOM from the dedicated vendor chunk", () => {
    const vendor = chunks.find((chunk) => chunk.name === "react-vendor");
    expect(vendor).toBeDefined();
    expect(containsPackage(vendor!, "react")).toBe(true);
    expect(containsPackage(vendor!, "react-dom")).toBe(true);
    expect(initial.has(vendor!.fileName)).toBe(true);
  });

  it("keeps Mermaid reachable through a dynamic import outside the initial module graph", () => {
    const mermaid = chunks.filter((chunk) => containsPackage(chunk, "mermaid"));
    expect(mermaid.length).toBeGreaterThan(0);
    const withDynamic = reachable(chunks, [...initial], true);
    for (const chunk of mermaid) {
      expect(initial.has(chunk.fileName), chunk.fileName).toBe(false);
      expect(withDynamic.has(chunk.fileName), chunk.fileName).toBe(true);
    }
  });
});
