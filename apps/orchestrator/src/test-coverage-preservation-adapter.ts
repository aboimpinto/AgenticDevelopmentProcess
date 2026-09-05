import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import {
  evaluateTestCoveragePreservation,
  type TestArtifactCoverage,
  type TestCoverageViolation,
} from "./test-coverage-preservation-policy.js";

interface TestArtifactSnapshot extends TestArtifactCoverage {
  readonly absolutePath: string;
  readonly content: string;
}

export interface TestCoverageSnapshot {
  readonly projectRoot: string;
  readonly artifacts: readonly TestArtifactSnapshot[];
}

export type TestCoverageEnforcementResult =
  | Readonly<{ kind: "allowed" }>
  | Readonly<{
      kind: "restored";
      message: string;
      violations: readonly TestCoverageViolation[];
    }>;

const excludedDirectories = new Set([
  ".git",
  ".hepha",
  "dist",
  "dist-types",
  "logs",
  "MemoryBank",
  "node_modules",
  "playwright-report",
  "target",
  "coverage",
  "test-results",
]);

const testArtifactPattern = /(?:\.(?:test|spec)\.[cm]?[jt]sx?|\.feature|_test\.py|\.rs)$/i;

export function captureTestCoverageSnapshot(projectRoot: string): TestCoverageSnapshot {
  const resolvedRoot = resolve(projectRoot);
  return {
    projectRoot: resolvedRoot,
    artifacts: listTestArtifacts(resolvedRoot)
      .map((absolutePath) => snapshotArtifact(resolvedRoot, absolutePath))
      .filter((artifact) => artifact.caseNames.length > 0),
  };
}

/** Restores only pre-worker artifacts whose executable coverage was reduced. */
export function enforceTestCoveragePreservation(snapshot: TestCoverageSnapshot): TestCoverageEnforcementResult {
  const current = captureTestCoverageSnapshot(snapshot.projectRoot);
  const decision = evaluateTestCoveragePreservation(snapshot.artifacts, current.artifacts);
  if (decision.kind === "allowed") return decision;

  const priorByPath = new Map(snapshot.artifacts.map((artifact) => [artifact.path, artifact]));
  for (const violation of decision.violations) {
    const prior = priorByPath.get(violation.path);
    if (!prior) continue;
    mkdirSync(dirname(prior.absolutePath), { recursive: true });
    writeFileSync(prior.absolutePath, prior.content, "utf8");
  }

  const details = decision.violations.map((violation) => {
    const removed = violation.missingCaseNames.length > 0
      ? ` removed/renamed cases: ${violation.missingCaseNames.join("; ")}`
      : "";
    const assertions = violation.assertionDeficit > 0
      ? ` assertion deficit: ${violation.assertionDeficit}`
      : "";
    return `${violation.path}${removed}${assertions}`;
  }).join(" | ");
  return {
    kind: "restored",
    message: `Test coverage preservation denied the phase repair and restored prior artifacts. ${details}`,
    violations: decision.violations,
  };
}

/** Assertion wrapper retained for callers that need an exception boundary. */
export function assertTestCoveragePreserved(snapshot: TestCoverageSnapshot): void {
  const result = enforceTestCoveragePreservation(snapshot);
  if (result.kind === "restored") throw new Error(result.message);
}

function listTestArtifacts(root: string): string[] {
  const results: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && testArtifactPattern.test(entry.name)) results.push(path);
    }
  };
  visit(root);
  return results.sort();
}

function snapshotArtifact(projectRoot: string, absolutePath: string): TestArtifactSnapshot {
  const content = existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
  return {
    absolutePath,
    assertionCount: countAssertions(content),
    caseNames: extractCaseNames(content),
    content,
    path: relative(projectRoot, absolutePath).replaceAll("\\", "/"),
  };
}

function extractCaseNames(content: string): string[] {
  const names: string[] = [];
  for (const match of content.matchAll(/\b(?:test|it)(?:\.(?:only|skip|todo|fails))?\s*\(\s*(["'`])([^\n]*?)\1/g)) {
    if (match[2]) names.push(match[2]);
  }
  for (const match of content.matchAll(/^\s*Scenario(?: Outline)?:\s*(.+?)\s*$/gm)) {
    if (match[1]) names.push(match[1]);
  }
  for (const match of content.matchAll(/^\s*(?:async\s+)?def\s+(test_[A-Za-z0-9_]+)\s*\(/gm)) {
    if (match[1]) names.push(match[1]);
  }
  for (const match of content.matchAll(/#\s*\[\s*test\s*\][\s\S]{0,160}?\bfn\s+([A-Za-z0-9_]+)\s*\(/g)) {
    if (match[1]) names.push(match[1]);
  }
  return [...new Set(names)].sort();
}

function countAssertions(content: string): number {
  return [...content.matchAll(/\b(?:expect|assert(?:Eq|Ne|StrictEqual|Equal|That)?|assert_[A-Za-z0-9_]+)\s*[!(]/g)].length;
}
