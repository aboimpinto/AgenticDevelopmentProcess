import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { PhaseSummary } from "@hepha/shared";
import type { StoredProject } from "../projects/stored-project.js";
import { loadPhaseExecutionContract } from "../phase-execution-contract.js";
import {
  extractPhaseNumber,
  extractPhaseRouting,
  extractPhaseStatus,
  extractPhaseTitle,
  readFeatureTasksPhaseStatuses,
  readFeatureTasksPhaseTiming,
} from "./phase-document-parser.js";

export function scanFeaturePhases(
  project: StoredProject,
  featureFolderPath: string,
): PhaseSummary[] {
  const phasesPath = resolve(featureFolderPath, "Phases");

  if (!existsSync(phasesPath)) {
    return [];
  }

  const featureTasksPath = resolve(featureFolderPath, "FeatureTasks.md");
  const statusByPhase = readFeatureTasksPhaseStatuses(featureTasksPath);
  const timingByPhase = readFeatureTasksPhaseTiming(featureTasksPath);
  const executionContractByDocument = new Map(
    (loadPhaseExecutionContract(featureFolderPath).contract?.phases ?? [])
      .map((phase) => [phase.document.replaceAll("\\", "/"), phase.id] as const),
  );

  return safeReadDirectory(phasesPath)
    .filter((entry) => entry.toLowerCase().endsWith(".md"))
    .map((fileName) => {
      const documentPath = resolve(phasesPath, fileName);
      const mtime = statSync(documentPath).mtime.toISOString();
      const markdown = readFileSync(documentPath, "utf8");
      const number = extractPhaseNumber(fileName, markdown);
      const routing = extractPhaseRouting(markdown);
      const featureTasksTiming = number === null ? null : timingByPhase.get(number) ?? null;

      return {
        executionContractId: executionContractByDocument.get(`Phases/${fileName}`) ?? null,
        defaultImplementationModel: null,
        documentPath,
        documentRelativePath: normalizeRelativePath(project.rootPath, documentPath),
        estimatedAiTime: routing.estimatedAiTime ?? featureTasksTiming?.estimatedAiTime ?? null,
        estimatedHumanTime: routing.estimatedHumanTime ?? featureTasksTiming?.estimatedHumanTime ?? null,
        fileName,
        number,
        predictedModel: null,
        predictedModelSource: "unavailable_phase_override" as const,
        recommendedAgent: routing.recommendedAgent,
        recommendedModel: routing.recommendedModel,
        status:
          (number === null ? null : extractPhaseStatus(markdown)) ??
          (number !== null ? statusByPhase.get(number) : null) ??
          "Unknown",
        title: extractPhaseTitle(fileName, markdown),
        updatedAt: mtime,
      };
    })
    .sort((left, right) => {
      if (left.number !== null && right.number !== null) return left.number - right.number;
      if (left.number !== null) return -1;
      if (right.number !== null) return 1;
      return left.fileName.localeCompare(right.fileName);
    });
}

function safeReadDirectory(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function normalizeRelativePath(fromPath: string, toPath: string): string {
  const relativePath = relative(fromPath, toPath);
  return relativePath && !relativePath.startsWith("..")
    ? relativePath.replaceAll("\\", "/")
    : toPath;
}
