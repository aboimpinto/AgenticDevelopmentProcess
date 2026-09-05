// Behavior suite: code review findings.
/**
 * FEAT-042 Phase 3: Business Logic Tests
 *
 * Covers finding normalization, decision classification,
 * reconciliation, unresolved required-fix detection,
 * and repair-loop decision helpers.
 *
 * All tests are pure — no I/O, no database, no filesystem.
 */

import { describe, it, expect } from "vitest";
import {
  deriveFindingFingerprint,
  normalizeFindingText,
  normalizeFindings,
  classifyFindingSeverity,
  defaultResolutionForDecision,
  isRequiredFixDecision,
  reconcileFindings,
  detectRequiredFixes,
  decideRepairLoop,
  extractFindingsFromDecisionItems,
  type NormalizedFindingInput,
  type ReconciledFinding,
} from "../src/code-review-finding-ledger.js";
import type { ReviewFindingLedgerRecord } from "@hepha/db";

// ---------------------------------------------------------------------------
// deriveFindingFingerprint
// ---------------------------------------------------------------------------

describe("deriveFindingFingerprint", () => {
  it("includes phase number, area, severity, and normalized text", () => {
    const fp = deriveFindingFingerprint(
      2,
      "src/index.ts",
      "BLOCKER",
      "Missing error handling in processFile",
    );
    expect(fp).toContain("2");
    expect(fp).toContain("src/index.ts");
    expect(fp).toContain("blocker");
    expect(fp).toContain("missing error handling in processfile");
  });

  it("handles null affected area", () => {
    const fp = deriveFindingFingerprint(2, null, "NOTE", "Unused import");
    expect(fp).toContain("2|");
    expect(fp).not.toContain("null");
  });

  it("handles null severity", () => {
    const fp = deriveFindingFingerprint(2, "test.ts", null, "Consider renaming");
    expect(fp).not.toContain("null");
  });

  it("is case-insensitive", () => {
    const fp1 = deriveFindingFingerprint(2, "SRC/INDEX.TS", "BLOCKER", "MISSING ERROR");
    const fp2 = deriveFindingFingerprint(2, "src/index.ts", "blocker", "Missing Error");
    expect(fp1).toBe(fp2);
  });

  it("produces stable output for same inputs", () => {
    const fp1 = deriveFindingFingerprint(1, "test.ts", "REQUIRED", "Add test coverage");
    const fp2 = deriveFindingFingerprint(1, "test.ts", "REQUIRED", "Add test coverage");
    expect(fp1).toBe(fp2);
  });
});

// ---------------------------------------------------------------------------
// normalizeFindingText
// ---------------------------------------------------------------------------

describe("normalizeFindingText", () => {
  it("trims whitespace", () => {
    expect(normalizeFindingText("  hello world  ")).toBe("hello world");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeFindingText("hello    world")).toBe("hello world");
  });

  it("lowercases text", () => {
    expect(normalizeFindingText("Hello World")).toBe("hello world");
  });
});

// ---------------------------------------------------------------------------
// normalizeFindings
// ---------------------------------------------------------------------------

describe("normalizeFindings", () => {
  it("returns fingerprints for all inputs", () => {
    const inputs: NormalizedFindingInput[] = [
      {
        phaseNumber: 2,
        phaseTitle: "Data Layer",
        findingSummary: "Missing error handling",
        findingText: "Add try/catch to processFile",
        affectedArea: "src/process.ts",
        severity: "BLOCKER",
      },
      {
        phaseNumber: 2,
        phaseTitle: "Data Layer",
        findingSummary: "Unused import",
        findingText: null,
        affectedArea: null,
        severity: "NOTE",
      },
    ];

    const result = normalizeFindings(inputs);
    expect(result.normalizedInputs).toHaveLength(2);
    expect(result.fingerprints).toHaveLength(2);
    expect(result.fingerprints[0]).toBeTruthy();
    expect(result.fingerprints[1]).toBeTruthy();
  });

  it("falls back to findingSummary when findingText is null", () => {
    const inputs: NormalizedFindingInput[] = [
      {
        phaseNumber: 1,
        phaseTitle: "Planning",
        findingSummary: "Review approach",
        findingText: null,
        affectedArea: null,
        severity: null,
      },
    ];

    const result = normalizeFindings(inputs);
    expect(result.fingerprints[0]).toContain("review approach");
  });
});

