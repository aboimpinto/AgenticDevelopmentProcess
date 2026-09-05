import { describe, expect, it } from "vitest";
import { WorkflowConsoleSummaryPresenter } from "../src/application/workflow-console/workflow-console-summary-presenter.js";

describe("workflow console summary presenter", () => {
  it("reports when no console evidence exists", () => {
    const presenter = new WorkflowConsoleSummaryPresenter((runId) => ({ files: [], refreshedAt: "now", runId }));
    expect(presenter.render("workflow-empty")).toBe("No workflow console files were found for this run.");
  });

  it("renders ordered file evidence and bounds retained content", () => {
    const presenter = new WorkflowConsoleSummaryPresenter((runId) => ({
      files: [{
        content: "x".repeat(6_100),
        name: "worker.log",
        path: "/tmp/worker.log",
        truncated: true,
        updatedAt: "2026-07-21T00:00:00.000Z",
      }],
      refreshedAt: "now",
      runId,
    }));
    const summary = presenter.render("workflow-output");
    expect(summary).toContain("### worker.log");
    expect(summary).toContain("Note: content is truncated");
    expect(summary).toContain("Updated: 2026-07-21T00:00:00.000Z");
    expect(summary.endsWith("…")).toBe(true);
    expect(summary.length).toBeLessThan(6_200);
  });

  it("turns console read failures into diagnostic evidence", () => {
    const presenter = new WorkflowConsoleSummaryPresenter(() => { throw new Error("unavailable"); });
    expect(presenter.render("workflow-failed")).toBe("Unable to read workflow console files: unavailable");
  });
});
