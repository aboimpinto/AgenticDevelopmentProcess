// Behavior suite: ui requirement design.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const mappers = readFileSync(resolve(root, "web/src/workflow/workflow-mappers.ts"), "utf8");
const presentation = readFileSync(resolve(root, "web/src/workflow/workflow-presentation.ts"), "utf8");
const controls = readFileSync(resolve(root, "web/src/workflow/lifecycle-controls-panel.tsx"), "utf8");
const focusedInteractionTests = readFileSync(resolve(root, "web/src/workflow/workflow-interaction-panel.test.tsx"), "utf8");

// FEAT-055/056 moved workflow policy and rendering out of app-shell.tsx.
// Keep this contract at the owning modules; interaction behavior is covered by
// workflow-interaction-panel.test.tsx.
describe("Dashboard — UI requirement contract", () => {
  it("maps UI requirement actions from authoritative workflow availability", () => {
    expect(mappers).toContain('descriptor("create-ui-requirements", "Create UI Requirements", !!workflow.canCreateUiRequirements');
    expect(mappers).toContain('descriptor("refine-feature", "Refine Feature", !!workflow.canRefineFeature');
  });

  it("renders lifecycle descriptors without re-evaluating policy", () => {
    expect(controls).toContain("disabled={!action.available || action.busy || action.completed}");
    expect(controls).toContain("title={action.reason ?? action.label}");
  });

  it("derives UI and design recovery from readiness reasons", () => {
    expect(presentation).toContain('r.code === "ui_requirement_unknown"');
    expect(presentation).toContain('r.code === "missing_design_artifacts"');
    expect(presentation).toContain('workflow.uiRequirementDecision === "requires_ui"');
  });

  it("keeps the no-UI refinement behavior covered by the focused interaction test", () => {
    expect(focusedInteractionTests).toContain('uiRequirementDecision: "no_ui"');
    expect(focusedInteractionTests).toContain('uiRequirementReason: "No UI requirements are needed. The FEAT can be refined."');
    expect(focusedInteractionTests).toContain('getByRole("button", { name: "Refine Feature" })');
  });
});
