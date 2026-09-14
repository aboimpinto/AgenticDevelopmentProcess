import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { publishVerificationInventory } from "../src/manual-test-verification/verification-inventory-publication.js";
import { verificationInventoryCommands } from "../src/manual-test-verification/verification-inventory-contract.js";
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })));
function fixture(command = "node tools/check.cjs --all") {
  const root = mkdtempSync(join(tmpdir(), "inventory-")); roots.push(root);
  const folder = join(root, "feature"), directory = join(root, "run"); mkdirSync(folder); mkdirSync(directory);
  const description = join(folder, "FeatureDescription.md"), phase = join(folder, "phase-z.md");
  writeFileSync(description, "# Feature\n## Acceptance\nPreserve data.\n## TestPlan\n| Command |\n| --- |\n| `old-command --all` |\n## Human results\nPASS from original session\n");
  writeFileSync(phase, '# Phase Z\n**Status**: COMPLETED\n## Phase Gate Declarations\n```json\n{"needTestCoverage":true,"needCodeReview":false}\n```\n');
  const plan = { checks: [{ id: "records", kind: "test" as const, cwd: root, command, configurationFiles: ["runner.config"], testPaths: ["test/"], reason: "Current runner config selects all required records" }], phases: [{ phaseNumber: 31, checkIds: ["records"] }],
    inventoryReconciliation: JSON.parse(verificationInventoryCommands.encode({ replacements: [{ document: "FeatureDescription.md", checkId: "records", before: "old-command --all", after: command, reason: "Runner renamed in configured project scripts; same selection" }] })) };
  return { root, folder, directory, description, phase, plan, phases: [{ number: 31, documentPath: phase }] };
}
it.each(["node tools/check.cjs --all", "dotnet test Core.Tests.csproj --filter Group=Records", "cargo test --manifest-path native/Cargo.toml --locked", "./tools/verify --suite records"])("publishes %s without a technology-specific branch or edits to gates and results", command => {
  const f = fixture(command), before = readFileSync(f.phase, "utf8");
  expect(publishVerificationInventory(f)).toHaveLength(2);
  const doc = readFileSync(f.description, "utf8");
  expect(doc).not.toContain("old-command --all"); expect(doc).toContain('"command": ' + JSON.stringify(command));
  expect(doc).toContain("## Acceptance\nPreserve data."); expect(doc).toContain("## Human results\nPASS from original session");
  expect(readFileSync(f.phase, "utf8")).toContain(before);
  expect(readFileSync(f.phase, "utf8")).toContain("`records`");
  const audit = JSON.parse(readFileSync(join(f.directory, "inventory-command-reconciliation.json"), "utf8"));
  expect(audit.replacements[0].reason).toContain("same selection"); expect(audit.changes[0].before).toContain("old-command");
  delete f.plan.inventoryReconciliation;
  expect(publishVerificationInventory(f)).toEqual([]);
});
it("cannot replace acceptance text or publish a command not admitted by inspection", () => {
  const f = fixture(), before = readFileSync(f.description, "utf8");
  f.plan.inventoryReconciliation.payload.replacements[0].after = "true";
  expect(() => publishVerificationInventory(f)).toThrow("admitted check");
  expect(readFileSync(f.description, "utf8")).toBe(before);
  f.plan.inventoryReconciliation.payload.replacements[0].after = f.plan.checks[0]!.command;
  f.plan.inventoryReconciliation.payload.replacements[0].before = "Preserve data.";
  expect(() => publishVerificationInventory(f)).toThrow("command literal");
  expect(readFileSync(f.description, "utf8")).toBe(before);
});
it("validates every update before writing and rejects path escape", () => {
  const f = fixture(), before = readFileSync(f.description, "utf8");
  f.plan.inventoryReconciliation.payload.replacements.push({ ...f.plan.inventoryReconciliation.payload.replacements[0], document: "../source.ts" });
  expect(() => publishVerificationInventory(f)).toThrow("allowed document");
  expect(readFileSync(f.description, "utf8")).toBe(before);
});
it("rejects symlink document targets", () => {
  const f = fixture(); rmSync(f.phase); symlinkSync(f.description, f.phase);
  expect(() => publishVerificationInventory(f)).toThrow("regular feature-local");
});
it("creates missing inventories and keeps run-local reporter paths portable", () => {
  const f = fixture(); delete f.plan.inventoryReconciliation;
  writeFileSync(f.description, "# Feature\n## Acceptance\nPreserve data.\n");
  f.plan.checks[0]!.command += ` --report ${f.directory}/tests.json`;
  publishVerificationInventory(f);
  const doc = readFileSync(f.description, "utf8");
  expect(doc).toContain("## TestPlan"); expect(doc).toContain("${VERIFICATION_OUTPUT_DIR}/tests.json");
  expect(doc).not.toContain(f.directory); expect(doc).toContain('"cwd": ".."');
});
it("uses the published schema and treats optional audit metadata independently", () => {
  const payload = { replacements: [] };
  expect(verificationInventoryCommands.decode(verificationInventoryCommands.encode(payload)).valid).toBe(true);
  expect(verificationInventoryCommands.decode(JSON.stringify({ schemaVersion: "hepha-exchange/v1", kind: "verification.inventory.commands", payload, audit: { runId: "", testExecutionTimestamp: "unavailable" } })).valid).toBe(true);
  expect(verificationInventoryCommands.decode(JSON.stringify({ schemaVersion: "hepha-exchange/v1", kind: "verification.inventory.commands", payload: { replacements: [], waiveTests: true } })).valid).toBe(false);
});
