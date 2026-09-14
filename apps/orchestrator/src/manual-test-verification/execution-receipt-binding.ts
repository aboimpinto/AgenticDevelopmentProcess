import { bindVerificationOutputDirectory } from "./verification-output-directory.js";
import { receiptCommandMatches } from "./receipt-command-binding.js";

/** Invocation binding shared by the producer and the read-only evidence importer. */
export interface ExecutionReceiptScope {
  directory: string;
  runId: string;
  startedAt?: string;
  checks: readonly { id: string; cwd: string; command: string; kind?: string; configurationFiles?: readonly string[] }[];
}

export function assertExecutionReceiptBinding(receipt: Record<string, unknown>, featureId: string, scope: ExecutionReceiptScope): void {
  if (receipt.schema !== "phase-verification-receipt/v1" || receipt.feature !== featureId) throw new Error("Receipt schema or feature identity is invalid.");
  // Correlation metadata is optional. An explicit conflicting claim is different
  // from an absent ID; neither an ID nor its automatic addition proves execution.
  if (receipt.runId != null && receipt.runId !== "" && receipt.runId !== scope.runId)
    throw new Error("Receipt runId does not match the current invocation.");
  // Worker-authored verifiedAt is audit metadata, not an admission gate. Keep
  // validation independent of the wall clock; execution uses the owned run
  // directory, selected checks, source guards and checksum-bound native reports.
  if (!Array.isArray(receipt.checks) || receipt.checks.length > 100 || receipt.checks.length !== scope.checks.length)
    throw new Error("Receipt must account for every selected check exactly once.");
  const seen = new Set<string>();
  for (const raw of receipt.checks) {
    const check = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const selected = scope.checks.find(c => c.id === check.id);
    if (!selected || seen.has(selected.id)) throw new Error("Receipt contains an unknown or duplicate check ID.");
    if (check.cwd !== selected.cwd) throw new Error(`Receipt check ${selected.id}: cwd does not match the inspected execution plan.`);
    if (receipt.schemaVersion === "hepha-exchange/v1" && check.kind !== (selected.kind ?? "test")) throw new Error(`Receipt check ${selected.id}: kind does not match the inspected execution plan.`);
    const nativePaths = [check.reportPath, check.extraPath, check.extraReportPath,
      ...(Array.isArray(check.reports) ? check.reports.map(r => r?.path) : [])].filter((p): p is string => typeof p === "string" && !!p.trim());
    const nonTest = ["static", "preparation", "discovery"].includes(selected.kind ?? "test");
    // Some native runners emit their machine-readable result on stdout. That
    // report remains subject to the importer's checksum/count/identity checks.
    const stdoutReport = check.logPath === undefined && typeof check.reportPath === "string" && /\.(?:log|txt)$/i.test(check.reportPath);
    const logPath = stdoutReport ? check.reportPath : check.logPath;
    const logHash = stdoutReport ? check.reportSha256 : check.logSha256;
    const capture = typeof logPath === "string" && typeof logHash === "string" && /^[a-f\d]{64}$/i.test(logHash)
      ? { directory: scope.directory, logPath, nativePaths, nonTest, nativeStdout: stdoutReport } : undefined;
    if (!receiptCommandMatches(check.command, bindVerificationOutputDirectory(selected.command, scope.directory), selected.cwd, capture))
      throw new Error(`Receipt check ${selected.id}: command does not match the inspected execution plan.`);
    seen.add(selected.id);
  }
}
