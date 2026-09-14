import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { WorkItemCard } from "@hepha/shared";
import { ManualTestVerificationPanel } from "../manual-tests/manual-test-verification-panel.js";
import { FeatureDeliveryPanel } from "../details/feature-delivery-panel.js";
import { LinkEpicPanel } from "../details/link-epic-panel.js";
import { usePhaseQualityResolution } from "./use-phase-quality-resolution.js";
import { apiGet, apiPost } from "../api/http-client.js";
vi.mock("../api/http-client.js", async importOriginal => ({ ...await importOriginal<object>(), apiGet: vi.fn(), apiPost: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const idle = { id: "example", externalId: "FEAT-EXAMPLE", kind: "feature", stateFolder: "03_IN_PROGRESS", folderName: "example", phases: [{ number: 23, updatedAt: "now" }], linkedEpics: [], linkedEpicIds: ["EPIC-EXAMPLE"] } as unknown as WorkItemCard;
const running = { ...idle, completionRecovery: { ready: false, assessedAt: "now", blockers: [{ id: "recovery-running", action: "external", message: "Running", actionLabel: "Wait" }] } } as WorkItemCard;

it("preserves an open manual failure draft but prevents submission during server recovery", async () => {
  const status = { state: "current", currentPackId: "pack", currentReviewId: "review", isReady: true, isReviewed: true,
    manualCases: [{ id: "MT-OPEN", title: "Open", result: null, isReviewed: true, preconditions: [], steps: ["Open"], expectedResult: "Visible" }] };
  const props = { workflow: { canGenerateManualTestPack: true } as never, isDisabled: false, isPending: false,
    onFetchStatus: vi.fn().mockResolvedValue({ status }), onGenerate: vi.fn(), onReview: vi.fn(), onRecordResult: vi.fn(), getArtifactUrl: vi.fn() };
  const view = render(<ManualTestVerificationPanel {...props} item={idle} />);
  fireEvent.click(await screen.findByRole("button", { name: "Manual tests ready" }));
  fireEvent.click(screen.getByRole("button", { name: "Record failure for MT-OPEN" }));
  fireEvent.change(screen.getByLabelText("Actual result"), { target: { value: "Saved failure draft" } });
  view.rerender(<ManualTestVerificationPanel {...props} item={running} />);
  expect(screen.getByRole("button", { name: "Submit failure" })).toHaveProperty("disabled", true);
  fireEvent.submit(screen.getByLabelText("Actual result").closest("form")!);
  expect(props.onRecordResult).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Close manual test verification" })).toHaveProperty("disabled", false);
  view.rerender(<ManualTestVerificationPanel {...props} item={idle} />);
  expect(screen.getByLabelText("Actual result")).toHaveProperty("value", "Saved failure draft");
  expect(screen.getByRole("button", { name: "Submit failure" })).toHaveProperty("disabled", false);
});

it("blocks delivery preparation but leaves delivery status refresh readable", async () => {
  vi.mocked(apiGet).mockResolvedValue({ mode: "pull_request", status: "ready", statusLabel: "Ready", canPrepare: true, targetBranch: "master" });
  const view = render(<FeatureDeliveryPanel item={running} projectId="project" />);
  const prepare = await screen.findByRole("button", { name: "Prepare pull request" });
  expect(prepare).toHaveProperty("disabled", true);
  fireEvent.click(prepare); expect(apiPost).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: /Refresh delivery/i })).toHaveProperty("disabled", false);
  view.rerender(<FeatureDeliveryPanel item={idle} projectId="project" />);
  expect(prepare).toHaveProperty("disabled", false);
});

it("locks relationship mutations without discarding the selected target", () => {
  const props = { isLinkingEpic: false, linkEpicResult: null, linkEpicError: null, onLinkFeatureToEpic: vi.fn() };
  const view = render(<LinkEpicPanel {...props} item={idle} />);
  fireEvent.change(screen.getByPlaceholderText("e.g. EPIC-004"), { target: { value: "EPIC-NEXT" } });
  view.rerender(<LinkEpicPanel {...props} item={running} />);
  for (const name of ["Link", "Relink", "Unlink"]) {
    const button = screen.getByRole("button", { name }); expect(button).toHaveProperty("disabled", true); fireEvent.click(button);
  }
  expect(props.onLinkFeatureToEpic).not.toHaveBeenCalled();
  view.rerender(<LinkEpicPanel {...props} item={idle} />);
  expect(screen.getByPlaceholderText("e.g. EPIC-004")).toHaveProperty("value", "EPIC-NEXT");
  expect(screen.getByRole("button", { name: "Link" })).toHaveProperty("disabled", false);
});

it("refuses direct phase repair and waiver callbacks during server recovery", async () => {
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() => usePhaseQualityResolution("project", running));
  await act(async () => { for (const action of ["repair", "waive"] as const) await result.current.resolve({ phaseNumber: 23 } as never, action, "Guidance"); });
  expect(fetchMock).not.toHaveBeenCalled();
});
