import { decodeExecutionReceipt, executionReceiptExchange } from "./execution-receipt-contract.js";
import { bindVerificationOutputDirectory } from "./verification-output-directory.js";
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeFileAtomic } from "./artifact-storage.js";
import { assertExecutionReceiptBinding, type ExecutionReceiptScope } from "./execution-receipt-binding.js";

/** HEPHA owns invocation metadata. Worker outcomes still require the shared importer. */
export class ExecutionReceiptProducer {
  private readonly directory: string;
  private readonly inode: number;
  constructor(projectRoot: string, private readonly featureId: string, private readonly scope: ExecutionReceiptScope) {
    this.directory = resolve(scope.directory);
    if (!/^[\w-]+$/.test(scope.runId) || this.directory !== resolve(projectRoot, ".hepha/verification-runs", scope.runId)
      || realpathSync(this.directory) !== resolve(realpathSync(projectRoot), ".hepha/verification-runs", scope.runId))
      throw new Error("Receipt producer requires the current project's owned run directory.");
    this.inode = lstatSync(this.directory).ino;
    if (existsSync(resolve(this.directory, "receipt.json"))) throw new Error("A receipt already exists before worker execution.");
    const checks = scope.checks.map(({ id, kind, cwd, command }) => ({ id, kind: kind ?? "test", cwd, command: bindVerificationOutputDirectory(command, this.directory) }));
    writeFileSync(resolve(this.directory, "receipt-context.json"), JSON.stringify({ schema: "phase-verification-receipt/v1", feature: featureId, runId: scope.runId, checks }), { flag: "wx" });
    writeFileSync(resolve(this.directory, "receipt-schema.json"), executionReceiptExchange.renderContract(), { flag: "wx" });
    writeFileSync(resolve(this.directory, "receipt-template.json"), JSON.stringify({
      schemaVersion: "hepha-exchange/v1", kind: "verification.execution.receipt", audit: { runId: scope.runId },
      payload: { feature: featureId, checks: checks.map(check => ({ ...check, testedRevision: null,
        success: null, exitCode: null, tests: null, passed: null, failed: null, reportPath: null, reportSha256: null })) },
    }, null, 2), { flag: "wx" });
  }

  finalize(): void {
    // Best-effort metadata enrichment, never an admission gate. The caller always
    // imports the resulting (or untouched) receipt with the shared evidence rules.
    try {
      if (lstatSync(this.directory).ino !== this.inode || realpathSync(this.directory) !== this.directory) return;
      const path = resolve(this.directory, "receipt.json"), stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_000_000) return;
      const raw = readFileSync(path, "utf8"), receipt = decodeExecutionReceipt(raw);
      assertExecutionReceiptBinding(receipt, this.featureId, this.scope);
      if (receipt.runId != null && receipt.runId !== "") return;
      writeFileSync(resolve(this.directory, "receipt.worker.json"), raw, { flag: "wx" });
      const original = JSON.parse(raw);
      writeFileAtomic(path, original.schemaVersion === "hepha-exchange/v1"
        ? executionReceiptExchange.encode(original.payload, { ...original.audit, runId: this.scope.runId })
        : JSON.stringify({ ...receipt, runId: this.scope.runId }));
    } catch { /* Optional correlation metadata cannot prevent evidence validation. */ }
  }
}
