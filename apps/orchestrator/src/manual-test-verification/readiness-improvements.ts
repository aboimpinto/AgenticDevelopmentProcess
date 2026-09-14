import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { writeFileAtomic } from "./artifact-storage.js";
import type { CoverageRecoveryRecord } from "./acceptance-coverage-reconciliation.js";

export const readinessImprovementsPath = (memoryBank: string, featureId: string) => resolve(memoryBank, "LessonsLearned", `${featureId.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}-readiness-improvements.md`);

/** The recovery record is the durable outbox. Lesson publication is advisory and
 * never alters the accepted feature or its manual/execution evidence hashes. */
export function publishReadinessImprovements(memoryBank: string, featureId: string, record: CoverageRecoveryRecord) {
  if (!record.improvements?.length) return;
  const file = readinessImprovementsPath(memoryBank, featureId);
  try {
    const existing = existsSync(file) ? readFileSync(file, "utf8") : "---\nstatus: proposed-for-future-planning\n---\n\n# Readiness improvement proposals\n\nThese observations are not current feature requirements. Consider them in a future approved Deep-Dive and Refinement.\n";
    const additions = record.improvements.filter(item => !existing.includes(`<!-- improvement:${item.id} -->`));
    if (!additions.length) return;
    writeFileAtomic(file, existing + additions.map(item => `\n<!-- improvement:${item.id} -->\n## ${item.observation}\n\n${item.rationale}\n\nBaseline: ${record.baselineId}\n\nReferences: ${item.references.join(", ")}\n`).join(""));
  } catch { /* Durable proposals remain in completion-recovery.json for retry. */ }
}
