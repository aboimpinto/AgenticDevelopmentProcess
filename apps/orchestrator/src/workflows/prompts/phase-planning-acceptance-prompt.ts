export interface PhasePlanningAcceptancePromptInput {
  epicAcceptanceTestsFileName: string;
  featurePlanningArtifactFileName: string;
  isPlanningPhase: boolean;
}

/** Renders cross-phase planning handoff and Product Owner acceptance traceability rules. */
export function renderPhasePlanningAcceptanceRules(input: PhasePlanningAcceptancePromptInput) {
  return [
    `- Feature planning artifact: \`${input.featurePlanningArtifactFileName}\` in the FEAT folder.`,
    `- Always use the exact canonical filename \`${input.featurePlanningArtifactFileName}\`. Do not invent alternatives such as phase-1-plan.md, implementation-plan.md, planning.md, or analysis-report.md.`,
    `- If a legacy planning file with a different name already exists, consolidate useful content into \`${input.featurePlanningArtifactFileName}\` and continue using only the canonical file.`,
    input.isPlanningPhase
      ? `- This contract declares the planning role. Create or update \`${input.featurePlanningArtifactFileName}\` before completion. It must include feature scope summary, phase dependency map, a \`## Phase Implementation Index\`, producer/consumer handoffs, interface/API/data/UI contracts, test/evidence matrix, cross-phase risks, future phase expectations, and update rules.`
      : "- Read this phase's row in the planning artifact `## Phase Implementation Index`, then every named heading from the full artifact on disk before implementation. Treat the injected excerpt as navigation context, not a substitute for named source sections. Do not redo planning from scratch.",
    "- The planning-role phase must make the Phase Implementation Index semantic: one row per execution-contract phase, named planning headings to read, implementation obligations/public entry points, acceptance evidence, and next-phase handoff. For validation phases, map each contract rule to each applicable public validator and rejection test; helper-only tests are insufficient.",
    "- If the planning artifact is missing, incomplete, or contradicted by current code, repair the artifact or mark the phase BLOCKED before doing implementation work.",
    "- When this phase changes an interface, data shape, UI contract, or test obligation that a future phase depends on, update the planning artifact before finishing.",
    `- Read Linked EPIC Acceptance Tests context, especially \`${input.epicAcceptanceTestsFileName}\` when present. For each Product Owner acceptance test assigned to this phase, implement or update the real executable test, or link exact existing coverage.`,
    "- Before writing a new acceptance test, search existing tests and static checks for coverage that already satisfies the Product Owner acceptance test. If it exists, link the exact file/test name and do not duplicate it.",
    "- Update FeatureTasks.md and the phase file with acceptance traceability: acceptance test ID/title -> real test file/name or explicit deferred/out-of-scope rationale.",
    "- Do not mark the phase complete while an assigned EPIC acceptance test lacks implementation evidence or exact existing-test mapping.",
  ];
}
