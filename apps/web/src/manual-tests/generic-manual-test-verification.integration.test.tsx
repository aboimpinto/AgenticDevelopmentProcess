// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { WorkItemCard } from "@hepha/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManualTestVerificationPanel } from "./manual-test-verification-panel.js";

const specification = readFileSync(resolve(import.meta.dirname, "generic-manual-test-verification.feature"), "utf8");
afterEach(cleanup);

describe("generic manual-test verification Gherkin integration", () => {
  it("updates the closed manual caption from refreshed server projection without repeating human results", async () => {
    const item = { id: "item", externalId: "ITEM", completionRecovery: { blockers: [{ id: "manual", action: "manual_tests", message: "Current manual verification is pending" }], phaseGaps: [{ kind: "execution_evidence" }] } } as unknown as WorkItemCard;
    const workflow = { manualTestsCompletedAt: null } as NonNullable<WorkItemCard["featureWorkflow"]>;
    const props = { item, workflow, isPending: false, isDisabled: false, onGenerate: vi.fn(), onReview: vi.fn(), onRecordResult: vi.fn(), onFetchStatus: vi.fn().mockResolvedValue(null), getArtifactUrl: vi.fn() };
    const view = render(<ManualTestVerificationPanel {...props} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Manual tests" })).toBeTruthy());
    expect(screen.getByText("Current manual verification is pending").closest(".manual-test-control")).toBeTruthy();
    const manualTestPackStatus = { state: "current", isStale: false, failedCount: 0, isReady: false, manualCases: [{ id: "MT-OPEN", isReviewed: true, result: "pass" }] } as unknown as NonNullable<typeof workflow.manualTestPackStatus>;
    view.rerender(<ManualTestVerificationPanel {...props} workflow={{ ...workflow, manualTestPackStatus }} />);
    expect(screen.getByRole("button", { name: "1/1 manual tests passed" })).toBeTruthy();
    expect(props.onRecordResult).not.toHaveBeenCalled();
  });
  it("keeps manual passes green independently of incomplete or resolved readiness", async () => {
    const item = { id: "item", externalId: "ITEM", completionRecovery: { ready: false, assessedAt: "now", phaseGaps: [],
      blockers: [{ id: "assessment-incomplete", action: "external", message: "Assessment did not finish", actionLabel: "Retry readiness refresh" }] } } as unknown as WorkItemCard;
    const props = { item, workflow: { canGenerateManualTestPack: true } as never, isPending: false, isDisabled: false,
      getArtifactUrl: vi.fn(), onGenerate: vi.fn(), onReview: vi.fn(), onRecordResult: vi.fn(),
      onFetchStatus: vi.fn().mockResolvedValue({ status: { state: "current", currentPackId: "pack", isReady: false, failedCount: 0,
        manualCases: [{ id: "CASE-A", title: "Save", preconditions: [], steps: ["Save"], expectedResult: "Saved", isReviewed: true, result: "pass" }] } }) };
    const view = render(<ManualTestVerificationPanel {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "1/1 manual tests passed" }));
    expect(screen.getByText(/not a recorded test failure or a confirmed missing-test gap/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Close manual test verification" }));
    view.rerender(<ManualTestVerificationPanel {...props} item={{ ...item, completionRecovery: { ready: true, assessedAt: "later", blockers: [], phaseGaps: [] } }}
      workflow={{ canGenerateManualTestPack: true, manualTestsCompletedAt: "2026-01-01T12:00:00Z" } as never} />);
    expect(screen.getByRole("button", { name: "Manual tests complete" }).classList.contains("validation-action-complete")).toBe(true);
    expect(props.onGenerate).not.toHaveBeenCalled();
    expect(props.onRecordResult).not.toHaveBeenCalled();
  });
  it.each(["pending", "failed", "stale"])("does not show a complete passing execution summary for %s evidence", async (state) => {
    render(<ManualTestVerificationPanel item={{ id: "item", externalId: "ITEM" } as WorkItemCard}
      workflow={{ canGenerateManualTestPack: true } as never} isPending={false} isDisabled={false}
      getArtifactUrl={vi.fn()} onGenerate={vi.fn()} onReview={vi.fn()} onRecordResult={vi.fn()}
      onFetchStatus={vi.fn().mockResolvedValue({ status: { state: state === "stale" ? "stale" : "current", currentPackId: "pack", isReady: false,
        isStale: state === "stale", failedCount: state === "failed" ? 1 : 0,
        manualCases: [{ id: "CASE-A", title: "Save", preconditions: [], steps: ["Open App"], expectedResult: "Saved",
          isReviewed: true, result: state === "pending" ? null : state === "failed" ? "fail" : "pass" }] } })} />);
    fireEvent.click(await screen.findByRole("button", { name: state === "stale" ? "Manual tests need regeneration" : "Manual test pack incomplete" }));
    expect(screen.queryByRole("button", { name: "1/1 manual tests passed" })).toBeNull();
    expect(screen.queryByText(/current manual tests have recorded passes/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Passed — CASE-A" })).toBeNull();
    expect((screen.getByRole("button", { name: "All tests passed" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("shows recorded passes in green while distinguishing unresolved coverage from missing test execution", async () => {
    render(<ManualTestVerificationPanel item={{ id: "item", externalId: "ITEM" } as WorkItemCard}
      workflow={{ canGenerateManualTestPack: true } as never} isPending={false} isDisabled={false}
      getArtifactUrl={vi.fn()} onGenerate={vi.fn()} onReview={vi.fn()} onRecordResult={vi.fn()}
      onFetchStatus={vi.fn().mockResolvedValue({ status: { state: "current", currentPackId: "pack", currentReviewId: "review", isReady: false,
        failedCount: 0, coverageIssues: ["AC-A: Save behaviour"], manualCases: [
          { id: "CASE-A", title: "Save", preconditions: [], steps: ["Open App"], expectedResult: "Saved", isReviewed: true, result: "pass" },
        ] } })} />);
    const open = await screen.findByRole("button", { name: "1/1 manual tests passed" });
    expect(open.classList.contains("validation-action-complete")).toBe(true);
    fireEvent.click(open);
    const passed = screen.getByRole("button", { name: "Passed — CASE-A" }) as HTMLButtonElement;
    expect(passed.classList.contains("validation-action-complete")).toBe(true);
    expect(passed.disabled).toBe(true);
    expect(screen.getByText("All 1 current manual tests have recorded passes.")).toBeDefined();
    expect((screen.getByRole("button", { name: "All tests passed" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Coverage is unresolved, not a recorded test failure/)).toBeDefined();
  });
  it("keeps every action outside collapsed guidance, coverage and test instructions", async () => {
    const item = { id: "item", externalId: "ITEM" } as WorkItemCard;
    const onReview = vi.fn();
    const onRecordResult = vi.fn();
    render(<ManualTestVerificationPanel item={item} workflow={{ canGenerateManualTestPack: true } as never}
      isPending={false} isDisabled={false} getArtifactUrl={vi.fn()} onGenerate={vi.fn()} onReview={onReview} onRecordResult={onRecordResult}
      onFetchStatus={vi.fn().mockResolvedValue({ status: { state: "current", currentPackId: "pack", currentReviewId: "review", isReady: false,
        coverageIssues: ["An uncovered criterion"], manualCases: [
          { id: "CASE-A", title: "Save", preconditions: ["App installed"], steps: ["Open App"], expectedResult: "Saved", isReviewed: false },
          { id: "CASE-B", title: "Cancel", preconditions: ["App installed"], steps: ["Open App"], expectedResult: "Cancelled", isReviewed: true },
        ] } })} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Manual test pack incomplete" })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Manual test pack incomplete" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelectorAll("details")).toHaveLength(4);
    expect(dialog.querySelectorAll("details[open]")).toHaveLength(0);
    expect(dialog.querySelectorAll("details button")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "I reviewed CASE-A" })).toBeDefined();
    expect(screen.getByRole("button", { name: "I ran CASE-B — passed" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Record failure for CASE-B" })).toBeDefined();
    fireEvent.click(screen.getAllByText("Prerequisites and steps — 1 step", { selector: "summary" })[0]!);
    expect(onReview).not.toHaveBeenCalled();
    expect(onRecordResult).not.toHaveBeenCalled();
  });
  it("specifies four work-item-identity-blind verification behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("offers generation for missing evidence through the production panel", async () => {
    const item = { id: "item", externalId: "ITEM" } as WorkItemCard;
    const workflow = {
      canGenerateManualTestPack: true,
      manualTestsCompletedAt: null,
    } as NonNullable<WorkItemCard["featureWorkflow"]>;
    render(
      <ManualTestVerificationPanel
        getArtifactUrl={vi.fn()}
        isDisabled={false}
        isPending={false}
        item={item}
        onFetchStatus={vi.fn().mockResolvedValue({ status: { message: "No pack", state: "missing" } })}
        onGenerate={vi.fn()}
        onRecordResult={vi.fn()}
        onReview={vi.fn()}
        workflow={workflow}
      />,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Manual tests" })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Manual tests" }));
    expect(screen.getByRole("button", { name: "Generate test pack" })).toBeDefined();
  });

  it("keeps a failed generation reason visible inside the verification dialog", async () => {
    const item = { id: "item", externalId: "ITEM" } as WorkItemCard;
    const workflow = {
      canGenerateManualTestPack: true,
      manualTestsCompletedAt: null,
    } as NonNullable<WorkItemCard["featureWorkflow"]>;
    render(
      <ManualTestVerificationPanel
        getArtifactUrl={vi.fn()}
        isDisabled={false}
        isPending={false}
        item={item}
        onFetchStatus={vi.fn().mockResolvedValue({ status: { message: "No pack", state: "missing" } })}
        onGenerate={vi.fn().mockRejectedValue(new Error("No acceptance criteria or test scenarios found."))}
        onRecordResult={vi.fn()}
        onReview={vi.fn()}
        workflow={workflow}
      />,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Manual tests" })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Manual tests" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate test pack" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(
      "No acceptance criteria or test scenarios found.",
    ));
  });
});
