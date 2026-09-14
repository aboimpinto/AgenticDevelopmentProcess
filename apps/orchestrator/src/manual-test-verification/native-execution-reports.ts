import { SaxesParser } from "saxes";
import { executionDisplayIdentities } from "./execution-display-identities.js";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const nonempty = (value: unknown): value is string => typeof value === "string" && !!value.trim();
function requireEvidence(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function complete(identities: string[], total: unknown) {
  requireEvidence(identities.length > 0 && identities.length === total && new Set(identities).size === identities.length, "Executed identities do not match unique non-zero report totals.");
  return { count: identities.length, identities };
}

/** Native JSON reporter, not --list output or expected failures masquerading as passes. */
export function parsePlaywrightReport(report: Record<string, unknown>) {
  const stats = object(report.stats), identities: string[] = [];
  requireEvidence(Array.isArray(report.errors) && !report.errors.length && Array.isArray(report.suites), "Playwright report is incomplete or has global errors.");
  requireEvidence(stats.unexpected === 0 && stats.flaky === 0 && stats.skipped === 0, "Playwright run contains failed, flaky or skipped tests.");
  function suite(raw: unknown, parents: string[], depth: number) {
    requireEvidence(depth < 128, "Playwright suite nesting exceeds the evidence limit.");
    const item = object(raw);
    requireEvidence(nonempty(item.title) && Array.isArray(item.specs), "Playwright suite identity or specs are missing.");
    const titles = [...parents, item.title];
    for (const rawSpec of item.specs) {
      const spec = object(rawSpec);
      requireEvidence(spec.ok === true && nonempty(spec.title) && nonempty(spec.file) && Array.isArray(spec.tests) && spec.tests.length, "Playwright spec has no complete passing executions.");
      for (const rawTest of spec.tests) {
        const test = object(rawTest);
        requireEvidence(test.expectedStatus === "passed" && test.status === "expected" && Array.isArray(test.results) && test.results.length === 1, "Playwright test did not execute once with an unqualified passing outcome.");
        const result = object(test.results[0]);
        requireEvidence(result.status === "passed" && result.retry === 0 && typeof result.duration === "number" && Number.isFinite(result.duration) && result.duration >= 0 && nonempty(result.startTime) && Number.isFinite(Date.parse(result.startTime)) && Array.isArray(result.errors) && !result.errors.length && !result.error, "Playwright execution result is missing, retried or failed.");
        requireEvidence(typeof test.projectName === "string" && Number.isSafeInteger(spec.line) && Number(spec.line) > 0 && Number.isSafeInteger(spec.column) && Number(spec.column) > 0, "Playwright project or source location is missing.");
        const project = typeof test.projectId === "string" ? test.projectId : test.projectName;
        identities.push(`${spec.file}:${spec.line}:${spec.column} [${project}]: ${[...titles, spec.title].join(" > ")}`);
      }
    }
    requireEvidence(item.suites === undefined || Array.isArray(item.suites), "Playwright child suites are invalid.");
    for (const child of item.suites as unknown[] ?? []) suite(child, titles, depth + 1);
  }
  for (const entry of report.suites) suite(entry, [], 0);
  return complete(identities, stats.expected);
}

/** Streaming, namespace-aware TRX reader. No DTD, entities, external reads or prose inference. */
export function parseTrxReport(content: string) {
  const namespace = "http://microsoft.com/schemas/VisualStudio/TeamTest/2010";
  const parser = new SaxesParser({ xmlns: true });
  const path: string[] = [], results: Record<string, string>[] = [];
  const definitions = new Map<string, { execution?: string; className?: string; method?: string; assembly?: string }>();
  let definition: { execution?: string; className?: string; method?: string; assembly?: string } | undefined;
  let counters: Record<string, string> | undefined, summary: string | undefined, roots = 0, nodes = 0;
  parser.on("doctype", () => { throw new Error("TRX DTD declarations are not accepted."); });
  parser.on("error", () => { throw new Error("Malformed TRX XML; restore the complete reporter artifact."); });
  parser.on("opentag", tag => {
    requireEvidence(++nodes <= 200_000 && path.length < 128, "TRX structure exceeds the evidence limit.");
    requireEvidence(tag.uri === namespace, "Unsupported TRX namespace.");
    path.push(tag.local);
    const location = path.join("/"), attributes: Record<string, string> = {};
    for (const attr of Object.values(tag.attributes)) if (!attr.uri) attributes[attr.local] = attr.value;
    if (path.length === 1) { requireEvidence(tag.local === "TestRun", "TRX root must be TestRun."); roots++; }
    if (location === "TestRun/Results/UnitTestResult") results.push(attributes);
    if (location === "TestRun/TestDefinitions/UnitTest") {
      requireEvidence(nonempty(attributes.id) && !definitions.has(attributes.id), "TRX test definition is missing or duplicated.");
      definition = {}; definitions.set(attributes.id, definition);
    }
    if (location === "TestRun/TestDefinitions/UnitTest/Execution") {
      requireEvidence(definition && !definition.execution && nonempty(attributes.id), "TRX definition execution is missing or duplicated.");
      definition.execution = attributes.id;
    }
    if (location === "TestRun/TestDefinitions/UnitTest/TestMethod") {
      requireEvidence(definition && !definition.method && nonempty(attributes.className) && nonempty(attributes.name), "TRX method identity is missing or duplicated.");
      definition.className = attributes.className; definition.method = attributes.name;
      definition.assembly = attributes.codeBase;
    }
    if (location === "TestRun/ResultSummary") {
      requireEvidence(summary === undefined && ["Completed", "Passed"].includes(attributes.outcome ?? ""), "TRX summary is incomplete or failed.");
      summary = attributes.outcome;
    }
    if (location === "TestRun/ResultSummary/Counters") {
      requireEvidence(!counters, "Duplicate TRX counters."); counters = attributes;
    }
    requireEvidence(!["ErrorInfo", "RunInfo"].includes(tag.local), "TRX contains execution error or run diagnostics; inspect the report before linking it.");
  });
  parser.on("closetag", () => { if (path.join("/") === "TestRun/TestDefinitions/UnitTest") definition = undefined; path.pop(); });
  parser.write(content).close();
  requireEvidence(roots === 1 && summary && counters, "TRX results or summary are missing.");
  for (const key of ["total", "executed", "passed"]) requireEvidence(/^\d+$/.test(counters[key] ?? "") && Number(counters[key]) === results.length, "TRX executed totals do not match results.");
  for (const [key, value] of Object.entries(counters)) if (!["total", "executed", "passed"].includes(key)) requireEvidence(/^0+$/.test(value), "TRX has non-passing or incomplete outcomes.");
  const executions = new Set<string>();
  const identities = results.map(result => {
    const test = definitions.get(result.testId ?? "");
    requireEvidence(result.outcome === "Passed" && nonempty(result.testName) && nonempty(result.executionId) && !executions.has(result.executionId) && test?.execution === result.executionId && test.className && test.method, "TRX result is not a unique passing execution bound to a test method.");
    executions.add(result.executionId);
    return `${test.assembly ? `[assembly ${JSON.stringify(test.assembly)}] ` : ""}${test.className}.${test.method}: ${result.testName}`;
  });
  requireEvidence(definitions.size === results.length, "TRX test definitions include unexecuted or unmatched tests.");
  return complete(executionDisplayIdentities(identities, results.map(result => result.executionId!)), Number(counters.total));
}
