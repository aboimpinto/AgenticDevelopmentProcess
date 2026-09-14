import { expect, it, vi } from "vitest";
import { CompletionReadinessVerificationApplication } from "../src/application/features/completion-readiness-verification-application.js";
const input = { projectId: "project", cardId: "card", reassess: true, verifyExisting: true };
function fixture() {
  const response = { items: [], assessment: { ready: true, blockers: [] }, message: "Historical pass" } as any;
  const refresh = vi.fn(async () => response);
  const verifyFeatureFromRefresh = vi.fn(async () => ({ ...response, assessment: { ready: false, blockers: [] }, message: "Fresh verification started" }));
  const app = new CompletionReadinessVerificationApplication({ refresh }, { verifyFeatureFromRefresh } as any);
  return { app, refresh, verifyFeatureFromRefresh };
}
it("explicit Refresh verifies before assessment, even if historical evidence says ready", async () => {
  const f = fixture();
  expect((await f.app.refresh(input)).message).toBe("Fresh verification started");
  expect(f.verifyFeatureFromRefresh).toHaveBeenCalledExactlyOnceWith({ projectId: "project", cardId: "card" });
  expect(f.refresh).not.toHaveBeenCalled();
});
it("every explicit Refresh verifies again; background and confirmation do not", async () => {
  const f = fixture(); await f.app.refresh(input); await f.app.refresh(input);
  expect(f.verifyFeatureFromRefresh).toHaveBeenCalledTimes(2);
  await f.app.refresh({ projectId: "project", cardId: "card" });
  await f.app.refresh({ projectId: "project", cardId: "card", confirm: true, confirmProposalId: "reviewed" });
  expect(f.verifyFeatureFromRefresh).toHaveBeenCalledTimes(2);
  expect(f.refresh).toHaveBeenCalledTimes(2);
});
it("rejects mixed acceptance/execution requests and false execution authority", async () => {
  const f = fixture();
  for (const bad of [{ ...input, confirm: true }, { ...input, verifyExisting: false }, { ...input, reassess: undefined }])
    await expect(f.app.refresh(bad)).rejects.toThrow("explicit user refresh");
  expect(f.verifyFeatureFromRefresh).not.toHaveBeenCalled();
});
