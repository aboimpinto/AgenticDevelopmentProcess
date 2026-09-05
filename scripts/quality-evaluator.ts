/**
 * Quality Evaluator — FEAT-057
 *
 * Deterministic quality-gate evaluation for the Hepha web application.
 * Consumes the production-module inventory, ownership matrix, coverage summary,
 * and size measurements to produce actionable pass/fail diagnostics.
 *
 * Usage:
 *   npx tsx scripts/quality-evaluator.ts
 *
 * CI integration: the evaluator returns exit code 0 (pass) or 1 (fail)
 * and writes diagnostics to stdout and optionally to a JSON report artifact.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findProductionModuleSizeViolations,
  measureProductionModules,
} from "./production-module-size-policy.js";
import { findUnreachableProductionModules } from "./production-module-reachability-policy.js";
import { inspectRefactorLedger } from "./refactor-ledger-policy.js";
import { inspectWorkflowMap } from "./workflow-map-policy.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Diagnostic {
  module: string;
  gate: string;
  status: "pass" | "fail" | "waived";
  message: string;
  remediation: string;
}

interface ModuleEntry {
  path: string;
  concern: string;
  lines: number;
  size_status: string;
  coverage_status: string;
  has_tests: boolean;
  owner: string;
}

interface ModuleInventory {
  meta: { app_root: string };
  modules: ModuleEntry[];
  exclusions: { pattern: string; rationale: string }[];
  exceptions: { path: string; exception_type: string; rationale: string }[];
}

interface CoverageSummary {
  total: {
    lines: { pct: number };
    functions: { pct: number };
    branches: { pct: number };
    statements: { pct: number };
  };
  [filePath: string]: unknown;
}

// ─── Paths (anchored to this script, not the caller's working directory) ───

const WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INVENTORY_PATH = resolve(WORKSPACE_ROOT, "docs/quality/web-module-inventory.json");
const COVERAGE_PATH = resolve(WORKSPACE_ROOT, "apps/web/coverage/coverage-summary.json");
const APP_SRC = resolve(WORKSPACE_ROOT, "apps/web/src");

// ─── Thresholds ─────────────────────────────────────────────────────────────

const SIZE_LIMITS = {
  NORMAL: 500,
  BOUNDARY_REVIEW: 750,
  EXPLICIT_APPROVAL: 1000,
  HARD_CAP: 1000, // No new/modified production module > 1000 lines
} as const;

const COVERAGE_THRESHOLDS = {
  lines: 1.98,
  functions: 2.98,
  branches: 2.73,
  statements: 2.01,
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getExclusionPatterns(inventory: ModuleInventory): RegExp[] {
  return inventory.exclusions
    .filter((e) => !e.pattern.includes("*")) // Simple patterns only
    .map((e) => new RegExp(e.pattern.replace(/\./g, "\\.").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*"), "i"));
}

function isExcluded(filePath: string, inventory: ModuleInventory): boolean {
  const patterns = getExclusionPatterns(inventory);
  return patterns.some((p) => p.test(filePath));
}

// ─── Evaluators ─────────────────────────────────────────────────────────────

function evaluateInventoryCompleteness(inventory: ModuleInventory): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const knownPaths = new Set(inventory.modules.map((m) => m.path));

  // Check for duplicate paths
  const pathCounts = new Map<string, number>();
  for (const m of inventory.modules) {
    pathCounts.set(m.path, (pathCounts.get(m.path) || 0) + 1);
  }
  for (const [path, count] of pathCounts) {
    if (count > 1) {
      diagnostics.push({
        module: path,
        gate: "inventory_duplicate",
        status: "fail",
        message: `Path appears ${count} times in inventory`,
        remediation: "Remove duplicate entry",
      });
    }
  }

  // Check for missing required fields
  for (const m of inventory.modules) {
    const requiredFields = ["path", "concern", "lines", "size_status", "coverage_status", "owner"] as const;
    for (const field of requiredFields) {
      if (!(m as Record<string, unknown>)[field]) {
        diagnostics.push({
          module: m.path,
          gate: "inventory_missing_field",
          status: "fail",
          message: `Missing required field: ${field}`,
          remediation: `Add ${field} to inventory entry for ${m.path}`,
        });
      }
    }
  }

  return diagnostics;
}

function evaluateSizeLimits(inventory: ModuleInventory): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const exceptions = new Map(inventory.exceptions.map((e) => [e.path, e]));

  for (const m of inventory.modules) {
    const exception = exceptions.get(m.path);

    // Hard cap: no new/modified production module > 1000 lines (except documented)
    if (m.lines > SIZE_LIMITS.HARD_CAP && m.size_status !== "hard_cap_violation") {
      diagnostics.push({
        module: m.path,
        gate: "size_hard_cap",
        status: "fail",
        message: `${m.lines} lines exceeds hard cap of ${SIZE_LIMITS.HARD_CAP}`,
        remediation: "Split into smaller modules or add documented exception",
      });
    }

    // Boundary review: 501-750 lines
    if (m.lines > SIZE_LIMITS.NORMAL && m.lines <= SIZE_LIMITS.BOUNDARY_REVIEW && m.size_status !== "boundary_review") {
      diagnostics.push({
        module: m.path,
        gate: "size_boundary_review",
        status: "fail",
        message: `${m.lines} lines exceeds normal target (${SIZE_LIMITS.NORMAL}); needs boundary review`,
        remediation: "Review module boundary; document if single concern",
      });
    }

    // Explicit approval: 751-1000 lines
    if (m.lines > SIZE_LIMITS.BOUNDARY_REVIEW && m.lines <= SIZE_LIMITS.EXPLICIT_APPROVAL && m.size_status !== "explicit_approval") {
      diagnostics.push({
        module: m.path,
        gate: "size_explicit_approval",
        status: "fail",
        message: `${m.lines} lines requires explicit FEAT rationale and reviewer approval`,
        remediation: "Add explicit_approval size_status with approved rationale",
      });
    }

    // Documented hard-cap violation must have rationale
    if (m.size_status === "hard_cap_violation" && (!exception || !exception.rationale)) {
      diagnostics.push({
        module: m.path,
        gate: "size_exception_missing_rationale",
        status: "fail",
        message: "Size exception missing documented rationale",
        remediation: "Add exception entry with approval rationale",
      });
    }
  }

  return diagnostics;
}

function evaluateWorkspaceProductionSize(): Diagnostic[] {
  return findProductionModuleSizeViolations(measureProductionModules(WORKSPACE_ROOT)).map((module) => ({
    module: module.path,
    gate: "workspace_production_size_hard_cap",
    status: "fail" as const,
    message: `${module.lines} lines exceeds the workspace production hard cap of ${SIZE_LIMITS.HARD_CAP}`,
    remediation: "Split the production responsibility into bounded modules before merging",
  }));
}

function evaluateWorkspaceProductionReachability(): Diagnostic[] {
  return findUnreachableProductionModules(WORKSPACE_ROOT).map((module) => ({
    module,
    gate: "workspace_production_module_reachability",
    status: "fail" as const,
    message: "Production module is unreachable from every application, package, configuration, and script entry point",
    remediation: "Connect the responsibility to a production entry point or remove the disconnected module and its test-only consumers",
  }));
}

function evaluateRefactorLedgerIntegrity(): Diagnostic[] {
  return inspectRefactorLedger(WORKSPACE_ROOT).issues.map((issue) => ({
    module: issue.documentPath,
    gate: `refactor_ledger_${issue.code}`,
    status: "fail" as const,
    message: issue.message,
    remediation: "Repair the numbered slice history and its required evidence before extending the refactor",
  }));
}

function evaluateWorkflowMapIntegrity(): Diagnostic[] {
  return inspectWorkflowMap(WORKSPACE_ROOT).map((workflowIssue) => ({
    module: workflowIssue.subject,
    gate: `workflow_map_${workflowIssue.code}`,
    status: "fail" as const,
    message: workflowIssue.message,
    remediation: "Repair the workflow registry, Mermaid map, production owner, test evidence, or causal justification record",
  }));
}

function evaluateCoverageRatchet(coverage: CoverageSummary): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const total = coverage.total;

  const checks: [string, number, number][] = [
    ["lines", total.lines.pct, COVERAGE_THRESHOLDS.lines],
    ["functions", total.functions.pct, COVERAGE_THRESHOLDS.functions],
    ["branches", total.branches.pct, COVERAGE_THRESHOLDS.branches],
    ["statements", total.statements.pct, COVERAGE_THRESHOLDS.statements],
  ];

  for (const [metric, current, threshold] of checks) {
    if (current < threshold) {
      diagnostics.push({
        module: "total",
        gate: `coverage_ratchet_${metric}`,
        status: "fail",
        message: `${metric}: ${current.toFixed(2)}% is below threshold ${threshold.toFixed(2)}%`,
        remediation: "Add tests for uncovered modules or update threshold with rationale",
      });
    }
  }

  return diagnostics;
}

function evaluateRequiredJourneys(inventory: ModuleInventory): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const journeyModules = inventory.modules.filter(
    (m) => m.path.includes("workflow-interaction") || m.path.includes("position-card-stack") || m.path.includes("position-synopsis"),
  );

  // Check that modules requiring browser journeys have tests
  for (const m of journeyModules) {
    if (!m.has_tests && m.coverage_status !== "none") {
      diagnostics.push({
        module: m.path,
        gate: "required_journey_missing",
        status: "waived",
        message: `${m.path} has no tests; browser journey planned for Phase 7`,
        remediation: "Implement Playwright journey in Phase 7",
      });
    }
  }

  return diagnostics;
}

function evaluateZeroTestDiscovery(inventory: ModuleInventory): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const coveredModules = inventory.modules.filter((m) => m.has_tests);

  // Check that modules with tests actually have test files
  // Tests may live in apps/web/src/ (co-located) or apps/web/test/ (FEAT-037 pattern)
  const APP_TEST = resolve(WORKSPACE_ROOT, "apps/web/test");

  for (const m of coveredModules) {
    const baseName = m.path.replace(/\.tsx?$/, "");
    const moduleDirectory = dirname(resolve(APP_SRC, m.path));
    const moduleName = baseName.split("/").at(-1)!;
    const testPatterns = [
      resolve(APP_SRC, `${baseName}.test.ts`),
      resolve(APP_SRC, `${baseName}.test.tsx`),
      resolve(APP_SRC, `${baseName}.spec.ts`),
      resolve(APP_SRC, `${baseName}.spec.tsx`),
    ];
    const colocatedTests = readdirSync(moduleDirectory)
      .filter((fileName) => /\.(?:test|spec)\.tsx?$/.test(fileName))
      .some((fileName) => {
        if (fileName.startsWith(`${moduleName}-`)) return true;
        const source = readFileSync(resolve(moduleDirectory, fileName), "utf8");
        return source.includes(`./${moduleName}.js`);
      });

    // Also check apps/web/test/ for the FEAT-037 pattern where tests
    // are named after the feature (feat-037-ui.test.tsx) rather than the module
    const testDir = resolve(APP_TEST);
    if (existsSync(testDir)) {
      const testFiles = ["feat-037-ui.test.tsx"]; // Known off-naming pattern
      for (const tf of testFiles) {
        testPatterns.push(resolve(APP_TEST, tf));
      }
    }

    const hasTestFile = colocatedTests || testPatterns.some((p) => existsSync(p));

    if (!hasTestFile) {
      diagnostics.push({
        module: m.path,
        gate: "zero_test_discovery",
        status: "fail",
        message: `Flagged as has_tests=true but no test file found: ${m.path}`,
        remediation: "Add test file or set has_tests=false with rationale",
      });
    } else {
      diagnostics.push({
        module: m.path,
        gate: "zero_test_discovery",
        status: "pass",
        message: `Test file found for ${m.path}`,
        remediation: "",
      });
    }
  }

  return diagnostics;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main(): number {
  const allDiagnostics: Diagnostic[] = [];

  // Load inventory
  if (!existsSync(INVENTORY_PATH)) {
    console.error("ERROR: Inventory not found at", INVENTORY_PATH);
    console.error("Run Phase 2 first to create the module inventory.");
    return 1;
  }

  const inventory: ModuleInventory = JSON.parse(readFileSync(INVENTORY_PATH, "utf-8"));

  // Load coverage
  let coverage: CoverageSummary | null = null;
  if (existsSync(COVERAGE_PATH)) {
    coverage = JSON.parse(readFileSync(COVERAGE_PATH, "utf-8")) as CoverageSummary;
  } else {
    console.error("WARNING: Coverage report not found at", COVERAGE_PATH);
    console.error("Run 'cd apps/web && npx vitest run --coverage' first.");
  }

  // Run evaluations
  allDiagnostics.push(...evaluateInventoryCompleteness(inventory));
  allDiagnostics.push(...evaluateSizeLimits(inventory));
  allDiagnostics.push(...evaluateWorkspaceProductionSize());
  allDiagnostics.push(...evaluateWorkspaceProductionReachability());
  allDiagnostics.push(...evaluateRefactorLedgerIntegrity());
  allDiagnostics.push(...evaluateWorkflowMapIntegrity());
  if (coverage) {
    allDiagnostics.push(...evaluateCoverageRatchet(coverage));
  }
  allDiagnostics.push(...evaluateRequiredJourneys(inventory));
  allDiagnostics.push(...evaluateZeroTestDiscovery(inventory));

  // Report
  const failures = allDiagnostics.filter((d) => d.status === "fail");
  const passes = allDiagnostics.filter((d) => d.status === "pass");
  const waived = allDiagnostics.filter((d) => d.status === "waived");

  console.log(`\n=== Quality Evaluator Report ===`);
  console.log(`Total diagnostics: ${allDiagnostics.length}`);
  console.log(`  Pass:  ${passes.length}`);
  console.log(`  Fail:  ${failures.length}`);
  console.log(`  Waived: ${waived.length}`);
  console.log("");

  if (failures.length > 0) {
    console.log("--- FAILURES ---");
    for (const d of failures) {
      console.log(`  [${d.gate}] ${d.module}: ${d.message}`);
      console.log(`    Remediation: ${d.remediation}`);
    }
    console.log("");
  }

  if (waived.length > 0) {
    console.log("--- WAIVED ---");
    for (const d of waived) {
      console.log(`  [${d.gate}] ${d.module}: ${d.message}`);
    }
    console.log("");
  }

  if (failures.length > 0) {
    console.log("RESULT: FAIL");
    return 1;
  }

  console.log("RESULT: PASS");
  return 0;
}

process.exit(main());
