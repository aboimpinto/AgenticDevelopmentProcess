import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { ManualTestVerificationPackRecord } from "@hepha/db";
import type { ManualTestAdapterContext } from "./adapter-context.js";

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
      isReady: applicability === "applicable" && manualTestCount > 0 && invalidManualTestCount === 0,
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
