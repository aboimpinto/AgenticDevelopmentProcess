import { describe, expect, it } from "vitest";
import {
  PHASE_EXECUTION_CONTRACT_VERSION,
  PREVIOUS_PHASE_EXECUTION_CONTRACT_VERSION,
  contractUsesOrderedTaskWorkflow,
  parsePhaseExecutionContract,
  orderPhasesByExecutionContract,
  phaseRequiresCodeReview,
  phaseRequiresGitCheckpoint,
  selectNextUnresolvedContractPhase,
  toOrderedPhaseTasks,
} from "../src/phase-execution-contract.js";

const contract = JSON.stringify({
  schemaVersion: PHASE_EXECUTION_CONTRACT_VERSION,
  phases: [
    {
      id: "baseline",
      order: 0,
      document: "Phases/phase-0-baseline-with-any-name.md",
      role: "entry_gate",
      tasks: [{ id: "baseline-check", kind: "verification", profile: "full", required: true }],
      developmentValidation: "focused",
      codeReview: "never",
      finalValidation: "full",
      failurePolicy: "repair_and_rerun",
      gitCheckpoint: "commit_and_push",
    },
    {
      id: "persistence",
      order: 1,
      document: "Phases/phase-1-persistence-with-any-name.md",
      role: "implementation",
      tasks: [
        { id: "implementation", kind: "agent", required: true },
        { id: "review", kind: "code_review", condition: "when_production_code_changes", required: true },
        { id: "exit", kind: "verification", profile: "focused", required: true },
      ],
      developmentValidation: "focused",
      codeReview: "when_production_code_changes",
      finalValidation: "focused",
      failurePolicy: "repair_and_rerun",
      gitCheckpoint: "commit_and_push",
    },
  ],
});

