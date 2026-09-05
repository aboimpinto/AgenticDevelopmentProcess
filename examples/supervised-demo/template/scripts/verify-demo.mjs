import { readFileSync } from "node:fs";

const epic = readFileSync(
  new URL("../MemoryBank/Features/00_EPICS/EPIC-001-reliable-daily-planning/EpicDescription.md", import.meta.url),
  "utf8",
);
const feature = readFileSync(
  new URL("../MemoryBank/Features/01_SUBMITTED/FEAT-001-due-date-filter/FeatureDescription.md", import.meta.url),
  "utf8",
);

const requiredEpicText = ["# EPIC-001:", "## Success Criteria", "FEAT-001"];
const requiredFeatureText = ["# FEAT-001:", "## User Story", "## Acceptance Criteria"];
const missing = [
  ...requiredEpicText.filter((value) => !epic.includes(value)),
  ...requiredFeatureText.filter((value) => !feature.includes(value)),
];

if (missing.length > 0) {
  console.error(`Demo verification failed; missing required content: ${missing.join(", ")}`);
  process.exitCode = 1;
} else {
  const unresolved = feature.match(/\[NEEDS(?:\s+|_+)VALIDATION\]/gi)?.length ?? 0;
  console.log(`Demo product artifacts are valid. Unresolved decisions: ${unresolved}.`);
}
