import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  inspectRefactorLedger,
  parseRefactorLedger,
  REQUIRED_REFACTOR_SLICE_EVIDENCE,
  validateRefactorLedger,
} from "./refactor-ledger-policy.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("refactor ledger policy", () => {
  it("parses numbered slices, multiline responsibilities, and evidence fields", () => {
    const [slice] = parseRefactorLedger("ledger.md", renderSlice(4, "Bounded owner", "Own one\nfocused responsibility."));
    expect(slice).toEqual({
      documentPath: "ledger.md",
      evidence: new Set(REQUIRED_REFACTOR_SLICE_EVIDENCE),
      number: 4,
      responsibility: "Own one focused responsibility.",
      title: "Bounded owner",
    });
  });

  it("accepts a contiguous ledger with complete evidence", () => {
    const slices = parseRefactorLedger("ledger.md", [renderSlice(1), renderSlice(2)].join("\n"));
    expect(validateRefactorLedger(slices)).toEqual([]);
  });

  it("reports missing numbers, duplicate numbers, responsibilities, and evidence deterministically", () => {
    const complete = parseRefactorLedger("first.md", renderSlice(1));
    const incomplete = parseRefactorLedger("second.md", renderSlice(3, "Gap", "", ["Side effects"]));
    const duplicate = parseRefactorLedger("third.md", renderSlice(3));

    expect(validateRefactorLedger([...complete, ...incomplete, ...duplicate])).toEqual([
      expect.objectContaining({ code: "missing_slice", sliceNumber: 2 }),
      expect.objectContaining({ code: "duplicate_slice", sliceNumber: 3 }),
      expect.objectContaining({ code: "missing_evidence", message: expect.stringContaining("Side effects"), sliceNumber: 3 }),
      expect.objectContaining({ code: "missing_responsibility", sliceNumber: 3 }),
    ]);
  });

  it("loads multiple configured ledger documents from one workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "hepha-refactor-ledger-"));
    temporaryRoots.push(root);
    writeLedger(root, "docs/first.md", renderSlice(1));
    writeLedger(root, "docs/second.md", renderSlice(2));

    const result = inspectRefactorLedger(root, ["docs/first.md", "docs/second.md"]);
    expect(result.slices.map(({ number }) => number)).toEqual([1, 2]);
    expect(result.issues).toEqual([]);
  });
});

function renderSlice(
  number: number,
  title = "Generic responsibility",
  responsibility = "Own one bounded behavior.",
  omittedEvidence: readonly string[] = [],
): string {
  const rows = REQUIRED_REFACTOR_SLICE_EVIDENCE
    .filter((field) => !omittedEvidence.includes(field))
    .map((field) => `| ${field} | Evidence for ${field.toLowerCase()} |`)
    .join("\n");
  return [
    `### Slice ${number} — ${title}`,
    "",
    `**Responsibility:** ${responsibility}`,
    "",
    "| Evidence | Result |",
    "| --- | --- |",
    rows,
  ].join("\n");
}

function writeLedger(root: string, relativePath: string, source: string): void {
  const path = join(root, relativePath);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, source, "utf8");
}
