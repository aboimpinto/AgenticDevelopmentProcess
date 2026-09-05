import { describe, expect, it, vi } from "vitest";
import { ContinueImplementationApplication } from "../src/application/features/continue-implementation-application.js";
import { StartImplementationApplication } from "../src/application/features/start-implementation-application.js";
import { createImplementationCommandApplications } from "../src/bootstrap/implementation-command-applications.js";

describe("implementation command application composition", () => {
  it("returns shared Start and Continue command boundaries", () => {
    const applications = createImplementationCommandApplications({
      continueExecution: vi.fn(),
      deepDiveRecovery: {} as never,
      metadataStore: { enabled: true } as never,
      notifyChanged: vi.fn(),
      phaseContract: {} as never,
      previousFailureResolver: {} as never,
      receiptPolicy: {} as never,
      safeGitReader: {} as never,
      startExecution: vi.fn(),
      targets: {} as never,
      workItems: {} as never,
    });

    expect(applications.startImplementationApplication).toBeInstanceOf(StartImplementationApplication);
    expect(applications.continueImplementationApplication).toBeInstanceOf(ContinueImplementationApplication);
  });
});
