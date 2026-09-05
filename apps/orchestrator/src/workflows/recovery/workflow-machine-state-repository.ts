import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import {
  readFeatureTasksPhaseStatus,
  updateFeatureTasksPhaseStatus,
} from "../../feature-tasks-phase-status.js";
import { getNumberedPhases } from "../phases/phase-lifecycle-policy.js";
import {
  replaceImplementationPhaseStatusLine,
} from "../phases/phase-status-document-repository.js";

export interface WorkflowRecoveryMachineStateSnapshot {
  readonly files: ReadonlyMap<string, string>;
}

export interface PhaseWorkerMachineStateSnapshot {
  readonly featureTasksPath: string;
  readonly phaseNumber: number;
  readonly featureTasksStatus: string | null;
  readonly phasePath: string;
  readonly phaseStatus: string | null;
  readonly phaseTaskLedger: string | null;
  readonly phaseTaskState: string | null;
  readonly qualityGateEvidence: string | null;
}

/** Preserves machine-owned workflow documents around diagnostic or implementation agents. */
export class WorkflowMachineStateRepository {
  capturePhaseWorker(
    feature: WorkItemCard,
    phase: PhaseSummary & { number: number },
  ): PhaseWorkerMachineStateSnapshot {
    const markdown = existsSync(phase.documentPath) ? readFileSync(phase.documentPath, "utf8") : "";
    const featureTasksPath = resolve(feature.folderPath, "FeatureTasks.md");
    const featureTasksMarkdown = existsSync(featureTasksPath) ? readFileSync(featureTasksPath, "utf8") : "";
    return {
      featureTasksPath,
      phaseNumber: phase.number,
      featureTasksStatus: readFeatureTasksPhaseStatus(featureTasksMarkdown, phase.number),
      phasePath: phase.documentPath,
      phaseStatus: markdown.match(/^\*\*Status:\*\*\s*(.+?)\s*$/im)?.[1] ?? null,
      phaseTaskLedger: readMarkdownSection(markdown, "Phase Task Ledger"),
      phaseTaskState: readMarkdownSection(markdown, "Hepha Task State"),
      qualityGateEvidence: readMarkdownSection(markdown, "Quality Gate Evidence"),
    };
  }

  restorePhaseWorker(snapshot: PhaseWorkerMachineStateSnapshot): string[] {
    const restored: string[] = [];
    if (existsSync(snapshot.phasePath)) {
      const original = readFileSync(snapshot.phasePath, "utf8");
      let next = original;
      if (snapshot.phaseStatus !== null) {
        next = replaceImplementationPhaseStatusLine(next, snapshot.phaseStatus);
      }
      for (const [heading, section] of [
        ["Phase Task Ledger", snapshot.phaseTaskLedger],
        ["Hepha Task State", snapshot.phaseTaskState],
        ["Quality Gate Evidence", snapshot.qualityGateEvidence],
      ] as const) {
        if (section !== null) next = upsertMarkdownSection(next, heading, section);
      }
      if (next !== original) {
        writeFileSync(snapshot.phasePath, `${next.trimEnd()}\n`, "utf8");
        restored.push(basename(snapshot.phasePath));
      }
    }
    if (snapshot.featureTasksStatus !== null && existsSync(snapshot.featureTasksPath)) {
      const before = readFileSync(snapshot.featureTasksPath, "utf8");
      updateFeatureTasksPhaseStatus(snapshot.featureTasksPath, snapshot.phaseNumber, snapshot.featureTasksStatus);
      if (readFileSync(snapshot.featureTasksPath, "utf8") !== before) restored.push("FeatureTasks.md");
    }
    return restored;
  }

  captureRecovery(feature: WorkItemCard): WorkflowRecoveryMachineStateSnapshot {
    const paths = [
      resolve(feature.folderPath, "FeatureTasks.md"),
      ...getNumberedPhases(feature).map((phase) => phase.documentPath),
    ];
    return {
      files: new Map(
        paths
          .filter((path) => existsSync(path))
          .map((path) => [path, readFileSync(path, "utf8")]),
      ),
    };
  }

  restoreRecovery(snapshot: WorkflowRecoveryMachineStateSnapshot): string[] {
    const restored: string[] = [];
    for (const [path, original] of snapshot.files) {
      if (!existsSync(path) || readFileSync(path, "utf8") === original) continue;
      writeFileSync(path, original, "utf8");
      restored.push(basename(path));
    }
    return restored;
  }
}

export function readMarkdownSection(markdown: string, heading: string): string | null {
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "im");
  const match = headingPattern.exec(markdown);
  if (!match) return null;
  const afterHeading = match.index + match[0].length;
  const nextHeading = /^##\s+/m.exec(markdown.slice(afterHeading));
  const end = nextHeading ? afterHeading + nextHeading.index : markdown.length;
  return markdown.slice(match.index, end).trimEnd();
}

export { readFeatureTasksPhaseStatus } from "../../feature-tasks-phase-status.js";

function upsertMarkdownSection(markdown: string, heading: string, section: string) {
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "im");
  const headingMatch = headingPattern.exec(markdown);

  if (!headingMatch) {
    return `${markdown.trimEnd()}\n\n${section.trimEnd()}`;
  }

  const afterHeadingIndex = headingMatch.index + headingMatch[0].length;
  const nextHeadingMatch = /^##\s+/m.exec(markdown.slice(afterHeadingIndex));
  const sectionEndIndex =
    nextHeadingMatch?.index === undefined ? markdown.length : afterHeadingIndex + nextHeadingMatch.index;

  return `${markdown.slice(0, headingMatch.index).trimEnd()}\n\n${section.trimEnd()}\n\n${markdown
    .slice(sectionEndIndex)
    .trimStart()}`.trimEnd();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