// ---------------------------------------------------------------------------
// classifyFindingSeverity
// ---------------------------------------------------------------------------

describe("classifyFindingSeverity", () => {
  it("classifies BLOCKER severity as blocker", () => {
    expect(classifyFindingSeverity("BLOCKER", "Missing error handling")).toBe("blocker");
  });

  it("classifies REQUIRED severity as required", () => {
    expect(classifyFindingSeverity("REQUIRED", "Must add validation")).toBe("required");
  });

  it("classifies NEEDS_CHANGES severity as required", () => {
    expect(classifyFindingSeverity("NEEDS_CHANGES", "Fix implementation")).toBe("required");
  });

  it("classifies NOTE severity as note", () => {
    expect(classifyFindingSeverity("NOTE", "Consider refactoring")).toBe("note");
  });

  it("classifies POLISH severity as note", () => {
    expect(classifyFindingSeverity("POLISH", "Minor formatting")).toBe("note");
  });

  it("classifies SUGGESTION severity as note", () => {
    expect(classifyFindingSeverity("SUGGESTION", "Could improve")).toBe("note");
  });

  it("classifies NON_BLOCKING severity as note", () => {
    expect(classifyFindingSeverity("NON_BLOCKING", "Future optimization")).toBe("note");
  });

  it("classifies OUT_OF_SCOPE severity as note", () => {
    expect(classifyFindingSeverity("OUT_OF_SCOPE", "Not in current scope")).toBe("note");
  });

  it("detects blocker keyword in WITH_NOTES text", () => {
    expect(classifyFindingSeverity("WITH_NOTES", "BLOCKER: missing error handling")).toBe("blocker");
  });

  it("detects required keyword in WITH_NOTES text", () => {
    expect(classifyFindingSeverity("WITH_NOTES", "REQUIRED: add validation")).toBe("required");
  });

  it("returns note for null/empty severity and text", () => {
    expect(classifyFindingSeverity(null, null)).toBe("note");
  });

  it("returns note for unknown severity", () => {
    expect(classifyFindingSeverity("UNKNOWN", "Some issue")).toBe("note");
  });
});

// ---------------------------------------------------------------------------
// defaultResolutionForDecision
// ---------------------------------------------------------------------------

describe("defaultResolutionForDecision", () => {
  it("blocker → unresolved", () => {
    expect(defaultResolutionForDecision("blocker")).toBe("unresolved");
  });

  it("required → unresolved", () => {
    expect(defaultResolutionForDecision("required")).toBe("unresolved");
  });

  it("note → informational", () => {
    expect(defaultResolutionForDecision("note")).toBe("informational");
  });

  it("deferred → deferred", () => {
    expect(defaultResolutionForDecision("deferred")).toBe("deferred");
  });

  it("accepted_risk → accepted_risk", () => {
    expect(defaultResolutionForDecision("accepted_risk")).toBe("accepted_risk");
  });

  it("rebutted → rebutted", () => {
    expect(defaultResolutionForDecision("rebutted")).toBe("rebutted");
  });

  it("follow_up → follow_up", () => {
    expect(defaultResolutionForDecision("follow_up")).toBe("follow_up");
  });

  it("null → informational", () => {
    expect(defaultResolutionForDecision(null)).toBe("informational");
  });
});

// ---------------------------------------------------------------------------
// isRequiredFixDecision
// ---------------------------------------------------------------------------

