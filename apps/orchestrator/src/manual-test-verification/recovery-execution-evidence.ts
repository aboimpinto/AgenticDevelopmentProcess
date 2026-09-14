import { decodeExecutionReceipt } from "./execution-receipt-contract.js";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import type { AutomatedEvidenceSummary } from "../manual-test-verification-types.js";
import { parsePlaywrightReport, parseTrxReport } from "./native-execution-reports.js";
import { assertExecutionReceiptBinding, type ExecutionReceiptScope } from "./execution-receipt-binding.js";
import { verifiedLinkedRevisionClaim } from "./receipt-linked-revisions.js";
import { executionDisplayIdentities } from "./execution-display-identities.js";
export type { ExecutionReceiptScope } from "./execution-receipt-binding.js";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const within = (root: string, path: string) => { const part = relative(root, path); return part === "" || (!part.startsWith(`..${sep}`) && part !== ".." && !isAbsolute(part)); };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const parseJson = (value: string): unknown => { try { return JSON.parse(value); } catch { throw new Error("Malformed JSON evidence; restore a valid reporter artifact."); } };

/** Shared phase/repair/Refresh import. Never records human acceptance or fabricates execution. */
export function readRecoveryExecutionEvidence(folder: string, projectRoot: string, featureId: string, scope?: ExecutionReceiptScope) {
  const evidence: AutomatedEvidenceSummary[] = [], diagnostics: string[] = [], fingerprints: string[] = [];
  const attempts = new Map<string, { timestamp: number | null; id?: string }[]>();
  const directory = scope ? resolve(scope.directory) : resolve(folder, "verification");
  if (!existsSync(directory)) return { evidence, diagnostics: scope ? ["Current run verification receipt is missing; historical passes cannot substitute."] : diagnostics, fingerprint: digest(JSON.stringify(scope ?? "")) };
  const roots = (scope ? [directory] : [folder, projectRoot, tmpdir()]).filter(existsSync).map(path => realpathSync(path));
  let remainingBytes = 40_000_000;
  const read = (path: string, maxBytes: number) => {
    if (!/\.(?:json|trx|log|txt)$/i.test(path) || lstatSync(path).isSymbolicLink()) throw new Error("Report must be a regular JSON/TRX/log/text file, not a symlink.");
    const real = realpathSync(path), stat = lstatSync(real);
    if (!roots.some(root => within(root, real)) || !stat.isFile() || stat.size > maxBytes || stat.size > remainingBytes) throw new Error("Report is outside the allowed project/feature/temp roots or exceeds the evidence size limit.");
    remainingBytes -= stat.size;
    const content = readFileSync(real, "utf8");
    fingerprints.push(`${path}:${digest(content)}`);
    return content;
  };
  // Only this documented receipt directory is scanned; unrelated JSON and private files are not evidence.
  if (lstatSync(directory).isSymbolicLink() || (!scope && !within(realpathSync(folder), realpathSync(directory)))) throw new Error("Verification receipts must be inside the feature.");
  const paths = scope ? ["receipt.json"] : readdirSync(directory).filter(name => extname(name) === ".json").sort();
  if (paths.length > 100) throw new Error("Too many verification receipts; archive obsolete receipts before refreshing.");
  for (const name of paths) {
    try {
      const receipt = object(decodeExecutionReceipt(read(resolve(directory, name), 1_000_000)));
      if (receipt.schema !== "phase-verification-receipt/v1") {
        if (scope) throw new Error("Invalid current run verification receipt schema.");
        continue;
      }
      if (receipt.feature !== featureId || !Array.isArray(receipt.checks) || receipt.checks.length > 100) throw new Error("Receipt feature identity or check list is invalid.");
      if (scope) assertExecutionReceiptBinding(receipt, featureId, scope);
      const receiptReports = new Set<string>();
      for (const [index, raw] of receipt.checks.entries()) {
        const check = object(raw), label = `${name} check ${index + 1} (${String(check.kind ?? "unnamed").slice(0, 120)})`;
        const timestamp = typeof receipt.verifiedAt === "string" ? Date.parse(receipt.verifiedAt) : NaN;
        const attempt: { timestamp: number | null; id?: string } = { timestamp: Number.isFinite(timestamp) ? timestamp : null };
        const key = JSON.stringify([check.id ?? check.kind ?? check.command, check.cwd]);
        attempts.set(key, [...attempts.get(key) ?? [], attempt]);
        try {
          const command = typeof check.command === "string" ? check.command : "";
          if (!command || command.length > 10_000 || check.exitCode !== 0 || check.success !== true) throw new Error("No successful command execution was recorded.");
          // The inspected kind is authoritative when bound; legacy named kinds remain tests.
          const kind = scope ? scope.checks.find(c => c.id === check.id)?.kind : check.kind;
          const nonTest = ["static", "preparation", "discovery"].includes(String(kind));
          if (!nonTest && /(?:^|\s)--(?:list(?:Tests)?|list-tests|collect-only)(?:\s|=|$)/i.test(command)) throw new Error("Discovery is not execution; supply an executed machine report, not another discovery run.");
          if (/(?:^|\s)--no-build(?:\s|=|$)/i.test(command)) throw new Error("Prebuilt binary-to-source provenance is unavailable. Reuse an existing source-built run with a checksum-bound identity report; a current HEAD or aggregate console pass cannot establish the binary's tested source.");
          if (typeof check.cwd !== "string" || !check.cwd.trim()) throw new Error("Execution working directory is missing.");
          // Legacy receipts separate client/server revisions. Bind the client fallback to its actual root,
          // never choose an arbitrary revision from a multi-repository receipt.
          const clientCwd = check.cwd === basename(projectRoot) || resolve(projectRoot, check.cwd) === resolve(projectRoot);
          const revision = check.testedRevision ?? check.revision ?? receipt.testedRevision ?? (clientCwd ? receipt.clientRevision : undefined);
          // Legacy workers sometimes record an explicit working-tree baseline plus dirty-state
          // qualifications. Preserve that entire claim; never reinterpret it as a clean commit.
          const workingTree = typeof revision === "string" && revision.length <= 2000 && (/\bworking[ -]tree\s*@\s*[a-f\d]{7,40}\b/i.test(revision) || /^[a-f\d]{7,40}\s*@\s*working[ -]tree\b/i.test(revision) || /^[a-f\d]{7,40}\s+\+\s+.+\bworking[ -]tree\b/i.test(revision)) && [...revision.matchAll(/\b[a-f\d]{7,40}\b/gi)].length === 1;
          if (!nonTest && (typeof revision !== "string" || (!/^[a-f\d]{7,40}$/i.test(revision) && !workingTree && !verifiedLinkedRevisionClaim(revision, check.id, scope)))) throw new Error("An unambiguous tested revision is missing. Record a commit hash, or an explicit working tree @ hash with its source-state qualifications.");
          const reports: { path: string; hash: string; auditOnly: boolean }[] = [];
          if (check.reports !== undefined) {
            if (!Array.isArray(check.reports) || !check.reports.length || check.reports.length > 100) throw new Error("reports must be a bounded nonempty array of native report bindings.");
            if (["reportPath", "reportSha256", "extraPath", "extraSha256", "extraReportPath", "extraReportSha256"].some(key => check[key] !== undefined)) throw new Error("Do not mix reports with legacy native report bindings.");
            for (const raw of check.reports) {
              const binding = object(raw);
              if (typeof binding.path !== "string" || !binding.path.trim() || typeof binding.sha256 !== "string" || !/^[a-f\d]{64}$/i.test(binding.sha256)) throw new Error("A report path and SHA-256 binding are required for every supplied report.");
              reports.push({ path: isAbsolute(binding.path) ? binding.path : resolve(directory, binding.path), hash: binding.sha256.toLowerCase(), auditOnly: false });
            }
          }
          if (check.artifacts !== undefined) {
            if (!Array.isArray(check.artifacts) || !check.artifacts.length || check.artifacts.length > 100) throw new Error("artifacts must be a bounded nonempty array of supporting artifact bindings.");
            for (const raw of check.artifacts) {
              const binding = object(raw);
              if (typeof binding.path !== "string" || !binding.path.trim() || typeof binding.sha256 !== "string" || !/^[a-f\d]{64}$/i.test(binding.sha256)) throw new Error("A supporting artifact path and SHA-256 binding are required.");
              reports.push({ path: isAbsolute(binding.path) ? binding.path : resolve(directory, binding.path), hash: binding.sha256.toLowerCase(), auditOnly: true });
            }
          }
          for (const prefix of ["report", "extra", "log"]) {
            const alias = prefix === "extra" ? "extraReport" : prefix;
            if (alias !== prefix && check[`${prefix}Path`] !== undefined && check[`${alias}Path`] !== undefined && (check[`${prefix}Path`] !== check[`${alias}Path`] || check[`${prefix}Sha256`] !== check[`${alias}Sha256`])) throw new Error("Conflicting supplemental report bindings; use one path and checksum pair.");
            const path = check[`${prefix}Path`] ?? check[`${alias}Path`], hash = check[`${prefix}Sha256`] ?? check[`${alias}Sha256`];
            if (path === undefined) continue;
            if (typeof path !== "string" || typeof hash !== "string" || !/^[a-f\d]{64}$/i.test(hash)) throw new Error("A report path and SHA-256 binding are required for every supplied report.");
            reports.push({ path: isAbsolute(path) ? path : resolve(directory, path), hash: hash.toLowerCase(), auditOnly: prefix === "log" && (check.reportPath !== undefined || check.reports !== undefined) });
          }
          if (!reports.length) throw new Error("No checksum-bound execution report is available.");
          let total = 0;
          const identities: string[] = [], reportHashes: string[] = [], nativeHashes: string[] = [];
          const multipleNativeReports = reports.filter(report => !report.auditOnly).length > 1;
          for (const report of reports) {
            const content = read(report.path, 15_000_000), hash = digest(content);
            if (hash !== report.hash) throw new Error("Execution report checksum has changed; restore the matching report or publish a new receipt.");
            if (!reportHashes.includes(hash)) reportHashes.push(hash);
            if (report.auditOnly || nonTest) continue; // process/audit logs never count as tests; silent successful commands are valid
            nativeHashes.push(hash);
            const parsed = parseExecutedReport(content);
            total += parsed.count;
            // Report hashes and native validation bind execution. Display names
            // can repeat between assemblies/projects; never merge those reports.
            identities.push(...parsed.identities.map(identity => multipleNativeReports
              ? `[report ${hash}] ${identity}` : identity));
          }
          if (nonTest) {
            if (check.tests !== 0 || check.passed !== 0 || check.failed !== 0) throw new Error("Non-test checks require zero claimed tests; process success cannot certify coverage.");
            continue;
          }
          if (!count(check.tests) || !total || check.tests !== total || check.passed !== total || check.failed !== 0) throw new Error("Receipt counts do not match non-zero passing report results.");
          if (new Set(nativeHashes).size !== nativeHashes.length) throw new Error("Repeated reports cannot be added together as separate executions.");
          const reportKey = JSON.stringify([check.cwd, [...nativeHashes].sort()]);
          if (receiptReports.has(reportKey)) throw new Error("Duplicate report cannot count as separate checks; share the execution in the scope plan.");
          receiptReports.add(reportKey);
          const id = `receipt-${digest(JSON.stringify([command, check.cwd, revision, reportHashes])).slice(0, 24)}`;
          attempt.id = id;
          if (evidence.some(entry => entry.id === id)) continue; // repeated receipts are not additional tests
          evidence.push({ id, title: String(check.id ?? check.kind ?? "Executed tests"), status: "executed-passed", command,
            sourcePath: reports[0]!.path,
            executionIdentities: identities,
            verifiedExecution: { schema: "verified-execution/v1", testedRevision: (revision as string).match(/\b[a-f\d]{7,40}\b/i)![0], sourceState: revision as string, executedCount: total, reportHashes },
            detail: `${total} tests executed and passed; tested revision: ${revision}; cwd: ${check.cwd}. Checksum-verified reports: ${reports.map(report => report.hash).join(", ")}. Recorded tree state: ${String(receipt.treeState ?? "unspecified").slice(0, 2000)}. This is historical execution, not proof of a clean/current HEAD or full criterion coverage. The complete executed identity index is supplied separately.` });
        } catch (error) {
          diagnostics.push(`${label}: ${error instanceof Error ? error.message : "Invalid execution evidence."}`);
          fingerprints.push(`${label}:rejected:${diagnostics.at(-1)}`);
        }
      }
    } catch (error) {
      diagnostics.push(`${name}: ${error instanceof Error ? error.message : "Unreadable receipt."}`);
      fingerprints.push(`${name}:rejected:${diagnostics.at(-1)}`);
    }
  }
  const allowed = new Set<string>();
  for (const group of attempts.values()) {
    const timestamp = Math.max(...group.map(attempt => attempt.timestamp ?? -Infinity));
    // Without ordering evidence, a conflicting failed/unverifiable attempt must not be
    // silently hidden by an older pass. Equal-time conflicting reports are ambiguous too.
    const latest = group.filter(attempt => attempt.timestamp === null || attempt.timestamp === timestamp);
    if (latest.some(attempt => !attempt.id) || new Set(latest.map(attempt => attempt.id)).size !== 1) {
      if (latest.some(attempt => attempt.id)) diagnostics.push("Conflicting or unordered outcomes for an execution check were excluded. Publish an unambiguous dated receipt before linking that evidence.");
      continue;
    }
    allowed.add(latest[0]!.id!);
  }
  return { evidence: evidence.filter(entry => allowed.has(entry.id)), diagnostics: diagnostics.length > 100 ? [`${diagnostics.length - 100} earlier receipt diagnostics omitted; omitted evidence cannot establish coverage.`, ...diagnostics.slice(-100)] : diagnostics, fingerprint: digest(fingerprints.sort().join("\n")) };
}

