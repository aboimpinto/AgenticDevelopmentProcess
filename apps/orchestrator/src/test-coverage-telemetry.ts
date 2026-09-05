import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import type { CoverageTelemetryDeclaration } from "./final-verification-types.js";
import type { TestCoverageAssessment, TestCoverageMetricSummary } from "@hepha/shared";

export interface ChangedLineCoverage {
  readonly file: string;
  readonly coveredLines: number;
  readonly executableLines: number;
  readonly percent: number;
}

export interface TestCoverageCheckMeasurement {
  readonly feature: TestCoverageMetricSummary;
  readonly overall: TestCoverageMetricSummary;
  readonly minimumPercent: number;
  readonly targetPercent: number;
}

export type TestCoverageGateDecision =
  | Readonly<{ kind: "passed"; summary: string; files: readonly ChangedLineCoverage[]; measurement: TestCoverageCheckMeasurement }>
  | Readonly<{ kind: "advisory"; summary: string; files: readonly ChangedLineCoverage[]; measurement: TestCoverageCheckMeasurement }>
  | Readonly<{ kind: "blocked"; summary: string; files: readonly ChangedLineCoverage[]; measurement: null }>;

/** Reads the StartFeature baseline used to define code introduced by this FEAT. */
export function selectCoverageBaseline(
  transitions: readonly { startCommit: string; rolledBack: boolean; transitionStatus: string }[],
): string | null {
  for (const entry of transitions) {
    const startCommit = entry.startCommit.trim();
    if (!entry.rolledBack
      && ["prerequisites_ready", "branch_ready", "folder_moving", "transition_completed"].includes(entry.transitionStatus)
      && /^[a-f0-9]{7,64}$/i.test(startCommit)) return startCommit;
  }
  return null;
}

/** Parses added/new line numbers from a zero-context unified Git diff. */
export function parseChangedLines(diff: string): Map<string, Set<number>> {
  const changed = new Map<string, Set<number>>();
  let file: string | null = null;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++ ")) {
      const candidate = line.slice(4).trim();
      file = candidate === "/dev/null" ? null : normalizePath(candidate.replace(/^b\//, ""));
      if (file && !changed.has(file)) changed.set(file, new Set());
      continue;
    }
    if (!file || !line.startsWith("@@")) continue;
    const match = /\+(\d+)(?:,(\d+))?/.exec(line);
    if (!match) continue;
    const start = Number.parseInt(match[1]!, 10);
    const count = match[2] === undefined ? 1 : Number.parseInt(match[2], 10);
    const lines = changed.get(file)!;
    for (let offset = 0; offset < count; offset += 1) lines.add(start + offset);
  }
  return changed;
}

/** Parses LCOV DA records into project-relative executable line hit counts. */
export function parseLcov(
  content: string,
  projectRoot: string,
  workingDirectory: string,
): Map<string, Map<number, number>> {
  const files = new Map<string, Map<number, number>>();
  let current: Map<number, number> | null = null;
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      const source = line.slice(3).trim();
      const absolute = isAbsolute(source) ? source : resolve(projectRoot, workingDirectory, source);
      const projectPath = normalizePath(relative(projectRoot, absolute));
      current = projectPath.startsWith("../") ? null : new Map<number, number>();
      if (current) files.set(projectPath, current);
      continue;
    }
    if (!current || !line.startsWith("DA:")) continue;
    const [lineNumber, hits] = line.slice(3).split(",", 2).map((value) => Number.parseInt(value, 10));
    if (Number.isFinite(lineNumber) && Number.isFinite(hits)) current.set(lineNumber!, hits!);
  }
  return files;
}

