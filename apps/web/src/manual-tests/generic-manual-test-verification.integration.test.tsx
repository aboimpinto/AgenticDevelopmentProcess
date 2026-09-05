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
