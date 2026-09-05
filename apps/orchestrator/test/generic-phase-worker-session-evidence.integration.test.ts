import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PhaseWorkerSessionEvidenceReader } from "../src/workflows/phases/phase-worker-session-evidence-reader.js";

const featurePath = fileURLToPath(new URL("./generic-phase-worker-session-evidence.feature", import.meta.url));
const validHandoff = `## Hepha Gate Evidence Handoff
| Gate | Result | Evidence |
| --- | --- | --- |
| Changed files | recorded | \`src/generic.ts\` |
| Tests | passed | checks passed |
| Gherkin/Playwright E2E | not_applicable | no browser behavior |`;
const assistant = (text: string) => JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "text", text }] } });

describe("generic worker session evidence Gherkin integration", () => {
  it("falls back to the latest matching complete handoff", () => {
    expect(readFileSync(featurePath, "utf8")).not.toMatch(/FEAT-\d+|Phase \d+|Task \d+/i);
    const root = mkdtempSync(join(tmpdir(), "hepha-generic-session-evidence-"));
    try {
      const sessions = join(root, "sessions");
      const folderPath = join(root, "work", "item");
      mkdirSync(sessions, { recursive: true });
      mkdirSync(folderPath, { recursive: true });
      const marker = "Current phase: Phase 27 - Completely Random\nwork/item";
      const valid = join(sessions, "valid.json");
      const interrupted = join(sessions, "interrupted.json");
      writeFileSync(valid, `${marker}\n${assistant(validHandoff)}`, "utf8");
      writeFileSync(interrupted, `${marker}\n${assistant("worker stopped")}`, "utf8");
      utimesSync(valid, new Date(1_000), new Date(1_000));
      utimesSync(interrupted, new Date(2_000), new Date(2_000));
      const result = new PhaseWorkerSessionEvidenceReader({ sessionDirectory: sessions, workspaceRoot: root }).find(
        { folderPath } as WorkItemCard,
        { number: 27, title: "Completely Random" } as PhaseSummary & { number: number },
      );
      expect(result?.changedFiles).toBe("`src/generic.ts`");
      expect(result?.tests.result).toBe("passed");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
