import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import {
  createDevCycleMcpCompatibilityRequest,
  renderDevCycleMcpCompatibilityPrompt,
} from "../apps/orchestrator/src/workflows/recipes/devcycle-mcp-compatibility-request.js";

// Offline contract check against the installed gateway, not a replacement
// resolver. It neither connects to a server nor invokes an LLM or recipe.
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const adapterPath = resolve(repositoryRoot, process.env.HEPHA_MCP_ADAPTER_EXTENSION_PATH?.trim()
  || "../.pi/npm/node_modules/pi-mcp-adapter");
const manifest = JSON.parse(await readFile(resolve(adapterPath, "package.json"), "utf8"));
assert.equal(manifest.name, "pi-mcp-adapter");
const { getToolNameCandidates } = await import(pathToFileURL(resolve(adapterPath, "types.ts")).href);
assert.equal(typeof getToolNameCandidates, "function", "Installed adapter must expose its tool-name resolver");
const operations = [
  ["designFeature", "design-feature"], ["refineFeature", "refine-feature"],
  ["startImplementing", "start-feature"], ["continueImplementing", "continue-implementation"],
  ["completeFeature", "complete-feature"],
] as const;
let checked = 0;
for (const prefix of ["server", "short", "none", "mcp"]) {
  for (const [operation, originalName] of operations) {
    const prompt = renderDevCycleMcpCompatibilityPrompt(createDevCycleMcpCompatibilityRequest({
      autonomous: true, featureId: "FEAT-X", featurePath: "/memory/feature-x", operation,
    }));
    const invocation = prompt.match(/```js\n(mcp\([^\n]+\))\n```/)?.[1];
    assert.ok(invocation, "Prompt must contain the recipe invocation");
    let calls = 0;
    runInNewContext(invocation, {
      mcp: ({ server, tool }: { server: string; tool: string }) => {
        calls += 1;
        assert.equal(server, "devcycle-mcp");
        // getCandidateToolMatches in the installed proxy uses this same
        // exported candidate resolver for a server-scoped tool lookup.
        const matches = operations.filter(([, name]) => getToolNameCandidates(name, server, prefix).has(tool));
        assert.deepEqual(matches.map(([, name]) => name), [originalName]);
        assert.equal(tool, originalName, "HEPHA must preserve the original tool identity");
      },
    }, { timeout: 1000 });
    assert.equal(calls, 1);
    checked += 1;
  }
}
console.log(`PASS: ${checked} rendered invocations resolve uniquely with pi-mcp-adapter ${manifest.version}; no network or model calls.`);
