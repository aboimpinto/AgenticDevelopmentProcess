import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readRecoveryExecutionEvidence } from "../src/manual-test-verification/recovery-execution-evidence.js";
import { trxReport } from "./native-execution-fixtures.js";

it("imports both configured repository revisions without accepting an unbound or ambiguous claim", () => {
  const root = mkdtempSync(join(tmpdir(), "receipt-linked-revision-"));
  try {
    const repo = (name: string) => {
      const path = join(root, name); mkdirSync(path); execFileSync("git", ["init", "-q", path]);
      execFileSync("git", ["-C", path, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", name]);
      writeFileSync(join(path, "runner.json"), "{}");
      return { path, head: execFileSync("git", ["-C", path, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() };
    };
    const client = repo("client"), backend = repo("backend"), directory = join(client.path, "run"); mkdirSync(directory);
    const content = trxReport(), reportPath = join(directory, "result.trx"); writeFileSync(reportPath, content);
    const command = "run-configured-tests", configurationFiles = ["runner.json", "../backend/runner.json"];
    const scope = { directory, runId: "current", checks: [{ id: "tests", kind: "test", cwd: client.path, command, configurationFiles }] };
    const check = { id: "tests", kind: "test", cwd: client.path, command, testedRevision: `working tree @ ${client.head} (client; also builds working tree @ ${backend.head} backend; both dirty)`,
      tests: 1, passed: 1, failed: 0, exitCode: 0, success: true, reportPath, reportSha256: createHash("sha256").update(content).digest("hex") };
    const read = () => {
      writeFileSync(join(directory, "receipt.json"), JSON.stringify({ schema: "phase-verification-receipt/v1", feature: "EXAMPLE", checks: [check] }));
      return readRecoveryExecutionEvidence(client.path, client.path, "EXAMPLE", scope);
    };
    expect(read().diagnostics).toEqual([]); expect(read().evidence).toHaveLength(1);
    for (const revision of [
      `${client.head} + qualified working-tree edits (client); ${backend.head} + qualified working-tree edits (backend)`,
      `${client.head} @ working tree (client); ${backend.head} @ working-tree (backend)`,
      `working tree @ ${client.head} (client); ${backend.head} + qualified working-tree edits (backend)`,
    ]) {
      check.testedRevision = revision;
      expect(read().diagnostics).toEqual([]);
      expect(read().evidence[0]!.verifiedExecution?.sourceState).toBe(revision);
      expect(read().evidence[0]!.verifiedExecution?.testedRevision).toBe(client.head);
    }
    configurationFiles.pop(); expect(read().evidence).toHaveLength(0);
    configurationFiles.push("../backend/runner.json");
    check.testedRevision = `working tree @ ${client.head} or working tree @ ${backend.head}`;
    expect(read().evidence).toHaveLength(0);
    check.testedRevision = `${client.head} + qualified working-tree edits; ${backend.head} + qualified working-tree edits; ${"f".repeat(40)} + qualified working-tree edits`;
    expect(read().evidence).toHaveLength(0);
    check.testedRevision = `${backend.head} + qualified working-tree edits; ${client.head} + qualified working-tree edits`;
    expect(read().evidence).toHaveLength(0);
    check.testedRevision = `working tree @ ${client.head}; also builds working tree @ ${"f".repeat(40)}`;
    expect(read().evidence).toHaveLength(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
