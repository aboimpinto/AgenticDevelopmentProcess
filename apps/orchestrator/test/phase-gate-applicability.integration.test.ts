import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { scanMemoryBankFolders } from "../src/memorybank-scanner.js";
import { countMissingPhaseQualityGates } from "../src/workflows/phases/phase-quality-evidence-policy.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
const scenarios = readFileSync(new URL("./phase-gate-applicability.feature", import.meta.url), "utf8");

it.each([
  ["Documentation output does not manufacture code verification obligations", false, 0],
  ["Declared applicability is independent of source-file presence", true, 0],
] as const)("%s", (scenario, codeChanged, expectedGaps) => {
  expect(scenarios).toContain(`Scenario: ${scenario}`);
  const root = mkdtempSync(resolve(tmpdir(), "hepha-applicability-integration-")); roots.push(root);
  const memoryBankPath = resolve(root, "MemoryBank");
  const folder = resolve(memoryBankPath, "Features/03_IN_PROGRESS/FEAT-901-example");
  mkdirSync(resolve(folder, "Phases"), { recursive: true });
  writeFileSync(resolve(folder, "FeatureDescription.md"), "# Example\n**Status**: IN_PROGRESS\n");
  writeFileSync(resolve(folder, "Phases/phase-3-planning.md"), [
    "# Phase 3: Planning", "**Status**: COMPLETED", "## Changed Files",
    codeChanged ? "- `packages/service.ts`" : "- `docs/plan.md`",
    "## Quality Checkpoint", "### Test Verification", "Not applicable: documentation only.",
    "### Code Review", "Not required: documentation only.",
    "### Preservation", "No unrelated change was modified (`generated.d.ts` preserved untouched).",
  ].join("\n"));
  const project = { id: "synthetic", name: "Example", rootPath: root, memoryBankPath, createdAt: "", updatedAt: "" };
  const [item] = scanMemoryBankFolders(project, ["03_IN_PROGRESS"], { "03_IN_PROGRESS": "In Progress" } as never);
  expect(item).toBeDefined();
  expect(countMissingPhaseQualityGates(item!.card)).toBe(expectedGaps);
  const phase = item!.card.implementationEvidence?.phaseQualityGates[0];
  expect(phase?.codeFiles).not.toContain("generated.d.ts");
  expect(phase?.gates.find(g => g.gate === "code_review")?.justification).toContain("documentation only");
});

it("Explicit boolean declarations survive repair evidence and advisory health findings", () => {
  expect(scenarios).toContain("Scenario: Explicit boolean declarations survive repair evidence and advisory health findings");
  const root = mkdtempSync(resolve(tmpdir(), "hepha-declared-health-")); roots.push(root);
  const memoryBankPath = resolve(root, "MemoryBank");
  const folder = resolve(memoryBankPath, "Features/03_IN_PROGRESS/FEAT-923-portable");
  mkdirSync(resolve(folder, "Phases"), { recursive: true });
  writeFileSync(resolve(folder, "FeatureDescription.md"), "# Portable delivery\n**Status**: IN_PROGRESS\n");
  writeFileSync(resolve(folder, "Phases/phase-19-delivery.md"), [
    "# Phase 19: Delivery", "**Status**: COMPLETED", "## Phase Gate Declarations", "```json",
    '{"needTestCoverage":false,"needCodeReview":false}', "```", "**Scope justification:** No new behavior or review scope.",
    "## Phase Checkpoint", "| Check | Command | Result |", "| --- | --- | --- |",
    "| Build | compiler build | Unknown historical output |", "| Lint | analyzer lint | FAIL — exit 1 |",
    "### Test Verification", "Required: execute existing regression checks.",
  ].join("\n"));
  const project = { id: "synthetic", name: "Portable", rootPath: root, memoryBankPath, createdAt: "", updatedAt: "" };
  const [item] = scanMemoryBankFolders(project, ["03_IN_PROGRESS"], { "03_IN_PROGRESS": "In Progress" } as never);
  expect(countMissingPhaseQualityGates(item!.card)).toBe(0);
  const phase = item!.card.implementationEvidence!.phaseQualityGates[0]!;
  expect(phase.warnings).toHaveLength(2);
  expect(phase.gates.find(g => g.gate === "build")?.status).toBe("unknown");
  expect(phase.gates.find(g => g.gate === "lint")?.status).toBe("missing");
  expect(phase.gates.filter(g => ["tests", "code_review"].includes(g.gate)).map(g => g.status)).toEqual(["not_applicable", "not_applicable"]);
});

it.each(["APPROVED", "NEEDS_CHANGES"])("Required review flags defer to the persisted review verdict: %s", verdict => {
  expect(scenarios).toContain("Scenario: Required review flags defer to the persisted review verdict");
  const root = mkdtempSync(resolve(tmpdir(), "hepha-declared-review-")); roots.push(root);
  const memoryBankPath = resolve(root, "MemoryBank");
  const folder = resolve(memoryBankPath, "Features/03_IN_PROGRESS/FEAT-944-interface");
  mkdirSync(resolve(folder, "Phases"), { recursive: true });
  mkdirSync(resolve(folder, "code-reviews/phase-29"), { recursive: true });
  writeFileSync(resolve(folder, "FeatureDescription.md"), "# Interface\n**Status**: IN_PROGRESS\n");
  writeFileSync(resolve(folder, "Phases/phase-29-interface.md"), '# Phase 29: Interface\n**Status**: COMPLETED\n## Phase Gate Declarations\n```json\n{"needTestCoverage":false,"needCodeReview":true}\n```\n**Scope justification:** Interface inspection with no behavioral change.\n### Code Review\nRequired: inspect the declared interface.\n');
  writeFileSync(resolve(folder, "code-reviews/phase-29/Code-Review-2031-01-01.md"), `# Phase Code Review Report\n**Phase**: Phase 29 - Interface\n**Status**: ${verdict}\n`);
  const project = { id: "synthetic", name: "Interface", rootPath: root, memoryBankPath, createdAt: "", updatedAt: "" };
  const [item] = scanMemoryBankFolders(project, ["03_IN_PROGRESS"], { "03_IN_PROGRESS": "In Progress" } as never);
  const gate = item!.card.implementationEvidence!.phaseQualityGates[0]!.gates.find(g => g.gate === "code_review");
  expect(gate?.status).toBe(verdict === "APPROVED" ? "satisfied" : "missing");
  expect(gate?.evidencePaths.some(p => p.includes("Code-Review-2031-01-01.md"))).toBe(true);
  expect(countMissingPhaseQualityGates(item!.card)).toBe(verdict === "APPROVED" ? 0 : 1);
});
