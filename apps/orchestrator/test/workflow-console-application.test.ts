import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowConsoleApplication } from "../src/application/workflow-console/workflow-console-application.js";

const cleanupPaths: string[] = [];
afterEach(() => {
  for (const path of cleanupPaths.splice(0)) rmSync(path, { force: true, recursive: true });
});

function fixture(activeRunIds: string[] = []) {
  const sessionDirectory = mkdtempSync(resolve(tmpdir(), "hepha-workflow-console-"));
  cleanupPaths.push(sessionDirectory);
  const application = new WorkflowConsoleApplication({
    activeRunIds: () => activeRunIds,
    now: () => new Date("2032-03-04T05:06:07.000Z"),
    sessionDirectory,
  });
  return { application, sessionDirectory };
}

describe("WorkflowConsoleApplication", () => {
  it("renders and promotes the newest non-prompt run file", () => {
    const target = fixture();
    const runId = "workflow-a1b2";
    const prompt = resolve(target.sessionDirectory, `${runId}-prompt.md`);
    const stream = resolve(target.sessionDirectory, `${runId}-stream.log`);
    writeFileSync(prompt, "prompt");
    writeFileSync(stream, "[tool_execution_start build]\n[tool_execution_end build]\n");
    utimesSync(prompt, new Date("2032-01-02"), new Date("2032-01-02"));
    utimesSync(stream, new Date("2032-01-01"), new Date("2032-01-01"));

    const result = target.application.read(runId);

    expect(result.refreshedAt).toBe("2032-03-04T05:06:07.000Z");
    expect(result.files[0]).toMatchObject({ kind: "stream", isPrimary: true });
    expect(result.files[0]?.content).toContain("Tool started: build");
    expect(result.files[1]).toMatchObject({ kind: "prompt", isPrimary: false });
  });

  it("tails oversized UTF-8 logs instead of loading their full prefix", () => {
    const target = fixture();
    const runId = "workflow-b2c3";
    const path = resolve(target.sessionDirectory, `${runId}-other.log`);
    writeFileSync(path, `${"ø".repeat(45_000)}TAIL`);

    const result = target.application.read(runId);

    expect(result.files[0]).toMatchObject({ truncated: true });
    expect(result.files[0]?.content).toContain("truncated to latest");
    expect(result.files[0]?.content).toContain("TAIL");
    expect(result.files[0]?.content).not.toContain("�");
  });

  it("preserves requested and active runs while deleting stale files", () => {
    const target = fixture(["workflow-acde"]);
    const kept = `${"workflow-a11"}-stream.log`;
    const active = `${"workflow-acde"}-stream.log`;
    const stale = `${"workflow-dead"}-stream.log`;
    for (const name of [kept, active, stale]) writeFileSync(resolve(target.sessionDirectory, name), name);

    const result = target.application.cleanup("workflow-a11");

    expect(result.keptFiles).toEqual(expect.arrayContaining([kept, active]));
    expect(result.deletedFiles).toEqual([stale]);
    expect(readFileSync(resolve(target.sessionDirectory, kept), "utf8")).toBe(kept);
  });

  it("rejects unscoped run identifiers for reads and cleanup", () => {
    const target = fixture();
    expect(() => target.application.read("../outside")).toThrow("Invalid workflow run id");
    expect(() => target.application.cleanup("outside")).toThrow("Invalid workflow run id");
  });
});
