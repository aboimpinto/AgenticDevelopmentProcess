import { describe, expect, it } from "vitest";
import {
  PHASE_TEMPLATE_INVALID_CODE,
  PHASE_TEMPLATE_VERSION,
  validatePhaseTemplateDocuments,
  type PhaseTemplateDocuments,
} from "../src/phase-template-validator.js";
import {
  evaluatePhaseTemplateDispatchGate,
  isPhaseTemplateInvalidError,
} from "../src/phase-template-dispatch-gate.js";

const phaseFiles = [
  "Phases/phase-0-question-framing.md",
  "Phases/phase-1-disposable-experiment.md",
  "Phases/phase-2-evidence-synthesis.md",
] as const;

function phaseDocument(phase: number, status = "PENDING") {
  const skipRationale = status === "SKIPPED"
    ? "\n## Skip Rationale\n\nThe experiment produced enough evidence to skip this track.\n"
    : "";
  return [
    `# Phase ${phase} — Any title is valid`,
    "",
    `**Status:** ${status}`,
    "",
    "## Phase Task Ledger",
    "",
    "- [ ] Durable task",
    skipRationale,
    "## Quality Gate Evidence",
    "",
    "| Gate | Decision | Evidence / Justification |",
    "| --- | --- | --- |",
    "| Changed files | missing | Awaiting implementation evidence. |",
    "| Tests | missing | Awaiting focused test. |",
    "| Gherkin/Playwright E2E | not applicable | No browser change. |",
    "| Code review | missing | Awaiting review. |",
    "",
  ].join("\n");
}

function validDocuments(): PhaseTemplateDocuments {
  return {
    featureTasks: [
      "| Phase | Work | Status | Evidence |",
      "| --- | --- | --- | --- |",
      "| 0 | Frame research question | PENDING | Evidence |",
      "| 1 | Run disposable experiment | SKIPPED — enough evidence already exists | Evidence |",
      "| 2 | Synthesize evidence | PENDING | Evidence |",
    ].join("\n"),
    phaseDocuments: {
      [phaseFiles[0]]: phaseDocument(0),
      [phaseFiles[1]]: phaseDocument(1, "SKIPPED"),
      [phaseFiles[2]]: phaseDocument(2),
    },
  };
}

