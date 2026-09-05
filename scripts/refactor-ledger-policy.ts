import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const REQUIRED_REFACTOR_SLICE_EVIDENCE = [
  "Production callers",
  "Unit tests",
  "Gherkin",
  "Integration",
  "Side effects",
  "Compatibility",
  "Resulting sizes",
] as const;

export const DEFAULT_REFACTOR_LEDGER_PATHS = [
  "docs/architecture/orchestrator-modularization-refactor.md",
  "docs/architecture/oversized-production-module-decomposition.md",
] as const;

export interface RefactorLedgerSlice {
  documentPath: string;
  evidence: ReadonlySet<string>;
  number: number;
  responsibility: string;
  title: string;
}

export interface RefactorLedgerIssue {
  code: "duplicate_slice" | "missing_evidence" | "missing_responsibility" | "missing_slice";
  documentPath: string;
  message: string;
  sliceNumber: number;
}

export function parseRefactorLedger(documentPath: string, source: string): RefactorLedgerSlice[] {
  const headings = [...source.matchAll(/^### Slice (\d+) — (.+)$/gm)];
  return headings.map((heading, index) => {
    const sectionStart = heading.index! + heading[0].length;
    const sectionEnd = headings[index + 1]?.index ?? source.length;
    const section = source.slice(sectionStart, sectionEnd);
    const responsibilityMarker = "**Responsibility:**";
    const responsibilityStart = section.indexOf(responsibilityMarker);
    const responsibility = responsibilityStart < 0
      ? ""
      : section.slice(responsibilityStart + responsibilityMarker.length)
        .replace(/^[ \t]*/, "")
        .split(/\n\s*\n|\n\|/, 1)[0]
        .replace(/\s+/g, " ")
        .trim();
    const evidence = new Set(
      [...section.matchAll(/^\|\s*([^|]+?)\s*\|/gm)]
        .map((row) => row[1].trim())
        .filter((field) => field !== "Evidence" && !/^-+$/.test(field)),
    );
    return {
      documentPath,
      evidence,
      number: Number(heading[1]),
      responsibility,
      title: heading[2].trim(),
    };
  });
}

export function validateRefactorLedger(
  slices: readonly RefactorLedgerSlice[],
  firstSliceNumber = 1,
): RefactorLedgerIssue[] {
  const issues: RefactorLedgerIssue[] = [];
  const ordered = [...slices].sort((left, right) => left.number - right.number);
  const byNumber = new Map<number, RefactorLedgerSlice[]>();
  for (const slice of ordered) {
    byNumber.set(slice.number, [...(byNumber.get(slice.number) ?? []), slice]);
    if (!slice.responsibility) {
      issues.push(issue("missing_responsibility", slice, `Slice ${slice.number} has no responsibility statement`));
    }
    for (const field of REQUIRED_REFACTOR_SLICE_EVIDENCE) {
      if (!slice.evidence.has(field)) {
        issues.push(issue("missing_evidence", slice, `Slice ${slice.number} is missing evidence field: ${field}`));
      }
    }
  }

  for (const [number, matches] of byNumber) {
    if (matches.length > 1) {
      issues.push(issue("duplicate_slice", matches[0], `Slice ${number} appears ${matches.length} times`));
    }
  }

  const lastSliceNumber = ordered.at(-1)?.number ?? firstSliceNumber - 1;
  for (let number = firstSliceNumber; number <= lastSliceNumber; number += 1) {
    if (!byNumber.has(number)) {
      issues.push({
        code: "missing_slice",
        documentPath: "refactor ledger",
        message: `Slice ${number} is missing from the ledger`,
        sliceNumber: number,
      });
    }
  }

  return issues.sort((left, right) => left.sliceNumber - right.sliceNumber
    || left.code.localeCompare(right.code)
    || left.documentPath.localeCompare(right.documentPath));
}

export function inspectRefactorLedger(
  workspaceRoot: string,
  documentPaths: readonly string[] = DEFAULT_REFACTOR_LEDGER_PATHS,
): { issues: RefactorLedgerIssue[]; slices: RefactorLedgerSlice[] } {
  const slices = documentPaths.flatMap((documentPath) => parseRefactorLedger(
    documentPath,
    readFileSync(resolve(workspaceRoot, documentPath), "utf8"),
  ));
  return { issues: validateRefactorLedger(slices), slices };
}

function issue(
  code: RefactorLedgerIssue["code"],
  slice: RefactorLedgerSlice,
  message: string,
): RefactorLedgerIssue {
  return { code, documentPath: slice.documentPath, message, sliceNumber: slice.number };
}
