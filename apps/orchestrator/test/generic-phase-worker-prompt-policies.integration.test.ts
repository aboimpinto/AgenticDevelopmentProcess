import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  cargoTimeoutSafetyRule,
  codeReviewFindingLedgerRule,
  phaseTaskLedgerRule,
  windowsShellHygieneRule,
} from "../src/workflows/phases/phase-worker-prompt-policies.js";

const featurePath = fileURLToPath(new URL("./generic-phase-worker-prompt-policies.feature", import.meta.url));

describe("generic phase worker prompt policies Gherkin integration", () => {
  it("documents generic safeguards without feature or phase-name coupling", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: A phase worker receives common execution safeguards");
    expect(specification).toContain("Scenario: A phase worker receives durable ledger ownership rules");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exposes the policies required by both implementation and review journeys", () => {
    expect(windowsShellHygieneRule).toContain("PowerShell");
    expect(cargoTimeoutSafetyRule).toContain("cargo/rustc");
    expect(phaseTaskLedgerRule).toContain("resume ledger");
    expect(codeReviewFindingLedgerRule).toContain("Review Finding Decision Ledger");
  });
});
