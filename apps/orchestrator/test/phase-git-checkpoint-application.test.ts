import { describe, expect, it, vi } from "vitest";
import { PhaseGitCheckpointApplication } from "../src/workflows/phases/phase-git-checkpoint-application.js";

const feature = { externalId: "ITEM", title: "Any item" } as any;
const phase = { number: 9, title: "Any delivery", documentPath: "/memory/phase-9-any.md" } as any;
const project = { rootPath: "/project", memoryBankPath: "/memory" } as any;
const input = { branchName: "feat/item", cardKey: "card", command: "continue-implementing" as const, feature, phase, project, runId: "run" };

describe("PhaseGitCheckpointApplication", () => {
  it("returns the completed checkpoint summary without recording pending progress", async () => {
    const recordProgress = vi.fn();
    const application = new PhaseGitCheckpointApplication({
      attempt: vi.fn().mockReturnValue({ kind: "completed", result: { entries: [], summary: "commit and push verified" } }),
      recordProgress,
    });

    await expect(application.execute(input)).resolves.toEqual({ kind: "completed", summary: "Phase 9: commit and push verified" });
    expect(recordProgress).not.toHaveBeenCalled();
  });

  it("keeps a reported git failure pending with resumable progress", async () => {
    const recordProgress = vi.fn();
    const application = new PhaseGitCheckpointApplication({
      attempt: vi.fn().mockReturnValue({ kind: "checkpoint_pending", reason: "remote unavailable" }),
      recordProgress,
    });

    const result = await application.execute(input);

    expect(result).toEqual({
      kind: "checkpoint_pending",
      summary: "Phase 9 implementation and gates are complete; git checkpoint remains pending. remote unavailable",
    });
    expect(recordProgress).toHaveBeenCalledWith(expect.objectContaining({
      currentStep: "Phase 9 git checkpoint pending",
      status: "checkpoint",
    }));
  });

  it("also contains an unexpected git adapter exception instead of failing the phase", async () => {
    const recordProgress = vi.fn();
    const application = new PhaseGitCheckpointApplication({
      attempt: vi.fn(() => { throw new Error("git executable interrupted"); }),
      recordProgress,
    });

    await expect(application.execute(input)).resolves.toMatchObject({
      kind: "checkpoint_pending",
      summary: expect.stringContaining("git executable interrupted"),
    });
    expect(recordProgress).toHaveBeenCalledOnce();
  });
});
