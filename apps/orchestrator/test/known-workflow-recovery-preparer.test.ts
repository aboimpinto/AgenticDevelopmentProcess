import { describe, expect, it, vi } from "vitest";
import {
  prepareKnownWorkflowRecovery,
  type KnownWorkflowRecoveryDependencies,
} from "../src/workflows/recovery/known-workflow-recovery-preparer.js";

function createDependencies(
  overrides: Partial<KnownWorkflowRecoveryDependencies> = {},
): KnownWorkflowRecoveryDependencies {
  return {
    ensureCargoShimDirectory: vi.fn(() => null),
    findCodeReviewContext: vi.fn(() => null),
    formatMissingPi: vi.fn((diagnostics) => `missing: ${diagnostics.join(", ")}`),
    resolvePi: vi.fn(() => ({ diagnostics: [], invocation: null })),
    ...overrides,
  };
}

describe("known workflow recovery preparer", () => {
  it("routes incomplete fixer responses back to the referenced report without a recovery agent", () => {
    const dependencies = createDependencies({
      findCodeReviewContext: vi.fn(() => ({ phaseNumber: 12, reportPath: "/repo/reviews/latest.md" })),
    });

    const plan = prepareKnownWorkflowRecovery(
      "Cannot request a code-review rerun until Fixer Response entries are complete",
      dependencies,
    );

    expect(plan).toMatchObject({ canRetry: true, skipRecoveryAgent: true });
    expect(plan.summary).toContain("Phase 12");
    expect(plan.summary).toContain("/repo/reviews/latest.md");
  });

  it("retries a code-review worker at the review gate", () => {
    const plan = prepareKnownWorkflowRecovery("Code Review Agent failed", createDependencies());

    expect(plan).toMatchObject({ canRetry: true, skipRecoveryAgent: true });
    expect(plan.summary).toContain("rerun the code-review worker");
    expect(plan.summary).toContain("exact Review Result line");
  });

  it("retries an unsafe Cargo command with serialized command guidance", () => {
    const dependencies = createDependencies();
    const plan = prepareKnownWorkflowRecovery("HEPHA blocked unsafe Cargo execution", dependencies);

    expect(plan).toMatchObject({ canRetry: true, skipRecoveryAgent: true });
    expect(plan.summary).toContain("Sequential Cargo invocations may share one shell tool call");
    expect(plan.summary).toContain("never background Cargo");
    expect(dependencies.ensureCargoShimDirectory).not.toHaveBeenCalled();
  });

  it("routes a blocked review to findings resolution using available report context", () => {
    const plan = prepareKnownWorkflowRecovery(
      "Phase 27 code review blocked autonomous implementation",
      createDependencies({
        findCodeReviewContext: vi.fn(() => ({ phaseNumber: 27, reportPath: "/repo/reviews/review.md" })),
      }),
    );

    expect(plan.canRetry).toBe(true);
    expect(plan.skipRecoveryAgent).toBeUndefined();
    expect(plan.summary).toContain("fix BLOCKER/REQUIRED findings");
    expect(plan.summary).toContain("/repo/reviews/review.md");
  });

  it("uses a resolved Pi invocation and diagnostics without launching recovery analysis", () => {
    const plan = prepareKnownWorkflowRecovery(
      "Pi CLI is not available",
      createDependencies({
        resolvePi: vi.fn(() => ({
          diagnostics: ["PATH refreshed"],
          invocation: { displayCommand: "/tools/pi", source: "runtime PATH" },
        })),
      }),
    );

    expect(plan).toEqual({
      canRetry: true,
      skipRecoveryAgent: true,
      summary: "Resolved Pi CLI for retry: /tools/pi (runtime PATH). Pi resolver: PATH refreshed",
    });
  });

  it("returns the resolver's actionable error when Pi remains unavailable", () => {
    const dependencies = createDependencies({
      resolvePi: vi.fn(() => ({ diagnostics: ["not on PATH"], invocation: null })),
    });
    const plan = prepareKnownWorkflowRecovery("spawn pi ENOENT", dependencies);

    expect(plan).toEqual({ canRetry: false, skipRecoveryAgent: true, summary: "missing: not on PATH" });
    expect(dependencies.formatMissingPi).toHaveBeenCalledWith(["not on PATH"]);
  });

  it("prepares a discovered Cargo shim and otherwise leaves installation to recovery", () => {
    const recovered = prepareKnownWorkflowRecovery(
      "cargo: command not found",
      createDependencies({ ensureCargoShimDirectory: vi.fn(() => "/runtime/shims") }),
    );
    const blocked = prepareKnownWorkflowRecovery("cargo.exe was not found", createDependencies());

    expect(recovered).toEqual({
      canRetry: true,
      summary: "Prepared a Cargo shim directory for retry: /runtime/shims. Future Pi workers receive this directory on PATH.",
    });
    expect(blocked.canRetry).toBe(false);
    expect(blocked.summary).toContain("safe user-level Rust toolchain install");
  });

  it("does not invoke recovery infrastructure for an unknown failure", () => {
    const dependencies = createDependencies();
    const plan = prepareKnownWorkflowRecovery("ordinary assertion mismatch", dependencies);

    expect(plan).toEqual({
      canRetry: false,
      summary: "No deterministic host-side recovery was available for this failure.",
    });
    expect(dependencies.findCodeReviewContext).not.toHaveBeenCalled();
    expect(dependencies.resolvePi).not.toHaveBeenCalled();
    expect(dependencies.ensureCargoShimDirectory).not.toHaveBeenCalled();
  });
});
