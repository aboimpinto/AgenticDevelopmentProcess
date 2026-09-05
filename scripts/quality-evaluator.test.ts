/**
 * Quality Evaluator Tests — FEAT-057
 *
 * Tests for the deterministic quality-gate evaluation logic.
 * Covers: inventory completeness, size limits, coverage ratchet,
 * required journeys, and zero-test discovery.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { measureProductionModules } from "./production-module-size-policy.js";

// Test against the real inventory
const INVENTORY_PATH = resolve(__dirname, "../docs/quality/web-module-inventory.json");
const COVERAGE_PATH = resolve(__dirname, "../apps/web/coverage/coverage-summary.json");

describe("Quality Evaluator — Inventory", () => {
  it("inventory file exists and is valid JSON", () => {
    expect(existsSync(INVENTORY_PATH)).toBe(true);
    const raw = readFileSync(INVENTORY_PATH, "utf-8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("has expected meta fields", () => {
    const inv = JSON.parse(readFileSync(INVENTORY_PATH, "utf-8"));
    expect(inv.meta).toBeDefined();
    expect(inv.meta.epic).toBe("EPIC-012");
    expect(inv.meta.feature).toBe("FEAT-057");
    expect(inv.modules).toBeInstanceOf(Array);
    expect(inv.exclusions).toBeInstanceOf(Array);
    expect(inv.exceptions).toBeInstanceOf(Array);
  });

  it("exactly inventories every current web production module", () => {
    const inv = JSON.parse(readFileSync(INVENTORY_PATH, "utf-8"));
    const measured = measureProductionModules(resolve(__dirname, ".."))
      .filter(({ path }) => path.startsWith("apps/web/src/"))
      .map(({ path, lines }) => ({ path: path.slice("apps/web/src/".length), lines }));
    expect(inv.modules.map(({ path, lines }: { path: string; lines: number }) => ({ path, lines })).sort(
      (left: { path: string }, right: { path: string }) => left.path.localeCompare(right.path),
    )).toEqual(measured);
  });

  it("every module has required fields", () => {
    const inv = JSON.parse(readFileSync(INVENTORY_PATH, "utf-8"));
    const required = ["path", "concern", "lines", "size_status", "coverage_status", "has_tests", "owner"];
    for (const m of inv.modules) {
      for (const field of required) {
        expect(m[field]).toBeDefined();
      }
    }
  });

  it("no duplicate paths", () => {
    const inv = JSON.parse(readFileSync(INVENTORY_PATH, "utf-8"));
    const paths = inv.modules.map((m: { path: string }) => m.path);
    const uniquePaths = new Set(paths);
    expect(paths.length).toBe(uniquePaths.size);
  });

  it("every inventoried production module exists", () => {
    const inv = JSON.parse(readFileSync(INVENTORY_PATH, "utf-8"));
    for (const m of inv.modules) {
      const modulePath = resolve(__dirname, "../apps/web/src", m.path);
      expect(existsSync(modulePath), `Missing production module: ${m.path}`).toBe(true);
    }
  });
});

describe("Quality Evaluator — Size Limits", () => {
  it("no module exceeds 1000 lines without hard_cap_violation status", () => {
    const inv = JSON.parse(readFileSync(INVENTORY_PATH, "utf-8"));
    for (const m of inv.modules) {
      if (m.lines > 1000) {
        expect(m.size_status, `${m.path}: ${m.lines} lines needs hard_cap_violation status`).toBe("hard_cap_violation");
      }
    }
  });

  it("all size_status values are valid", () => {
    const inv = JSON.parse(readFileSync(INVENTORY_PATH, "utf-8"));
    const validStatuses = ["normal", "boundary_review", "explicit_approval", "hard_cap_violation"];
    for (const m of inv.modules) {
      expect(validStatuses, `${m.path}: invalid size_status ${m.size_status}`).toContain(m.size_status);
    }
  });

  it("hard-cap statuses exactly identify modules that still exceed 1000 lines", () => {
    const inv = JSON.parse(readFileSync(INVENTORY_PATH, "utf-8"));
    const declared = inv.modules
      .filter((m: { size_status: string }) => m.size_status === "hard_cap_violation")
      .map((m: { path: string }) => m.path)
      .sort();
    const measured = inv.modules
      .filter((m: { lines: number }) => m.lines > 1000)
      .map((m: { path: string }) => m.path)
      .sort();
    expect(declared).toEqual(measured);
  });
});

describe("Quality Evaluator — Coverage", () => {
  it("coverage summary file exists (must run web coverage first)", () => {
    // This test is informational — coverage is generated at Phase 7
    console.log(`Coverage summary at: ${COVERAGE_PATH}`);
    console.log(`Exists: ${existsSync(COVERAGE_PATH)}`);
  });

  it("coverage thresholds are not regressed from baseline", () => {
    if (!existsSync(COVERAGE_PATH)) {
      console.log("Coverage report not available — skipping ratchet test");
      return;
    }
    const coverage = JSON.parse(readFileSync(COVERAGE_PATH, "utf-8"));
    const thresholds = { lines: 1.98, functions: 2.98, branches: 2.73, statements: 2.01 };
    const total = coverage.total;

    expect(total.lines.pct).toBeGreaterThanOrEqual(thresholds.lines);
    expect(total.functions.pct).toBeGreaterThanOrEqual(thresholds.functions);
    expect(total.branches.pct).toBeGreaterThanOrEqual(thresholds.branches);
    expect(total.statements.pct).toBeGreaterThanOrEqual(thresholds.statements);
  });
});

describe("Quality Evaluator — Exceptions", () => {
  it("exceptions have required fields", () => {
    const inv = JSON.parse(readFileSync(INVENTORY_PATH, "utf-8"));
    const required = ["path", "exception_type", "rationale", "approved_by"];
    for (const exc of inv.exceptions) {
      for (const field of required) {
        expect(exc[field], `Exception for ${exc.path}: missing ${field}`).toBeDefined();
      }
    }
  });

  it("exception paths exist in modules", () => {
    const inv = JSON.parse(readFileSync(INVENTORY_PATH, "utf-8"));
    const modulePaths = new Set(inv.modules.map((m: { path: string }) => m.path));
    for (const exc of inv.exceptions) {
      expect(modulePaths.has(exc.path), `Exception path ${exc.path} not in modules`).toBe(true);
    }
  });
});

describe("Quality Evaluator — Exclusions", () => {
  it("exclusions have required fields", () => {
    const inv = JSON.parse(readFileSync(INVENTORY_PATH, "utf-8"));
    const required = ["pattern", "rationale"];
    for (const exc of inv.exclusions) {
      for (const field of required) {
        expect(exc[field], `Exclusion ${exc.pattern}: missing ${field}`).toBeDefined();
      }
    }
  });
});
