import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCEPTANCE_RESPONSIBILITY_POLICY } from "../src/acceptance-responsibility-policy.js";
import { buildSubmitEpicIdeaPrompt, buildSubmitEpicFinalizerPrompt, normalizeSubmitEpicInput, renderSubmittedEpicDocument } from "../src/epic-submission.js";
import { buildEpicRefinementPrompt } from "../src/epic-refinement.js";
import { buildUnnamedFeatureDiscoveryPrompt, renderSubmittedFeatureDocument } from "../src/feature-extraction.js";
import { renderSubmitFeatureDocument } from "../src/feature-submission.js";
import { renderPhasePlanningAcceptanceRules } from "../src/workflows/prompts/phase-planning-acceptance-prompt.js";
import { verificationContract } from "../src/workflows/prompts/verification-contract.js";

const draft = normalizeSubmitEpicInput({ projectId: "project-any", title: "Account workflow", description: "A bounded account workflow", successCriteria: "EPIC-AC-A: the complete workflow preserves account state" });
const feature = { title: "Account state", description: "One workflow contribution", acceptanceCriteria: ["FEAT-AC-A: isolated state changes preserve the contract"], dependencyIds: [], priority: null };

describe("acceptance ownership reaches artifact producers and their consumers", () => {
  const outputs = [
    ["EPIC idea", buildSubmitEpicIdeaPrompt({ existingEpics: [], ideaText: "A bounded workflow", projectName: "Synthetic" })],
    ["EPIC finalization", buildSubmitEpicFinalizerPrompt({ draft, existingEpics: [], existingFeatures: [], projectName: "Synthetic" })],
    ["EPIC refinement", buildEpicRefinementPrompt({ currentMarkdown: "# Initiative", epicId: "EPIC-901", previousRefinements: [], request: "Clarify acceptance", title: "Initiative" })],
    ["FEAT slicing", buildUnnamedFeatureDiscoveryPrompt({ epicId: "EPIC-901", epicMarkdown: "# Initiative", epicTitle: "Initiative", existingFeatures: [] })],
    ["EPIC artifact", renderSubmittedEpicDocument({ createdDate: "2030-01-01", epicId: "EPIC-901", input: draft })],
    ["FEAT artifact", renderSubmittedFeatureDocument({ epicId: "EPIC-901", epicTitle: "Initiative", featureId: "FEAT-901", feature })],
    ["standalone FEAT artifact", renderSubmitFeatureDocument({ featureId: "FEAT-902", title: "Standalone contribution", summary: "A bounded standalone scope", acceptanceCriteria: feature.acceptanceCriteria })],
    ["phase and task planning", renderPhasePlanningAcceptanceRules({ isPlanningPhase: true, featurePlanningArtifactFileName: "planning.md", epicAcceptanceTestsFileName: "workflow-acceptance.md" }).join("\n")],
    ["phase and task implementation", renderPhasePlanningAcceptanceRules({ isPlanningPhase: false, featurePlanningArtifactFileName: "planning.md", epicAcceptanceTestsFileName: "workflow-acceptance.md" }).join("\n")],
    ["independent verification", verificationContract()],
  ];
  it.each(outputs)("%s receives the same four-level responsibility policy", (_name, text) => {
    expect(text).toContain(ACCEPTANCE_RESPONSIBILITY_POLICY);
    for (const level of ["EPIC", "FEAT", "Phase", "Task"]) expect(text).toContain(`| ${level} |`);
    expect(text).toContain("A passing TwinTest does not replace that E2E obligation");
    expect(text).toContain("many-to-many");
    expect(text).toContain("Apply the same coverage assessment during Task, Phase, FEAT and EPIC acceptance");
    expect(text).toContain("Explain what each test proves and whether an incorrect implementation would make it fail");
    expect(text).toContain("Coverage percentages and test counts are diagnostic signals");
    expect(text).toContain("missing required acceptance coverage block acceptance");
    expect(text).toContain("stable criterion IDs and parent links");
    expect(text).toContain("relevant implementation files");
    expect(text).toContain("For a bug, first add or select an E2E or TwinTest that reproduces the failure");
  });
  it("preserves distinct acceptance criteria and EPIC parent identity in generated documents", () => {
    expect(outputs.find(([name]) => name === "EPIC artifact")?.[1]).toContain(draft.successCriteria[0]);
    const document = outputs.find(([name]) => name === "FEAT artifact")?.[1];
    expect(document).toContain("**Parent Epic**: EPIC-901");
    expect(document).toContain(feature.acceptanceCriteria[0]);
  });
  it("keeps the durable policy documentation identical to the injected contract", () => {
    expect(readFileSync(new URL("../../../docs/architecture/acceptance-responsibility-policy.md", import.meta.url), "utf8").trim()).toBe(ACCEPTANCE_RESPONSIBILITY_POLICY);
  });
});