/** Read machine-reporter outcomes, not a worker's prose or receipt-level success flag. */
export function parseExecutedReport(content: string): { count: number; identities: string[] } {
  if (content.trimStart().startsWith("<")) return parseTrxReport(content);
  if (content.trimStart().startsWith("{")) {
    const report = object(parseJson(content));
    if (Array.isArray(report.suites) || report.stats !== undefined) return parsePlaywrightReport(report);
    if (report.success !== true || !count(report.numTotalTests) || report.numTotalTests === 0 || report.numPassedTests !== report.numTotalTests || report.numFailedTests !== 0 || report.numPendingTests !== 0 || !Array.isArray(report.testResults)) throw new Error("JSON reporter does not prove non-zero, entirely passing execution.");
    const assertions = report.testResults.flatMap(raw => {
      const suite = object(raw);
      if (suite.status !== "passed" || !Array.isArray(suite.assertionResults)) throw new Error("Suite results are incomplete or failed.");
      return suite.assertionResults.map(rawAssertion => {
        const assertion = object(rawAssertion);
        if (assertion.status !== "passed" || typeof assertion.fullName !== "string" || !assertion.fullName.trim()) throw new Error("Executed test identity or passing outcome is missing.");
        return `${String(suite.name ?? "")}: ${assertion.fullName}`;
      });
    });
    if (assertions.length !== report.numTotalTests) throw new Error("Executed assertion records do not match the report count.");
    return { count: assertions.length, identities: executionDisplayIdentities(assertions) };
  }
  // Cargo's reporter emits one terminal result per test binary, including empty doc-test binaries.
  const results = [...content.matchAll(/^test result: (ok|FAILED)\. (\d+) passed; (\d+) failed; (\d+) ignored;/gm)];
  const identities = [...content.matchAll(/^test (.+) \.\.\. ok\s*$/gm)].map(match => match[1]!);
  const passed = results.reduce((sum, match) => sum + Number(match[2]), 0);
  if (!results.length || !passed || results.some(match => match[1] !== "ok" || Number(match[3]) || Number(match[4])) || identities.length !== passed) throw new Error("Unsupported reporter or no verifiable, non-zero passing execution. Publish a JSON test report with executed assertion identities.");
  return { count: passed, identities: executionDisplayIdentities(identities) };
}
