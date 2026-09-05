import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appendPhaseExecutionAudit } from "../src/workflows/phases/phase-execution-audit.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe("appendPhaseExecutionAudit", () => {
  it("creates the log and writes only the operational event schema", () => {
    const rootPath = mkdtempSync(join(tmpdir(), "hepha-phase-audit-"));
    roots.push(rootPath);
    appendPhaseExecutionAudit({
      agent: "Worker", event: "phase_progress", model: "model", phaseNumber: 5, phaseTitle: "Any",
      project: { rootPath } as any, runId: "run", status: "implementing", workflowCommand: "start-implementing",
    }, () => "2026-07-21T00:00:00.000Z");

    const event = JSON.parse(readFileSync(join(rootPath, "logs", "phase-execution.jsonl"), "utf8"));
    expect(event).toEqual({
      agent: "Worker", event: "phase_progress", model: "model", occurredAt: "2026-07-21T00:00:00.000Z",
      phaseNumber: 5, phaseTitle: "Any", status: "implementing", workflowCommand: "start-implementing",
      workflowRunId: "run",
    });
    expect(event).not.toHaveProperty("prompt");
    expect(event).not.toHaveProperty("output");
    expect(event).not.toHaveProperty("credentials");
  });

  it("appends later attempts and omits an absent workflow command", () => {
    const rootPath = mkdtempSync(join(tmpdir(), "hepha-phase-audit-"));
    roots.push(rootPath);
    const input = { agent: "Worker", model: "model", phaseNumber: null, phaseTitle: null, project: { rootPath } as any, runId: "run" };
    appendPhaseExecutionAudit({ ...input, event: "pi_attempt_started", status: "running" });
    appendPhaseExecutionAudit({ ...input, event: "pi_attempt_finished", status: "completed" });
    const lines = readFileSync(join(rootPath, "logs", "phase-execution.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    expect(lines).toHaveLength(2);
    expect(lines[0]).not.toHaveProperty("workflowCommand");
    expect(lines.map((event) => event.event)).toEqual(["pi_attempt_started", "pi_attempt_finished"]);
  });
});
