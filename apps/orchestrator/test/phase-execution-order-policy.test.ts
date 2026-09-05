import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import type { PhaseExecutionContract } from "../src/phase-execution-contract.js";
import { PhaseExecutionOrderPolicy } from "../src/workflows/phases/phase-execution-order-policy.js";

const phases = [
  { documentPath: "/feature/Phases/phase-8-any.md", number: 8 },
  { documentPath: "/feature/Phases/phase-3-random.md", number: 3 },
] as Array<PhaseSummary & { number: number }>;
const feature = { folderPath: "/feature", phases } as Pick<WorkItemCard, "folderPath" | "phases">;

describe("phase execution order policy", () => {
  it("passes the loaded contract, feature root, and numbered documents to contract ordering", () => {
    const contract = { schemaVersion: "hepha-phase-execution/v3", phases: [] } as PhaseExecutionContract;
    const orderByContract = vi.fn(() => [...phases].reverse());
    const policy = new PhaseExecutionOrderPolicy({
      getNumberedPhases: () => phases,
      loadContract: () => ({ contract }),
      orderByContract,
    });
    expect(policy.order(feature).map((phase) => phase.number)).toEqual([3, 8]);
    expect(orderByContract).toHaveBeenCalledWith(contract, "/feature", phases);
  });

  it("preserves document order through the contract orderer when no contract exists", () => {
    const policy = new PhaseExecutionOrderPolicy({
      getNumberedPhases: () => phases,
      loadContract: () => ({ contract: null }),
      orderByContract: (_contract, _root, candidates) => [...candidates],
    });
    expect(policy.order(feature)).toEqual(phases);
  });
});
