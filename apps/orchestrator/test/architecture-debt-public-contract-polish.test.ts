// Behavior suite: architecture debt public-contract polish.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const feature = readFileSync(new URL("./architecture-debt.feature", import.meta.url), "utf8");
const policy = readFileSync(new URL("./architecture-debt-policy.test.ts", import.meta.url), "utf8");
const presentation = readFileSync(new URL("./architecture-debt-presentation.test.ts", import.meta.url), "utf8");
const integration = readFileSync(new URL("./architecture-debt-future-touch.integration.test.ts", import.meta.url), "utf8");
const store = readFileSync(new URL("../../../packages/db/test/architecture-debt-store.test.ts", import.meta.url), "utf8");
const reviewIngress = readFileSync(new URL("./authoritative-review-ingestion.test.ts", import.meta.url), "utf8");

describe("E013-AD public-contract polish traceability", () => {
  it("maps every backend Gherkin acceptance tag to an exact public-boundary suite", () => {
    for (const tag of ["E013-AD-001", "E013-AD-002", "E013-AD-003", "E013-AD-004", "E013-AD-005"]) {
      expect(feature).toContain(`Scenario: ${tag}`);
    }

    expect(store).toContain('describe("E013-AD-001: ArchitectureDebtSqliteStore"');
    expect(policy).toContain('describe("E013-AD-002: architecture-debt triage and future-touch policy"');
    expect(presentation).toContain('describe("E013-AD-003: architecture-debt safe projection"');
    expect(integration).toContain('describe("E013-AD-004: future-touch refinement and readiness integration"');
    expect(reviewIngress).toContain('F1/F4 real-store ingress uses scope-bound identities and leaves an approved gate unchanged for debt');
  });
});
