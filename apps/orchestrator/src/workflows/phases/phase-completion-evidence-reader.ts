import { existsSync, readFileSync } from "node:fs";
import type { PhaseSummary } from "@hepha/shared";
import {
  extractFindingTasksBlock,
  getHumanReviewFindingSections,
} from "../../application/features/human-review-finding-document-repository.js";
import {
  formatPhaseReference,
  isImplementationPhaseCompleted,
  normalizeImplementationPhaseStatus,
} from "./phase-lifecycle-policy.js";

export class PhaseCompletionEvidenceReader {
  has(phase: PhaseSummary) {
    if (!isImplementationPhaseCompleted(phase)) {
      return false;
    }

    if (!existsSync(phase.documentPath)) {
      return false;
    }

    const markdown = readFileSync(phase.documentPath, "utf8");
    const checklist = getMarkdownChecklistStats(markdown);

    return checklist.total === 0 || checklist.unchecked === 0;
  }

  summarize(phase: PhaseSummary) {
    const status = normalizeImplementationPhaseStatus(phase.status);

    if (!existsSync(phase.documentPath)) {
      return `${formatPhaseReference(phase)} document was not found.`;
    }

    const markdown = readFileSync(phase.documentPath, "utf8");
    const checklist = getMarkdownChecklistStats(markdown);

    if (status !== "COMPLETED") {
      const blockerSummary = extractPhaseBlockerSummary(markdown);

      if (blockerSummary) {
        return `${formatPhaseReference(phase)} is blocked: ${blockerSummary}`;
      }

      return `${formatPhaseReference(phase)} status is ${phase.status || "Unknown"}, not COMPLETED.`;
    }

    if (checklist.unchecked > 0) {
      return `${formatPhaseReference(phase)} still has ${checklist.unchecked}/${checklist.total} unchecked task/checkpoint items.`;
    }

    return `${formatPhaseReference(phase)} has insufficient completion evidence.`;
  }

  summarizeHumanReview(phase: PhaseSummary): { message: string; ok: boolean } {
    const phasePath = phase.documentRelativePath || phase.fileName;

    if (!existsSync(phase.documentPath)) {
      return {
        message: `${formatPhaseReference(phase)} document was not found: ${phasePath}.`,
        ok: false,
      };
    }

    const markdown = readFileSync(phase.documentPath, "utf8");
    const sections = getHumanReviewFindingSections(markdown);

    if (sections.length === 0) {
      return {
        message: `${formatPhaseReference(phase)} has no recorded finding sections.`,
        ok: false,
      };
    }

    for (const section of sections) {
      const content = markdown.slice(section.start, section.end);

      if (!/\*\*Finding Tasks:\*\*/i.test(content)) {
        return {
          message: `${formatPhaseReference(phase)} finding ${section.findingId} has no task checklist.`,
          ok: false,
        };
      }

      if (/^\s*-\s+\[\s\]\s+/m.test(extractFindingTasksBlock(content))) {
        return {
          message: `${formatPhaseReference(phase)} finding ${section.findingId} still has unchecked finding tasks.`,
          ok: false,
        };
      }

      if (!/####\s+Agent Response/i.test(content) && !/\*\*Status:\*\*\s*COMPLETED/i.test(content)) {
        return {
          message: `${formatPhaseReference(phase)} finding ${section.findingId} has no agent response.`,
          ok: false,
        };
      }
    }

    return {
      message: `${formatPhaseReference(phase)} has finding task and response evidence.`,
      ok: true,
    };
  }
}

export function extractPhaseBlockerSummary(markdown: string) {
  const blockerLine = markdown
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^-+\s*/, ""))
    .find((line) => /^(validation blocker|blocker|blocked)\s*:/i.test(line) || /^blocked pending\b/i.test(line));

  return blockerLine ? truncate(blockerLine, 700) : null;
}

export function getMarkdownChecklistStats(markdown: string) {
  const stats = {
    checked: 0,
    total: 0,
    unchecked: 0,
  };

  for (const match of markdown.matchAll(/^\s*[-*]\s+\[([ xX-])\]\s+/gm)) {
    stats.total += 1;

    if (match[1] === " ") {
      stats.unchecked += 1;
    } else {
      stats.checked += 1;
    }
  }

  return stats;
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}...`;
}