/** Measures changed executable lines and emits an advisory for scopes below the reference. */
export function evaluateChangedLineCoverage(input: {
  declaration: CoverageTelemetryDeclaration;
  changedLines: ReadonlyMap<string, ReadonlySet<number>>;
  lcov: ReadonlyMap<string, ReadonlyMap<number, number>>;
}): TestCoverageGateDecision {
  const overall = calculateMetric(
    [...input.lcov.entries()]
      .filter(([file]) => matchesAny(file, input.declaration.include)
        && !matchesAny(file, input.declaration.exclude))
      .flatMap(([, hits]) => [...hits.values()]),
    input.declaration.minimumPercent,
    input.declaration.targetPercent,
    "Overall project coverage",
  );
  const selected = [...input.changedLines.entries()]
    .filter(([file]) => matchesAny(file, input.declaration.include)
      && !matchesAny(file, input.declaration.exclude));
  if (selected.length === 0) {
    return {
      kind: "passed",
      files: [],
      measurement: createMeasurement(notApplicableMetric("This FEAT changed no matching executable production lines."), overall, input.declaration),
      summary: `FEAT test coverage: not applicable; no changed production files matched this report. Overall project coverage is ${formatMetricPercent(overall)}.`,
    };
  }

  const missingReports = selected.filter(([file]) => !input.lcov.has(file)).map(([file]) => file);
  if (missingReports.length > 0) {
    return {
      kind: "blocked",
      files: [],
      measurement: null,
      summary: `Test coverage could not be calculated: LCOV has no instrumentation record for changed production file(s): ${missingReports.join(", ")}.`,
    };
  }

  const files = selected.flatMap(([file, changed]) => {
    const hits = input.lcov.get(file)!;
    const executable = [...changed].filter((line) => hits.has(line));
    if (executable.length === 0) return [];
    const coveredLines = executable.filter((line) => (hits.get(line) ?? 0) > 0).length;
    return [{
      file,
      coveredLines,
      executableLines: executable.length,
      percent: roundPercent(coveredLines, executable.length),
    }];
  });
  if (files.length === 0) {
    return {
      kind: "passed",
      files,
      measurement: createMeasurement(notApplicableMetric("This FEAT changed no instrumented executable production lines."), overall, input.declaration),
      summary: `FEAT test coverage: not applicable; changed production files contain no instrumented executable lines. Overall project coverage is ${formatMetricPercent(overall)}.`,
    };
  }

  const belowMinimum = files.filter((file) => file.percent < input.declaration.minimumPercent);
  const covered = files.reduce((sum, file) => sum + file.coveredLines, 0);
  const executable = files.reduce((sum, file) => sum + file.executableLines, 0);
  const aggregate = roundPercent(covered, executable);
  let featureMetric = metricFromCounts(
    covered,
    executable,
    input.declaration.minimumPercent,
    input.declaration.targetPercent,
    "FEAT changed-line coverage",
  );
  if (belowMinimum.length > 0 && featureMetric.assessment !== "needs_improvement") {
    featureMetric = {
      ...featureMetric,
      assessment: "needs_improvement",
      comment: `FEAT changed-line coverage should increase because ${belowMinimum.length} changed production file(s) remain below the ${formatPercent(input.declaration.minimumPercent)} reference.`,
    };
  }
  const measurement = createMeasurement(featureMetric, overall, input.declaration);
  const targetState = files.every((file) => file.percent >= input.declaration.targetPercent)
    ? "target achieved"
    : `target ${formatPercent(input.declaration.targetPercent)} not yet achieved`;
  const fileSummary = files.map((file) => `${file.file} ${formatPercent(file.percent)} (${file.coveredLines}/${file.executableLines})`).join("; ");
  if (belowMinimum.length > 0) {
    return {
      kind: "advisory",
      files,
      measurement,
      summary: `FEAT test coverage advisory: changed-line coverage is ${formatPercent(aggregate)}; increase coverage toward the ${formatPercent(input.declaration.minimumPercent)} reference and ${formatPercent(input.declaration.targetPercent)} target. This percentage does not fail the phase. Overall project coverage is ${formatMetricPercent(overall)}. ${fileSummary}.`,
    };
  }
  return {
    kind: "passed",
    files,
    measurement,
    summary: `FEAT test coverage measured: changed-line coverage is ${formatPercent(aggregate)}; reference ${formatPercent(input.declaration.minimumPercent)}; ${targetState}. Overall project coverage is ${formatMetricPercent(overall)}. ${fileSummary}.`,
  };
}

/** Executes only the read-only Git diff needed by the generic coverage telemetry evaluator. */
export function readChangedLines(
  projectRoot: string,
  baseline: string,
  declaration: CoverageTelemetryDeclaration,
): Map<string, Set<number>> {
  const diff = execFileSync("git", ["diff", "--unified=0", baseline, "--"], {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });
  const changed = parseChangedLines(diff);
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  }).split("\0").filter((file) => file
    && matchesAny(normalizePath(file), declaration.include)
    && !matchesAny(normalizePath(file), declaration.exclude));
  return addUntrackedFileLines(changed, untracked, (file) => readFileSync(resolve(projectRoot, file), "utf8"));
}

