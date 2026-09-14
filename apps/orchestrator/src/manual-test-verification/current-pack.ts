import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { ManualTestVerificationPackRecord } from "@hepha/db";
import type { ManualTestAdapterContext } from "./adapter-context.js";
import { parseManualTestCases } from "./pack-case-contract.js";

export function readStoredPackCases(projectRoot: string, markdownPath: string, allowIncomplete = false) {
  const absoluteMarkdown = resolveStoredArtifactPath(projectRoot, markdownPath);
  const manifest = JSON.parse(readFileSync(resolve(dirname(absoluteMarkdown), "manifest.json"), "utf8"));
  const tests = parseManualTestCases(manifest.manualTests);
  if (!Array.isArray(manifest.classifications) || !manifest.classifications.length || manifest.classifications.some((entry: { coverageStatus?: string }) =>
    !(allowIncomplete ? ["manual", "automated", "deferred", "uncovered"] : ["manual", "automated", "deferred"]).includes(entry.coverageStatus ?? ""))) throw new Error("Acceptance coverage is incomplete. Regenerate the pack.");
  if (!(allowIncomplete ? ["applicable", "incomplete"] : ["applicable"]).includes(manifest.applicability) || !Array.isArray(manifest.invalidManualTests) || (!allowIncomplete && manifest.invalidManualTests.length) || !tests.length) {
    throw new Error("The manual test package is incomplete; revise and regenerate it before recording results.");
  }
  for (const test of tests) {
    if (manifest.invalidManualTests.some((entry: { id?: string }) => entry.id === test.id)) throw new Error("A stored case is invalid. Regenerate the pack.");
    if (test.sourceIds.some((id) => !manifest.classifications.some((entry: { sourceId?: string }) => entry.sourceId === id))) {
      throw new Error("Manual test source references do not match the pack coverage map.");
    }
  }
  const markdown = readFileSync(absoluteMarkdown, "utf8");
  const headings = [...markdown.matchAll(/^###\s+([^\s:]+):/gm)].map((match) => match[1]);
  if (tests.some((test) => headings.filter((id) => id === test.id).length !== 1)) throw new Error("Pack artifacts disagree about test cases. Regenerate the pack.");
  return tests;
}

function resolveStoredArtifactPath(projectRoot: string, storedPath: string): string {
  return isAbsolute(storedPath) ? storedPath : resolve(projectRoot, storedPath);
}

export function readStoredPackReadiness(projectRoot: string, markdownPath: string): {
  applicability: "applicable" | "not_applicable" | "incomplete";
  manualTestCount: number;
  invalidManualTestCount: number;
  isReady: boolean;
} {
  try {
    const absoluteMarkdown = resolveStoredArtifactPath(projectRoot, markdownPath);
    const manifest = JSON.parse(readFileSync(resolve(dirname(absoluteMarkdown), "manifest.json"), "utf8")) as {
      applicability?: "applicable" | "not_applicable" | "incomplete";
      manualTests?: unknown[];
      invalidManualTests?: unknown[];
    };
    const manualTestCount = Array.isArray(manifest.manualTests) ? manifest.manualTests.length : 0;
    const invalidManualTestCount = Array.isArray(manifest.invalidManualTests) ? manifest.invalidManualTests.length : 0;
    const applicability = manifest.applicability ?? "incomplete";
    return {
      applicability,
      manualTestCount,
      invalidManualTestCount,
      isReady: applicability === "applicable" && readStoredPackCases(projectRoot, markdownPath).length > 0,
    };
  } catch {
    return { applicability: "incomplete", manualTestCount: 0, invalidManualTestCount: 0, isReady: false };
  }
}

export function hasReusablePackArtifacts(projectRoot: string, pack: ManualTestVerificationPackRecord): boolean {
  if (!existsSync(resolveStoredArtifactPath(projectRoot, pack.markdownPath))) return false;
  return pack.pdfPath === null || existsSync(resolveStoredArtifactPath(projectRoot, pack.pdfPath));
}

export async function getExactCurrentManualTestPack(
  context: ManualTestAdapterContext,
  packId: string,
): Promise<ManualTestVerificationPackRecord | null> {
  const [pack, currentPack] = await Promise.all([
    context.store.getManualTestPack(context.projectId, context.cardKey, packId),
    context.store.getCurrentManualTestPack(context.projectId, context.cardKey),
  ]);

  if (
    !pack
    || pack.state !== "current"
    || pack.supersededAt !== null
    || currentPack?.id !== pack.id
  ) {
    return null;
  }

  return pack;
}
