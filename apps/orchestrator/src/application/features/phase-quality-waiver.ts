import { readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import type { FeatureQualityGateKind } from "@hepha/shared";
import { parseQualityGateKind } from "../../memorybank/phase-quality-projection.js";

const labels = { build: "Build", lint: "Lint / typecheck", tests: "Tests", gherkin_e2e: "Gherkin/Playwright E2E", code_review: "Code review" };

export function assertPhaseDocument(folder: string, path: string, expectedUpdatedAt: string) {
  const relativePath = relative(realpathSync(folder), realpathSync(path));
  if (!relativePath || relativePath.startsWith("..") || relativePath.startsWith("/")) throw new Error("Phase document is outside the feature.");
  if (statSync(path).mtime.toISOString() !== expectedUpdatedAt) throw new Error("Phase changed since it was displayed. Refresh before deciding.");
}

/** Human-only admission calls this writer; no worker-output path grants waivers. */
export function recordPhaseQualityWaiver(path: string, gate: FeatureQualityGateKind, reason: string, at: string) {
  const original = readFileSync(path, "utf8");
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const safeReason = reason.replace(/[\r\n]+/g, " ").replace(/\|/g, "¦").replace(/[`<>]/g, "");
  const decision = `Human-approved waiver (${at}): ${safeReason}`;
  const lines = original.split(/\r?\n/);
  const starts = lines.flatMap((line, index) => /^##\s+Quality Gate Evidence\s*$/i.test(line) ? [index] : []);
  if (starts.length > 1) throw new Error("Multiple Quality Gate Evidence sections require reconciliation before waiver.");
  const start = starts[0];
  const row = `| ${labels[gate]} | waived | ${decision} |`;
  if (start === undefined) {
    lines.push("", "## Quality Gate Evidence", "", "| Gate | Decision | Evidence / Justification |", "| --- | --- | --- |", row);
  } else {
    let end = lines.findIndex((line, index) => index > start && /^#{1,2}\s/.test(line));
    if (end < 0) end = lines.length;
    const matches = lines.flatMap((line, index) => index > start && index < end &&
      /^\s*\|/.test(line) && parseQualityGateKind(line.split("|")[1] ?? "") === gate ? [index] : []);
    if (matches.length > 1) throw new Error("Duplicate gate rows require reconciliation before waiver.");
    if (matches[0] !== undefined) {
      const prior = lines[matches[0]]!;
      lines[matches[0]] = row;
      lines.push("", `> Previous ${labels[gate]} evidence (preserved): ${prior.replace(/\|/g, "¦")}`);
    } else lines.splice(end, 0, row, "");
  }
  lines.push("", `> Human gate decision — ${labels[gate]} — ${at}: ${safeReason}`, "> This is a waiver, not an executed passing result. Other gates and human acceptance remain unchanged.", "");
  writeFileSync(path, lines.join(newline), "utf8");
}
