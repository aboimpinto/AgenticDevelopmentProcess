import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { discoverVerificationTargets } from "../src/manual-test-verification/configured-verification-targets.js";
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function project(config: string, command = "playwright test --config browser.qa.ts") {
  const root = mkdtempSync(join(tmpdir(), "configured-verification-")); roots.push(root);
  mkdirSync(join(root, "features", "checkout"), { recursive: true });
  writeFileSync(join(root, "features", "checkout", "save.feature"), "Feature: Save\n");
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { "verify:browser": command, deploy: "DO_NOT_EXPOSE_PRIVATE_VALUE" } }));
  writeFileSync(join(root, "browser.qa.ts"), config);
  return root;
}
const bdd = `import { defineConfig as configure } from '@playwright/test';
import { defineBddConfig as bdd } from 'playwright-bdd';
const testDir = bdd({ features: 'features/checkout', steps: ['steps/**/*.ts'] });
// features: 'features/wrong' must not be parsed as configuration.
export default configure({ testDir, webServer: { command: process.env.PRIVATE_SETUP } });`;

it("reads configured BDD paths and script identity without evaluating code or exposing unrelated settings", () => {
  const root = project(bdd), before = readFileSync(join(root, "browser.qa.ts"), "utf8");
  const catalog = discoverVerificationTargets(root);
  expect(catalog.targets).toHaveLength(1);
  expect(catalog.targets[0]).toMatchObject({ command: "npm run verify:browser", testPaths: ["features/checkout"], configurationFiles: ["package.json", "browser.qa.ts"] });
  expect(JSON.stringify(catalog)).not.toMatch(/DO_NOT_EXPOSE|PRIVATE_SETUP|features\/wrong/);
  expect(readFileSync(join(root, "browser.qa.ts"), "utf8")).toBe(before);
  expect(discoverVerificationTargets(root)).toEqual(catalog);
  writeFileSync(join(root, "browser.qa.ts"), bdd.replace("features/checkout", "features"));
  expect(discoverVerificationTargets(root).fingerprint).not.toBe(catalog.fingerprint);
});
it("supports a renamed static Playwright configuration and never hardcodes a feature or suite", () => {
  const root = project("import { defineConfig } from '@playwright/test'; export default defineConfig({ testDir: 'features/checkout' });", "playwright test --config=browser.qa.ts");
  expect(discoverVerificationTargets(root).targets[0]?.testPaths).toEqual(["features/checkout"]);
});
it("resolves test paths through unrelated conditional server settings without evaluating their condition", () => {
  const root = project(bdd.replace("webServer: { command: process.env.PRIVATE_SETUP }", "...(process.env.START_SERVER ? { webServer: { command: 'do not run' } } : {})"));
  expect(discoverVerificationTargets(root).targets[0]?.testPaths).toEqual(["features/checkout"]);
});
it.each(["dynamic", "spread", "outside", "symlink", "compound"])("does not invent targets for %s configuration", variant => {
  const root = project(variant === "dynamic" ? bdd.replace("'features/checkout'", "process.env.TEST_PATH")
    : variant === "spread" ? bdd.replace("{ testDir,", "{ ...other, testDir,")
    : variant === "outside" ? bdd.replace("'features/checkout'", "'../../outside'") : bdd,
  variant === "compound" ? "playwright test --config browser.qa.ts && echo PRIVATE_VALUE" : undefined);
  if (variant === "symlink") { rmSync(join(root, "browser.qa.ts")); symlinkSync(join(root, "package.json"), join(root, "browser.qa.ts")); }
  const catalog = discoverVerificationTargets(root);
  expect(catalog.targets).toEqual([]); expect(catalog.diagnostics.length).toBeGreaterThan(0);
  expect(JSON.stringify(catalog)).not.toContain("PRIVATE_VALUE");
});