describe("phase template validator", () => {
  it("accepts arbitrary suffixes and a refinement-defined phase count", () => {
    expect(validatePhaseTemplateDocuments(validDocuments())).toEqual({
      version: PHASE_TEMPLATE_VERSION,
      valid: true,
      diagnostics: [],
    });
  });

  it("uses a V3 contract inventory as the lifecycle source without requiring a legacy phase table", () => {
    const documents = validDocuments();
    documents.featureTasks = [
      "## Phase Inventory",
      "",
      "| Contract ID | Document | Role | Status |",
      "| --- | --- | --- | --- |",
      `| question-framing | ${phaseFiles[0]} | entry_gate | PENDING |`,
      `| disposable-experiment | ${phaseFiles[1]} | implementation | SKIPPED — enough evidence already exists |`,
      `| evidence-synthesis | ${phaseFiles[2]} | final_checkpoint | PENDING |`,
    ].join("\n");

    expect(validatePhaseTemplateDocuments(documents)).toEqual({
      version: PHASE_TEMPLATE_VERSION,
      valid: true,
      diagnostics: [],
    });
  });

  it("accepts canonical gate decisions with a task-specific qualifier", () => {
    const documents = validDocuments();
    documents.phaseDocuments[phaseFiles[0]] = phaseDocument(0)
      .replace("| Tests | missing | Awaiting focused test. |", "| Tests | not applicable for this audit | Documentation-only task. |")
      .replace("| Code review | missing | Awaiting review. |", "| Code review | waived — research-only phase | Human review occurs later. |");

    expect(validatePhaseTemplateDocuments(documents)).toMatchObject({ valid: true, diagnostics: [] });
  });

  it("emits stable diagnostics against the actual arbitrary document path", () => {
    const documents = validDocuments();
    documents.phaseDocuments[phaseFiles[2]] = [
      "# Phase 2 — Evidence synthesis",
      "",
      "**Status:** PENDING",
      "",
      "## Quality Gate Evidence",
      "",
      "| Gate | Decision | Evidence / Justification |",
      "| Tests | missing | Waiting. |",
    ].join("\n");

    const first = validatePhaseTemplateDocuments(documents);
    expect(first).toEqual(validatePhaseTemplateDocuments(documents));
    expect(first.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: PHASE_TEMPLATE_INVALID_CODE,
        file: phaseFiles[2],
        expected: "task ledger section with durable checkbox tasks",
      }),
      expect.objectContaining({
        code: PHASE_TEMPLATE_INVALID_CODE,
        file: phaseFiles[2],
        expected: "quality gate row 'code review'",
      }),
    ]));
  });

  it("validates only the selected numeric prefix during normal dispatch", () => {
    const documents = validDocuments();
    documents.phaseDocuments[phaseFiles[1]] = phaseDocument(1, "SKIPPED").replace(
      "## Skip Rationale\n\nThe experiment produced enough evidence to skip this track.\n",
      "",
    );

    expect(validatePhaseTemplateDocuments(documents, { phaseNumbers: [0] })).toMatchObject({ valid: true, diagnostics: [] });
    expect(validatePhaseTemplateDocuments(documents)).toMatchObject({ valid: false });
  });

  it("rejects duplicate numeric prefixes regardless of suffix", () => {
    const documents = validDocuments();
    documents.phaseDocuments["Phases/phase-1-another-random-name.md"] = phaseDocument(1, "SKIPPED");

    expect(validatePhaseTemplateDocuments(documents).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ expected: "one document with phase-1 prefix" }),
    ]));
  });

  it("rejects phase documents without a numeric prefix", () => {
    const documents = validDocuments();
    documents.phaseDocuments["Phases/disposable-experiment.md"] = phaseDocument(3);

    expect(validatePhaseTemplateDocuments(documents).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: "Phases/disposable-experiment.md",
        expected: "phase document path with a phase-<number> prefix",
      }),
    ]));
  });

  it("rejects an empty phase document set", () => {
    const documents = validDocuments();

    expect(validatePhaseTemplateDocuments({
      featureTasks: documents.featureTasks,
      phaseDocuments: {},
    }).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: "Phases",
        expected: "at least one phase document with a phase-<number> prefix",
      }),
    ]));
  });

  it("requires a durable skipped representation in the phase row and document", () => {
    const documents = validDocuments();
    documents.featureTasks = documents.featureTasks!.replace("SKIPPED — enough evidence already exists", "SKIPPED");
    documents.phaseDocuments[phaseFiles[1]] = phaseDocument(1, "SKIPPED").replace(
      "## Skip Rationale\n\nThe experiment produced enough evidence to skip this track.\n",
      "",
    );

    const result = validatePhaseTemplateDocuments(documents);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: "FeatureTasks.md", expected: "SKIPPED phase row with a specific skip reason" }),
      expect.objectContaining({ file: phaseFiles[1], expected: "SKIPPED phase with a ## Skip Rationale section" }),
    ]));
  });

  it("allows normal dispatch only after a confirmed valid validator result", () => {
    const valid = evaluatePhaseTemplateDispatchGate(validatePhaseTemplateDocuments(validDocuments()));
    const invalid = evaluatePhaseTemplateDispatchGate(validatePhaseTemplateDocuments({ featureTasks: null, phaseDocuments: {} }));

    expect(valid).toEqual({ kind: "allow" });
    expect(invalid).toMatchObject({ kind: "block", code: PHASE_TEMPLATE_INVALID_CODE });
    expect(isPhaseTemplateInvalidError(new Error("worker timed out"))).toBe(false);
    expect(isPhaseTemplateInvalidError(new Error("phase_template_invalid: worker prose"))).toBe(false);
  });
});
