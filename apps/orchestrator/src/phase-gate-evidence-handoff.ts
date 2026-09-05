/**
 * Strict worker-to-orchestrator boundary for evidence that the worker creates
 * but the orchestrator owns in the phase document's machine fields.
 */

export type PhaseGateResult = "passed" | "failed" | "not_applicable";

export type PhaseGateEvidenceHandoff = Readonly<{
  changedFiles: string;
  tests: Readonly<{ result: PhaseGateResult; evidence: string }>;
  gherkinE2e: Readonly<{ result: PhaseGateResult; evidence: string }>;
}>;

const requiredGateLabels = new Map([
  ["changed files", "changedFiles"],
  ["tests", "tests"],
  ["gherkin/playwright e2e", "gherkinE2e"],
] as const);

const phaseGateResults = new Set<PhaseGateResult>(["passed", "failed", "not_applicable"]);

/**
 * The worker reports observed results, not Hepha's canonical gate decisions.
 * An explicit result prevents non-empty failure prose from being mistaken for
 * successful evidence.
 */
export function parsePhaseGateEvidenceHandoff(output: string): PhaseGateEvidenceHandoff {
  const heading = output.search(/^##\s+Hepha Gate Evidence Handoff\s*$/im);
  const afterHeading = heading === -1 ? "" : output.slice(heading).replace(/^##[^\n]*(?:\r?\n|$)/, "");
  const nextHeading = afterHeading.search(/^##\s+/m);
  const section = nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading);
  const rows = new Map<string, { result: string; evidence: string }>();

  for (const line of section.split(/\r?\n/)) {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 3) continue;
    const key = requiredGateLabels.get(
      cells[0].toLowerCase() as "changed files" | "tests" | "gherkin/playwright e2e",
    );
    if (key && cells[1] && cells[2]) rows.set(key, { result: cells[1].toLowerCase(), evidence: cells[2] });
  }

  // Normalize common LLM output variants before validation
  for (const row of ["tests", "gherkinE2e"] as const) {
    const entry = rows.get(row);
    if (entry && entry.result === "not applicable") entry.result = "not_applicable";
  }

  const changedFiles = rows.get("changedFiles");
  const tests = rows.get("tests");
  const gherkinE2e = rows.get("gherkinE2e");
  if (
    !changedFiles || changedFiles.result !== "recorded"
    || !tests || !phaseGateResults.has(tests.result as PhaseGateResult)
    || !gherkinE2e || !phaseGateResults.has(gherkinE2e.result as PhaseGateResult)
  ) {
    throw new Error(
      "Phase worker did not return a complete ## Hepha Gate Evidence Handoff with explicit Changed files=recorded and Tests/Gherkin results (passed, failed, or not_applicable).",
    );
  }

  return {
    changedFiles: changedFiles.evidence,
    tests: { result: tests.result as PhaseGateResult, evidence: tests.evidence },
    gherkinE2e: { result: gherkinE2e.result as PhaseGateResult, evidence: gherkinE2e.evidence },
  };
}

/** Applies only HEPHA-owned decision tokens, preserving all other phase text. */
export function applyPhaseGateEvidenceHandoff(markdown: string, handoff: PhaseGateEvidenceHandoff): string {
  const replacements: ReadonlyArray<readonly [string, "satisfied" | "missing" | "not applicable", string]> = [
    ["Changed files", "satisfied", handoff.changedFiles],
    ["Tests", gateDecision(handoff.tests.result), handoff.tests.evidence],
    ["Gherkin/Playwright E2E", gateDecision(handoff.gherkinE2e.result), handoff.gherkinE2e.evidence],
  ];
  let next = markdown;

  for (const [gate, decision, evidence] of replacements) {
    const pattern = new RegExp(
      `^(\\|\\s*${gate.replace(/[\\/]/g, "\\$&")}\\s*\\|)\\s*([^|]*)(\\|)\\s*([^|]*)(\\|)\\s*$`,
      "im",
    );
    if (!pattern.test(next)) {
      throw new Error(`Phase document is missing its '${gate}' Quality Gate Evidence row.`);
    }
    next = next.replace(pattern, (_row, opening, previousDecision, separator, previousEvidence, closing) => {
      const phaseEvidence = gate === "Changed files" && previousDecision.trim().toLowerCase() === "satisfied"
        ? mergeEvidenceFragments(previousEvidence, evidence)
        : evidence;
      return `${opening} ${decision} ${separator} ${phaseEvidence.replace(/\|/g, "/")} ${closing}`;
    });
  }

  return next;
}

export function assertPhaseGateEvidencePassed(handoff: PhaseGateEvidenceHandoff): void {
  const failed = [
    { name: "Tests", gate: handoff.tests },
    { name: "Gherkin/Playwright E2E", gate: handoff.gherkinE2e },
  ].filter((entry) => entry.gate.result === "failed");
  if (failed.length === 0) return;
  throw new Error(`Phase worker reported failed quality gates: ${failed.map((entry) => entry.name).join(", ")}.`);
}

function gateDecision(result: PhaseGateResult): "satisfied" | "missing" | "not applicable" {
  if (result === "passed") return "satisfied";
  if (result === "not_applicable") return "not applicable";
  return "missing";
}

/**
 * Settles the third generic quality gate from the same durable evidence that
 * the orchestrator already owns. This closes the old impossible contract in
 * which workers could not edit gate decisions and also had no handoff field
 * capable of settling Gherkin/Playwright applicability.
 */
export function reconcileGherkinE2eGateFromRecordedEvidence(markdown: string): string {
  const changedFiles = readQualityGateRow(markdown, "Changed files");
  const tests = readQualityGateRow(markdown, "Tests");
  const gherkin = readQualityGateRow(markdown, "Gherkin/Playwright E2E");

  if (!changedFiles || !tests || !gherkin
    || changedFiles.decision !== "satisfied"
    || tests.decision !== "satisfied"
    || gherkin.decision === "satisfied"
    || gherkin.decision === "waived") {
    return markdown;
  }

  const evidencePaths = extractRecordedEvidencePaths(
    `${changedFiles.evidence}; ${tests.evidence}`,
  );
  const e2ePaths = evidencePaths.filter(isGherkinOrPlaywrightEvidencePath);
  const hasBrowserUiChange = evidencePaths.some(isBrowserUiProductionPath);

  if (e2ePaths.length > 0) {
    return replaceQualityGateRow(markdown, "Gherkin/Playwright E2E", "satisfied",
      `Gherkin/Playwright evidence recorded: ${e2ePaths.map((path) => `\`${path}\``).join("; ")}.`);
  }

  if (hasBrowserUiChange) {
    return replaceQualityGateRow(markdown, "Gherkin/Playwright E2E", "missing",
      "Browser/UI production files changed, but no Gherkin/Playwright E2E evidence path is recorded.");
  }

  return replaceQualityGateRow(markdown, "Gherkin/Playwright E2E", "not applicable",
    "No browser/UI production files changed; automated non-browser evidence is recorded in Tests.");
}

function readQualityGateRow(markdown: string, label: string) {
  for (const line of markdown.split(/\r?\n/)) {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 3 || cells[0]?.toLowerCase() !== label.toLowerCase()) continue;
    return {
      decision: (cells[1] ?? "").toLowerCase(),
      evidence: cells[2] ?? "",
    };
  }
  return null;
}

function extractRecordedEvidencePaths(evidence: string) {
  return [...evidence.matchAll(/`([^`]+)`/g)]
    .map((match) => (match[1] ?? "").replaceAll("\\", "/").replace(/^\.\//, "").trim())
    .filter((candidate) => /(?:^|\/)[^/]+\.[a-z0-9]+$/i.test(candidate));
}

function isGherkinOrPlaywrightEvidencePath(path: string) {
  return /(^|\/)e2e\/|\.feature$|playwright/i.test(path);
}

function isBrowserUiProductionPath(path: string) {
  return /^apps\/web\/src\//i.test(path) && !/\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(path);
}

function replaceQualityGateRow(
  markdown: string,
  label: string,
  decision: "satisfied" | "not applicable" | "missing",
  evidence: string,
) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^(\\|\\s*${escapedLabel}\\s*\\|)\\s*[^|]*(\\|)\\s*[^|]*(\\|)\\s*$`, "im");
  return markdown.replace(pattern, `$1 ${decision} $2 ${evidence.replaceAll("|", "/")} $3`);
}

function mergeEvidenceFragments(previous: string, incoming: string) {
  // A later documentation/evidence task may add records, but cannot erase an
  // earlier task's production targets: review routing consumes phase-wide
  // durable evidence, not merely the latest worker response.
  const fragments = [...previous.split(/;\s*/), ...incoming.split(/;\s*/)]
    .map((fragment) => fragment.trim())
    .filter(Boolean);
  return [...new Set(fragments)].join("; ");
}
