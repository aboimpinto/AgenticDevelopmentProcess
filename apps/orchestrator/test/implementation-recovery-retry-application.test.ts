import { describe, expect, it, vi } from "vitest";
import { ImplementationRecoveryRetryApplication } from "../src/workflows/recovery/implementation-recovery-retry-application.js";

const input = {
  originalErrorMessage: "original",
  outputPrefix: "retry",
  retryFeature: { externalId: "ITEM-ANY" },
  retryInput: { runId: "run" },
} as any;

describe("implementation recovery retry application", () => {
  it("returns a successful autonomous retry with its prefix", async () => {
    const nested = vi.fn();
    const application = new ImplementationRecoveryRetryApplication({ runAutonomous: vi.fn(async () => "output") });
    await expect(application.execute(input, nested)).resolves.toEqual({
      errorMessage: "original", failureBrief: null, output: "retry\noutput", recovered: true,
    });
    expect(nested).not.toHaveBeenCalled();
  });

  it("returns a successful nested recovery under the original error", async () => {
    const application = new ImplementationRecoveryRetryApplication({ runAutonomous: vi.fn(async () => { throw new Error("retry failed"); }) });
    const nested = vi.fn(async () => ({ errorMessage: "nested", failureBrief: null, output: "nested output", recovered: true }));
    await expect(application.execute(input, nested)).resolves.toEqual({
      errorMessage: "original", failureBrief: null, output: "retry\nnested output", recovered: true,
    });
    expect(nested).toHaveBeenCalledWith(expect.objectContaining({ errorMessage: "retry failed" }));
  });

  it("keeps the final nested failure authoritative", async () => {
    const application = new ImplementationRecoveryRetryApplication({ runAutonomous: vi.fn(async () => { throw new Error("retry failed"); }) });
    const nested = vi.fn(async () => ({ errorMessage: "final", failureBrief: "brief", output: "evidence", recovered: false }));
    await expect(application.execute(input, nested)).resolves.toEqual({
      errorMessage: "final", failureBrief: "brief", output: "evidence", recovered: false,
    });
  });
});