describe("phase execution contract", () => {
  it("uses all resolved phase queues as the V3 feature completion gate", () => {
    const parsed = parsePhaseExecutionContract(contract);
    expect(contractUsesOrderedTaskWorkflow(parsed.contract)).toBe(true);
  });

  it("keeps V2 contracts readable without silently inventing the V3 git checkpoint", () => {
    const previous = JSON.parse(contract) as { schemaVersion: string; phases: Array<Record<string, unknown>> };
    previous.schemaVersion = PREVIOUS_PHASE_EXECUTION_CONTRACT_VERSION;
    for (const phase of previous.phases) delete phase.gitCheckpoint;

    const parsed = parsePhaseExecutionContract(JSON.stringify(previous));
    expect(parsed.diagnostics).toEqual([]);
    expect(contractUsesOrderedTaskWorkflow(parsed.contract)).toBe(true);
    expect(phaseRequiresGitCheckpoint(parsed.contract?.phases[0] ?? null)).toBe(false);
  });
  it("uses declared role and review policy rather than a phase number or title", () => {
    const result = parsePhaseExecutionContract(contract);

    expect(result.diagnostics).toEqual([]);
    expect(result.contract?.phases.map((phase) => phase.id)).toEqual(["baseline", "persistence"]);
    expect(phaseRequiresCodeReview(result.contract?.phases[1] ?? null, true)).toBe(true);
    expect(phaseRequiresCodeReview(result.contract?.phases[1] ?? null, false)).toBe(false);
  });

  it("fails closed for a non-contiguous or incomplete contract", () => {
    const result = parsePhaseExecutionContract(contract.replace('"order":1', '"order":2'));

    expect(result.contract).toBeNull();
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "phase orders must be contiguous starting at 0",
    );
  });

  it("accepts an arbitrary suffix and role when the numeric prefix matches order", () => {
    const raw = JSON.stringify({
      schemaVersion: PHASE_EXECUTION_CONTRACT_VERSION,
      phases: [{
        id: "custom-checkpoint",
        order: 0,
        document: "Phases/phase-0-custom-release-readiness.md",
        role: "final_checkpoint",
        tasks: [{ id: "release-proof", kind: "verification", profile: "full", required: true }],
        developmentValidation: "none",
        codeReview: "never",
        finalValidation: "full",
        failurePolicy: "repair_and_rerun",
        gitCheckpoint: "commit_and_push",
      }],
    });

    expect(parsePhaseExecutionContract(raw).diagnostics).toEqual([]);
  });

  it("rejects a document without a phase-number prefix", () => {
    const result = parsePhaseExecutionContract(contract.replace(
      "Phases/phase-0-baseline-with-any-name.md",
      "Phases/completely-random.md",
    ));

    expect(result.contract).toBeNull();
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "document must be a unique feature-relative path beginning with Phases/phase-<number>",
    );
  });

  it("rejects a phase-number prefix that does not match contract order", () => {
    const result = parsePhaseExecutionContract(contract.replace(
      "Phases/phase-1-persistence-with-any-name.md",
      "Phases/phase-7-persistence-with-any-name.md",
    ));

    expect(result.contract).toBeNull();
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "document phase prefix 7 must match order 1",
    );
  });

  it("preserves review at its declared position instead of treating it as a phase-exit gate", () => {
    const phase = parsePhaseExecutionContract(contract).contract?.phases[1];
    expect(phase).toBeDefined();
    expect(toOrderedPhaseTasks(phase!, true).map((task) => task.id))
      .toEqual(["implementation", "review", "exit"]);
  });

  it("does not create a review task for a phase that does not declare one", () => {
    const phase = parsePhaseExecutionContract(contract).contract?.phases[0];
    expect(phase).toBeDefined();
    expect(toOrderedPhaseTasks(phase!, true).map((task) => task.id)).toEqual(["baseline-check"]);
  });

  it("preserves every explicit executor in its declared task position", () => {
    const parsed = parsePhaseExecutionContract(JSON.stringify({
      schemaVersion: PREVIOUS_PHASE_EXECUTION_CONTRACT_VERSION,
      phases: [{
        id: "arbitrary",
        order: 0,
        document: "Phases/phase-0-any-title.md",
        role: "implementation",
        tasks: [
          { id: "one", kind: "verification", profile: "focused", required: true },
          { id: "two", kind: "agent", required: true },
          { id: "three", kind: "code_review", condition: "always", required: true },
          { id: "four", kind: "git_commit", required: true },
          { id: "five", kind: "git_push", required: false },
        ],
        developmentValidation: "none",
        codeReview: "never",
        finalValidation: "none",
        failurePolicy: "repair_and_rerun",
      }],
    }));
    expect(parsed.diagnostics).toEqual([]);
    expect(toOrderedPhaseTasks(parsed.contract!.phases[0]!, true).map((task) => task.executor))
      .toEqual(["verification", "agent", "code_review", "git_commit", "git_push"]);
  });

  it("omits a conditional review task without inventing another transition", () => {
    const parsed = parsePhaseExecutionContract(JSON.stringify({
      schemaVersion: PHASE_EXECUTION_CONTRACT_VERSION,
      phases: [{
        id: "arbitrary",
        order: 0,
        document: "Phases/phase-0-any-title.md",
        role: "implementation",
        tasks: [
          { id: "one", kind: "agent", required: true },
          { id: "two", kind: "code_review", condition: "when_production_code_changes", required: true },
          { id: "three", kind: "verification", profile: "full", required: true },
        ],
        developmentValidation: "none",
        codeReview: "never",
        finalValidation: "none",
        failurePolicy: "repair_and_rerun",
        gitCheckpoint: "commit_and_push",
      }],
    }));
    expect(toOrderedPhaseTasks(parsed.contract!.phases[0]!, false).map((task) => task.id))
      .toEqual(["one", "three"]);
  });

  it("hands off every adjacent phase through contract order, not phase names or numbers", () => {
    const parsed = parsePhaseExecutionContract(JSON.stringify({
      schemaVersion: PHASE_EXECUTION_CONTRACT_VERSION,
      phases: [
        {
          id: "ingress", order: 0, document: "Phases/phase-0-any-first-name.md", role: "implementation",
          tasks: [{ id: "write", kind: "agent", required: true }], developmentValidation: "focused",
          codeReview: "never", finalValidation: "none", failurePolicy: "repair_and_rerun",
          gitCheckpoint: "commit_and_push",
        },
        {
          id: "egress", order: 1, document: "Phases/phase-1-completely-different-second-name.md", role: "final_checkpoint",
          tasks: [{ id: "verify", kind: "verification", profile: "full", required: true }], developmentValidation: "none",
          codeReview: "never", finalValidation: "full", failurePolicy: "repair_and_rerun",
          gitCheckpoint: "commit_and_push",
        },
      ],
    }));
    const phases = [
      { documentPath: "/feature/Phases/phase-1-completely-different-second-name.md", state: "open" },
      { documentPath: "/feature/Phases/phase-0-any-first-name.md", state: "done" },
    ];

    expect(orderPhasesByExecutionContract(parsed.contract, "/feature", phases).map((phase) => phase.documentPath)).toEqual([
      "/feature/Phases/phase-0-any-first-name.md",
      "/feature/Phases/phase-1-completely-different-second-name.md",
    ]);
    expect(selectNextUnresolvedContractPhase({
      contract: parsed.contract,
      featureFolderPath: "/feature",
      phases,
      isResolved: (phase) => phase.state === "done",
    })?.documentPath).toBe("/feature/Phases/phase-1-completely-different-second-name.md");
  });

  it("fails closed when the scanned phase documents and contract are not the same interface", () => {
    const parsed = parsePhaseExecutionContract(contract);
    expect(() => orderPhasesByExecutionContract(parsed.contract, "/feature", [
      { documentPath: "/feature/Phases/phase-0-baseline-with-any-name.md" },
      { documentPath: "/feature/Phases/phase-1-unowned-random-name.md" },
    ])).toThrow("Phase execution contract/document interface mismatch");
  });

  it("rejects legacy task kinds inside a V3 contract", () => {
    const result = parsePhaseExecutionContract(contract.replace('"kind":"agent"', '"kind":"work"'));
    expect(result.contract).toBeNull();
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining("V3 task kind") }),
    ]));
  });
});