/** Adds every line of a new untracked file to the FEAT-owned changed-line set. */
export function addUntrackedFileLines(
  changed: Map<string, Set<number>>,
  files: readonly string[],
  read: (file: string) => string,
): Map<string, Set<number>> {
  for (const rawFile of files) {
    const file = normalizePath(rawFile);
    if (!file || file.startsWith("../") || changed.has(file)) continue;
    const content = read(file);
    const lineCount = content.length === 0 ? 0 : content.split(/\r?\n/).length - (content.endsWith("\n") ? 1 : 0);
    changed.set(file, new Set(Array.from({ length: lineCount }, (_, index) => index + 1)));
  }
  return changed;
}

export function evaluateCoverageReport(input: {
  baseline: string | null;
  declaration: CoverageTelemetryDeclaration;
  projectRoot: string;
  workingDirectory: string;
}): TestCoverageGateDecision {
  if (!input.baseline) {
    return { kind: "blocked", files: [], measurement: null, summary: "Test coverage could not be calculated because the durable StartFeature baseline commit is unavailable." };
  }
  const reportPath = resolve(input.projectRoot, input.declaration.reportPath);
  if (!existsSync(reportPath)) {
    return { kind: "blocked", files: [], measurement: null, summary: `Test coverage could not be calculated because the required LCOV report is missing: ${input.declaration.reportPath}.` };
  }
  try {
    return evaluateChangedLineCoverage({
      declaration: input.declaration,
      changedLines: readChangedLines(input.projectRoot, input.baseline, input.declaration),
      lcov: parseLcov(readFileSync(reportPath, "utf8"), input.projectRoot, input.workingDirectory),
    });
  } catch (error) {
    return { kind: "blocked", files: [], measurement: null, summary: `Test coverage could not be calculated: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function createMeasurement(
  feature: TestCoverageMetricSummary,
  overall: TestCoverageMetricSummary,
  declaration: CoverageTelemetryDeclaration,
): TestCoverageCheckMeasurement {
  return {
    feature,
    overall,
    minimumPercent: declaration.minimumPercent,
    targetPercent: declaration.targetPercent,
  };
}

function calculateMetric(
  hits: readonly number[],
  minimumPercent: number,
  targetPercent: number,
  label: string,
): TestCoverageMetricSummary {
  return hits.length === 0
    ? notApplicableMetric(`${label} is unavailable because the report contains no matching executable lines.`)
    : metricFromCounts(hits.filter((value) => value > 0).length, hits.length, minimumPercent, targetPercent, label);
}

function metricFromCounts(
  coveredLines: number,
  executableLines: number,
  minimumPercent: number,
  targetPercent: number,
  label: string,
): TestCoverageMetricSummary {
  const percent = roundPercent(coveredLines, executableLines);
  const assessment: TestCoverageAssessment = percent === 100
    ? "perfect"
    : percent >= targetPercent
      ? "excellent"
      : percent >= minimumPercent
        ? "ok"
        : "needs_improvement";
  const comment = assessment === "perfect"
    ? `${label} is perfect.`
    : assessment === "excellent"
      ? `${label} achieved the ${formatPercent(targetPercent)} target.`
      : assessment === "ok"
        ? `${label} is OK and can still improve toward ${formatPercent(targetPercent)}.`
        : `${label} should increase toward the ${formatPercent(minimumPercent)} reference.`;
  return { assessment, comment, coveredLines, executableLines, percent };
}

function notApplicableMetric(comment: string): TestCoverageMetricSummary {
  return { assessment: "not_applicable", comment, coveredLines: 0, executableLines: 0, percent: null };
}

function formatMetricPercent(metric: TestCoverageMetricSummary): string {
  return metric.percent === null ? "not available" : formatPercent(metric.percent);
}

function matchesAny(file: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => globToRegExp(normalizePath(pattern)).test(file));
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]!;
    if (char === "*" && pattern[index + 1] === "*") {
      source += pattern[index + 2] === "/" ? "(?:.*/)?" : ".*";
      index += pattern[index + 2] === "/" ? 2 : 1;
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`${source}$`);
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function roundPercent(covered: number, total: number): number {
  return total === 0 ? 100 : Math.round((covered / total) * 10_000) / 100;
}

function formatPercent(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
}
