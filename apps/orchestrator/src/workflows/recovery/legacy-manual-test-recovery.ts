import { readFileSync, writeFileSync } from "node:fs";
import {
  MANUAL_TEST_SKIP_REASON,
  persistManualTestObligation,
  type ManualTestDeferralV1,
} from "../../manual-test-obligation.js";

/**
 * Deterministic recovery for pre-V3 phase documents that have no HEPHA task
 * ledger. New V3 workflows must use SQLite task settlement instead.
 */
export function recoverLegacyManualTestTask(input: {
  readonly featureFolderPath: string;
  readonly featureId: string;
  readonly phaseDocumentPath: string;
  readonly taskHeading: string;
  readonly obligation: ManualTestDeferralV1;
}): void {
  const markdown = readFileSync(input.phaseDocumentPath, "utf8");
  if (/^##\s+Phase Task Ledger\s*$/im.test(markdown)) {
    throw new Error("LEGACY_MANUAL_TEST_RECOVERY_REJECTED: V3 task ledgers must be settled through SQLite.");
  }
  if (input.obligation.reason !== MANUAL_TEST_SKIP_REASON) {
    throw new Error("LEGACY_MANUAL_TEST_RECOVERY_REJECTED: non-canonical skip reason.");
  }
  const escapedHeading = escapeRegex(input.taskHeading.trim());
  const headingPattern = new RegExp(`^###\\s+${escapedHeading}\\s*$`, "gm");
  const matches = [...markdown.matchAll(headingPattern)];
  if (matches.length !== 1 || matches[0]?.index === undefined) {
    throw new Error("LEGACY_MANUAL_TEST_RECOVERY_REJECTED: task heading must match exactly once.");
  }
  const start = matches[0].index;
  const afterHeading = start + matches[0][0].length;
  const nextHeadingOffset = markdown.slice(afterHeading).search(/^###\s+/m);
  const end = nextHeadingOffset < 0 ? markdown.length : afterHeading + nextHeadingOffset;
  const section = markdown.slice(start, end);
  const statusMatches = [...section.matchAll(/^\*\*Status\*\*:\s*.*$/gm)];
  if (statusMatches.length !== 1) {
    throw new Error("LEGACY_MANUAL_TEST_RECOVERY_REJECTED: task requires exactly one Status field.");
  }
  let updatedSection = section.replace(/^\*\*Status\*\*:\s*.*$/m, "**Status**: SKIPPED");
  const skipProjection = [
    `**Skip Reason**: ${MANUAL_TEST_SKIP_REASON}`,
    `**Manual TestPack Obligation**: ${input.obligation.id} — PENDING`,
  ].join("\n");
  if (/^\*\*Skip Reason\*\*:/m.test(updatedSection)) {
    updatedSection = updatedSection.replace(
      /^\*\*Skip Reason\*\*:\s*.*$/m,
      `**Skip Reason**: ${MANUAL_TEST_SKIP_REASON}`,
    );
    const obligationLine = /^\*\*Manual TestPack Obligation\*\*:\s*(.*)$/m.exec(updatedSection)?.[1] ?? "";
    if (!obligationLine.includes(input.obligation.id)) {
      const ids = obligationLine.replace(/\s*—\s*PENDING\s*$/, "").trim();
      updatedSection = updatedSection.replace(
        /^\*\*Manual TestPack Obligation\*\*:\s*.*$/m,
        `**Manual TestPack Obligation**: ${[ids, input.obligation.id].filter(Boolean).join(", ")} — PENDING`,
      );
    }
  } else {
    updatedSection = updatedSection.replace(/^\*\*Status\*\*: SKIPPED$/m, `**Status**: SKIPPED\n${skipProjection}`);
  }
  writeFileSync(
    input.phaseDocumentPath,
    `${markdown.slice(0, start)}${updatedSection}${markdown.slice(end)}`,
    "utf8",
  );
  persistManualTestObligation(input.featureFolderPath, input.featureId, input.obligation);
}

/**
 * Normalizes a Markdown task heading into an identifier-safe key so worker
 * deferrals can address legacy headings deterministically. For example
 * `Task 7.5: Physical matrix` becomes `task-7-5-physical-matrix`.
 */
export function normalizeLegacyTaskHeading(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Resolves a worker taskId to exactly one legacy `###` task heading.
 * Fails closed: zero or multiple normalized matches are rejected so an
 * obligation is never attached to the wrong task.
 */
export function resolveLegacyTaskHeading(documentPath: string, taskId: string): string {
  const markdown = readFileSync(documentPath, "utf8");
  const normalizedTarget = normalizeLegacyTaskHeading(taskId);
  const headings = [...markdown.matchAll(/^###\s+(.+?)\s*$/gm)].map((match) => match[1]!.trim());
  const matches = headings.filter((heading) => normalizeLegacyTaskHeading(heading) === normalizedTarget);
  if (matches.length !== 1) {
    throw new Error(`LEGACY_MANUAL_TEST_RECOVERY_REJECTED: taskId '${taskId}' must resolve to exactly one '###' task heading; found ${matches.length}.`);
  }
  return matches[0]!;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