describe("isRequiredFixDecision", () => {
  it("blocker is a required fix", () => {
    expect(isRequiredFixDecision("blocker")).toBe(true);
  });

  it("required is a required fix", () => {
    expect(isRequiredFixDecision("required")).toBe(true);
  });

  it("note is not a required fix", () => {
    expect(isRequiredFixDecision("note")).toBe(false);
  });

  it("null is not a required fix", () => {
    expect(isRequiredFixDecision(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reconcileFindings
// ---------------------------------------------------------------------------

describe("reconcileFindings", () => {
  it("marks new blocker finding as blocking", () => {
    const findings: NormalizedFindingInput[] = [{
      phaseNumber: 2, phaseTitle: "Data Layer",
      findingSummary: "Missing error handling",
      findingText: "Add try/catch", affectedArea: "src/process.ts", severity: "BLOCKER",
    }];
    const result = reconcileFindings(findings, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.blocksAdvancement).toBe(true);
    expect(result[0]!.isRequiredFix).toBe(true);
    expect(result[0]!.currentResolution).toBe("unresolved");
  });

  it("marks note finding as non-blocking", () => {
    const findings: NormalizedFindingInput[] = [{
      phaseNumber: 2, phaseTitle: "Data Layer",
      findingSummary: "Minor formatting", affectedArea: null,
      findingText: "Consider formatting", severity: "NOTE",
    }];
    const result = reconcileFindings(findings, []);
    expect(result[0]!.blocksAdvancement).toBe(false);
    expect(result[0]!.isRequiredFix).toBe(false);
    expect(result[0]!.currentResolution).toBe("informational");
  });

  it("respects prior deferred decision", () => {
    const findings: NormalizedFindingInput[] = [{
      phaseNumber: 2, phaseTitle: "Data Layer",
      findingSummary: "Minor formatting", affectedArea: null,
      findingText: "Consider formatting", severity: "NOTE",
    }];
    const fp = deriveFindingFingerprint(2, null, "NOTE", "Consider formatting");
    const priorEntries: Pick<ReviewFindingLedgerRecord, "fingerprint" | "decisionClassification" | "resolutionState" | "decisionRationale">[] = [{
      fingerprint: fp,
      decisionClassification: "deferred",
      resolutionState: "deferred",
      decisionRationale: "Will address in follow-up",
    }];
    const result = reconcileFindings(findings, priorEntries);
    expect(result[0]!.currentResolution).toBe("deferred");
    expect(result[0]!.blocksAdvancement).toBe(false);
  });

  it("resolves finding when severity is RESOLVED", () => {
    const findings: NormalizedFindingInput[] = [{
      phaseNumber: 2, phaseTitle: "Data Layer",
      findingSummary: "Missing error handling", affectedArea: "src/process.ts",
      findingText: "Now fixed", severity: "RESOLVED",
    }];
    const result = reconcileFindings(findings, []);
    expect(result[0]!.currentResolution).toBe("resolved");
    expect(result[0]!.blocksAdvancement).toBe(false);
  });

  it("reconciles multiple findings with different outcomes", () => {
    const findings: NormalizedFindingInput[] = [
      {
        phaseNumber: 2, phaseTitle: "Data Layer",
        findingSummary: "Blocker issue", affectedArea: "a.ts",
        findingText: "Critical bug", severity: "BLOCKER",
      },
      {
        phaseNumber: 2, phaseTitle: "Data Layer",
        findingSummary: "Note issue", affectedArea: "b.ts",
        findingText: "Suggestion", severity: "NOTE",
      },
    ];
    const result = reconcileFindings(findings, []);
    expect(result).toHaveLength(2);
    expect(result[0]!.blocksAdvancement).toBe(true);
    expect(result[1]!.blocksAdvancement).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectRequiredFixes
// ---------------------------------------------------------------------------

describe("detectRequiredFixes", () => {
  it("returns false when no blocking findings exist", () => {
    const reconciled: ReconciledFinding[] = [{
      fingerprint: "fp1", latestFinding: {} as any,
      priorDecisions: [], currentDecision: "note",
      currentResolution: "informational",
      isRequiredFix: false, blocksAdvancement: false,
    }];
    const status = detectRequiredFixes(reconciled);
    expect(status.hasUnresolvedRequiredFixes).toBe(false);
    expect(status.unresolvedCount).toBe(0);
  });

  it("reports blocking findings", () => {
    const reconciled: ReconciledFinding[] = [
      {
        fingerprint: "fp1", latestFinding: {} as any,
        priorDecisions: [], currentDecision: "blocker",
        currentResolution: "unresolved",
        isRequiredFix: true, blocksAdvancement: true,
      },
      {
        fingerprint: "fp2", latestFinding: {} as any,
        priorDecisions: [], currentDecision: "note",
        currentResolution: "informational",
        isRequiredFix: false, blocksAdvancement: false,
      },
    ];
    const status = detectRequiredFixes(reconciled);
    expect(status.hasUnresolvedRequiredFixes).toBe(true);
    expect(status.unresolvedCount).toBe(1);
    expect(status.blockingCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// decideRepairLoop
// ---------------------------------------------------------------------------

describe("decideRepairLoop", () => {
  function makeRequiredFixStatus(count: number): ReturnType<typeof detectRequiredFixes> {
    const findings: ReconciledFinding[] = Array.from({ length: count }, (_, i) => ({
      fingerprint: `fp${i}`,
      latestFinding: { phaseNumber: 2, phaseTitle: "Data Layer", findingSummary: `Issue ${i}`, affectedArea: null, findingText: null, severity: "BLOCKER" },
      priorDecisions: [], currentDecision: "blocker",
      currentResolution: "unresolved", isRequiredFix: true, blocksAdvancement: true,
    }));
    return {
      hasUnresolvedRequiredFixes: true,
      unresolvedCount: count,
      unresolvedFindings: findings,
      blockingCount: count,
    };
  }

  it("returns approved when no required fixes remain", () => {
    const status = detectRequiredFixes([]);
    const decision = decideRepairLoop(status, 0);
    expect(decision.decision).toBe("approved");
  });

  it("returns rerun_review when fixes remain and attempts < max", () => {
    const status = makeRequiredFixStatus(2);
    const decision = decideRepairLoop(status, 0, 3);
    expect(decision.decision).toBe("rerun_review");
    if (decision.decision === "rerun_review") {
      expect(decision.repairContext).toContain("BLOCKER");
    }
  });

  it("returns safety_limit when max attempts reached", () => {
    const status = makeRequiredFixStatus(1);
    const decision = decideRepairLoop(status, 3, 3);
    expect(decision.decision).toBe("safety_limit");
    if (decision.decision === "safety_limit") {
      expect(decision.attemptCount).toBe(3);
      expect(decision.reason).toContain("maximum");
    }
  });

  it("defaults max attempts to 3", () => {
    const status = makeRequiredFixStatus(1);
    const decision = decideRepairLoop(status, 3);
    expect(decision.decision).toBe("safety_limit");
  });
});

// ---------------------------------------------------------------------------
// extractFindingsFromDecisionItems
// ---------------------------------------------------------------------------

describe("extractFindingsFromDecisionItems", () => {
  it("converts decision items to normalized inputs", () => {
    const items = [
      { severity: "BLOCKER", summary: "Missing error handling", location: "src/process.ts", requiredChange: "Add try/catch" },
      { severity: "NOTE", summary: "Minor formatting", location: null, requiredChange: null },
    ];
    const result = extractFindingsFromDecisionItems(2, "Data Layer", items);
    expect(result).toHaveLength(2);
    expect(result[0]!.severity).toBe("BLOCKER");
    expect(result[0]!.affectedArea).toBe("src/process.ts");
    expect(result[0]!.findingText).toBe("Add try/catch");
    expect(result[1]!.affectedArea).toBeNull();
    expect(result[1]!.findingText).toBe("Minor formatting");
  });
});
