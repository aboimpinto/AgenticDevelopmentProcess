import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  BranchPreparationResult as PublicBranchPreparation,
  DeliveryReadModel as PublicDeliveryReadModel,
  ParsedDeliveryConfig as PublicDeliveryConfig,
  StartTransitionMetadata as PublicStartTransition,
} from "../src/index.js";
import type {
  DeliveryReadModel as BoundedDeliveryReadModel,
  ParsedDeliveryConfig as BoundedDeliveryConfig,
} from "../src/delivery/contracts.js";
import type {
  BranchPreparationResult as BoundedBranchPreparation,
  StartTransitionMetadata as BoundedStartTransition,
} from "../src/workflow/start-transition-contracts.js";

describe("shared delivery contracts", () => {
  it("preserves branch preparation and transition types through the compatibility barrel", () => {
    expectTypeOf<BoundedBranchPreparation>().toEqualTypeOf<PublicBranchPreparation>();
    expectTypeOf<BoundedStartTransition>().toEqualTypeOf<PublicStartTransition>();
  });

  it("carries recoverable branch preparation evidence", () => {
    const result = {
      deliveryPolicy: "pull_request",
      baseBranch: "master",
      implementationBranch: "work/item",
      worktreePath: null,
      repoRoot: "/repo",
      startCommit: "abc123",
      preparationResult: "already_exists",
      failureReason: null,
      branchName: "work/item",
      message: "Existing implementation branch selected.",
    } satisfies BoundedBranchPreparation;

    expect(result.preparationResult).toBe("already_exists");
    expect(result.implementationBranch).toBe(result.branchName);
  });

  it("preserves delivery configuration and read models through the compatibility barrel", () => {
    expectTypeOf<BoundedDeliveryConfig>().toEqualTypeOf<PublicDeliveryConfig>();
    expectTypeOf<BoundedDeliveryReadModel>().toEqualTypeOf<PublicDeliveryReadModel>();
  });
});
