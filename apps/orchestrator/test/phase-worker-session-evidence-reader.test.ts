import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PhaseWorkerSessionEvidenceReader,
  extractFinalAssistantTextFromPiSession,
} from "../src/workflows/phases/phase-worker-session-evidence-reader.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true }); });

const handoff = `## Hepha Gate Evidence Handoff

| Gate | Result | Evidence |
| --- | --- | --- |
| Changed files | recorded | \`src/any.ts\` |
| Tests | passed | focused checks passed |
| Gherkin/Playwright E2E | not_applicable | no browser behavior |`;

function event(text: string, role = "assistant") {
  return JSON.stringify({ type: "message", message: { role, content: [{ type: "text", text }] } });
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "hepha-session-evidence-"));
  roots.push(root);
  const sessionDirectory = join(root, "sessions");
  const featureFolder = join(root, "MemoryBank", "Features", "03_IN_PROGRESS", "WORK-item");
  mkdirSync(sessionDirectory, { recursive: true });
  mkdirSync(featureFolder, { recursive: true });
  const feature = { folderPath: featureFolder } as WorkItemCard;
  const phase = { number: 14, title: "Arbitrary Phase" } as PhaseSummary & { number: number };
  const reader = new PhaseWorkerSessionEvidenceReader({ sessionDirectory, workspaceRoot: root });
  const markers = `Current phase: Phase 14 - Arbitrary Phase\nMemoryBank/Features/03_IN_PROGRESS/WORK-item`;
  return { feature, markers, phase, reader, root, sessionDirectory };
}

describe("phase worker session evidence reader", () => {
  it("extracts only the latest assistant text and tolerates a partial final line", () => {
    const raw = [event("old"), event("user", "user"), event("new"), "{partial"].join("\n");
    expect(extractFinalAssistantTextFromPiSession(raw)).toBe("new");
    expect(extractFinalAssistantTextFromPiSession("not-json")).toBe("");
  });

  it("returns the newest exact feature-and-phase handoff", () => {
    const target = fixture();
    const older = join(target.sessionDirectory, "older.json");
    const newer = join(target.sessionDirectory, "newer.json");
    writeFileSync(older, `${target.markers}\n${event(handoff.replace("src/any.ts", "src/old.ts"))}`, "utf8");
    writeFileSync(newer, `${target.markers}\n${event(handoff)}`, "utf8");
    utimesSync(older, new Date(1_000), new Date(1_000));
    utimesSync(newer, new Date(2_000), new Date(2_000));
    expect(target.reader.find(target.feature, target.phase)?.changedFiles).toBe("`src/any.ts`");
  });

  it("skips newer interrupted evidence and falls back to an older valid session", () => {
    const target = fixture();
    const valid = join(target.sessionDirectory, "valid.json");
    const interrupted = join(target.sessionDirectory, "interrupted.json");
    writeFileSync(valid, `${target.markers}\n${event(handoff)}`, "utf8");
    writeFileSync(interrupted, `${target.markers}\n${event("incomplete response")}`, "utf8");
    utimesSync(valid, new Date(1_000), new Date(1_000));
    utimesSync(interrupted, new Date(2_000), new Date(2_000));
    expect(target.reader.find(target.feature, target.phase)?.tests.result).toBe("passed");
  });

  it("rejects evidence from another phase, feature, file type, or missing directory", () => {
    const target = fixture();
    writeFileSync(join(target.sessionDirectory, "wrong.json"), `${target.markers.replace("Phase 14", "Phase 15")}\n${event(handoff)}`, "utf8");
    writeFileSync(join(target.sessionDirectory, "right.log"), `${target.markers}\n${event(handoff)}`, "utf8");
    expect(target.reader.find(target.feature, target.phase)).toBeNull();
    expect(new PhaseWorkerSessionEvidenceReader({ sessionDirectory: join(target.root, "absent"), workspaceRoot: target.root }).find(target.feature, target.phase)).toBeNull();
  });

  it("falls back to reading the handoff from the phase document when no session has it", () => {
    const target = fixture();
    const phaseWithDoc = { ...target.phase, documentPath: join(target.feature.folderPath, "phase-14.md") };
    writeFileSync(phaseWithDoc.documentPath, `${handoff}\n`, "utf8");
    expect(target.reader.find(target.feature, phaseWithDoc)?.changedFiles).toBe("\`src/any.ts\`");
    expect(target.reader.find(target.feature, phaseWithDoc)?.tests.result).toBe("passed");
    expect(target.reader.find(target.feature, phaseWithDoc)?.gherkinE2e.result).toBe("not_applicable");
  });

  it("returns null when neither session nor phase document has a handoff", () => {
    const target = fixture();
    const phaseWithDoc = { ...target.phase, documentPath: join(target.feature.folderPath, "missing.md") };
    expect(target.reader.find(target.feature, phaseWithDoc)).toBeNull();
  });

  it("repairs handoff with gate vocabulary (missing/satisfied) instead of handoff vocabulary (passed/failed)", () => {
    const target = fixture();
    const repairedHandoff = `## Hepha Gate Evidence Handoff

| Gate | Result | Evidence |
| --- | --- | --- |
| Changed files | recorded | docs updated |
| Tests | satisfied | 56 tests passed |
| Gherkin/Playwright E2E | not applicable | 8 tests listed |
`;
    const phaseWithDoc = { ...target.phase, documentPath: join(target.feature.folderPath, "phase-14.md") };
    writeFileSync(phaseWithDoc.documentPath, repairedHandoff, "utf8");
    const result = target.reader.find(target.feature, phaseWithDoc);
    expect(result?.changedFiles).toBe("docs updated");
    expect(result?.tests.result).toBe("passed");
    expect(result?.gherkinE2e.result).toBe("not_applicable");
  });

  it("repairs handoff with missing/failed gate vocabulary", () => {
    const target = fixture();
    const repairedHandoff = `## Hepha Gate Evidence Handoff

| Gate | Result | Evidence |
| --- | --- | --- |
| Changed files | recorded | docs updated |
| Tests | missing | tests failed due to timeout |
| Gherkin/Playwright E2E | missing | e2e failed |
`;
    const phaseWithDoc = { ...target.phase, documentPath: join(target.feature.folderPath, "phase-14.md") };
    writeFileSync(phaseWithDoc.documentPath, repairedHandoff, "utf8");
    const result = target.reader.find(target.feature, phaseWithDoc);
    expect(result?.tests.result).toBe("failed");
    expect(result?.gherkinE2e.result).toBe("failed");
  });

  it("finds handoff in any assistant message, not just the last", () => {
    const earlyHandoff = event(handoff);
    const lateSummary = event("All checks passed. No code changes needed.");
    const raw = [earlyHandoff, lateSummary].join("\n");
    const result = extractFinalAssistantTextFromPiSession(raw);
    expect(result).toContain("## Hepha Gate Evidence Handoff");
    expect(result).toContain("src/any.ts");
  });
});
