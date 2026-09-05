import { describe, expect, it, vi } from "vitest";
import { createDeepDiveApplications } from "../src/bootstrap/deep-dive-applications.js";
import { DeepDiveCompletionApplication } from "../src/application/deep-dive/deep-dive-completion-application.js";
import { DeepDiveContinuationRecoveryApplication } from "../src/application/deep-dive/deep-dive-continuation-recovery-application.js";
import { DeepDiveSessionApplication } from "../src/application/deep-dive/deep-dive-session-application.js";
import { DeepDiveStartApplication } from "../src/application/deep-dive/deep-dive-start-application.js";

describe("deep-dive application composition", () => {
  it("returns shared start, session, completion, and recovery boundaries", () => {
    const applications = createDeepDiveApplications({
      epicState: { syncEpic: vi.fn() } as never,
      lessons: { render: vi.fn() } as never,
      metadataStore: {} as never,
      modelRouter: { getWorkflowDefault: vi.fn(), require: vi.fn() } as never,
      notifyChanged: vi.fn(),
      registry: { get: vi.fn() } as never,
      runCoordinator: { createCardRunner: vi.fn() } as never,
      runPrompt: vi.fn(),
      settings: {
        deepDiveDocumentUpdateTimeoutMs: 1_000,
        deepDiveModelRewriteMaxChars: 1_000,
        runTimeoutMs: 1_000,
        sessionDir: "/tmp/hepha-sessions",
      },
      workItems: { scan: vi.fn() } as never,
    });

    expect(applications.deepDiveStartApplication).toBeInstanceOf(DeepDiveStartApplication);
    expect(applications.deepDiveSessionApplication).toBeInstanceOf(DeepDiveSessionApplication);
    expect(applications.deepDiveCompletionApplication).toBeInstanceOf(DeepDiveCompletionApplication);
    expect(applications.deepDiveContinuationRecoveryApplication).toBeInstanceOf(DeepDiveContinuationRecoveryApplication);
  });
});
