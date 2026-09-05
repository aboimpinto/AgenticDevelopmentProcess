import { describe, expect, it } from "vitest";
import { renderPhasePlanningAcceptanceRules } from "../src/workflows/prompts/phase-planning-acceptance-prompt.js";

const base = { epicAcceptanceTestsFileName: "Acceptance.md", featurePlanningArtifactFileName: "plan.md" };

describe("phase planning and acceptance prompt", () => {
  it("requires a planning phase to create the semantic cross-phase handoff", () => {
    const rules = renderPhasePlanningAcceptanceRules({ ...base, isPlanningPhase: true }).join("\n");
    expect(rules).toContain("Create or update `plan.md` before completion");
    expect(rules).toContain("phase dependency map");
    expect(rules).toContain("`## Phase Implementation Index`");
    expect(rules).toContain("producer/consumer handoffs");
    expect(rules).toContain("helper-only tests are insufficient");
  });

  it("requires a later phase to read semantic planning sections rather than redo planning", () => {
    const rules = renderPhasePlanningAcceptanceRules({ ...base, isPlanningPhase: false }).join("\n");
    expect(rules).toContain("Read this phase's row in the planning artifact");
    expect(rules).toContain("every named heading from the full artifact on disk");
    expect(rules).toContain("Do not redo planning from scratch");
  });

  it("uses one canonical planning filename and repairs missing or contradictory planning", () => {
    const rules = renderPhasePlanningAcceptanceRules({ ...base, isPlanningPhase: false }).join("\n");
    expect(rules).toContain("exact canonical filename `plan.md`");
    expect(rules).toContain("consolidate useful content into `plan.md`");
    expect(rules).toContain("repair the artifact or mark the phase BLOCKED");
  });

  it("maps Product Owner acceptance to exact executable evidence without duplicates", () => {
    const rules = renderPhasePlanningAcceptanceRules({ ...base, isPlanningPhase: false }).join("\n");
    expect(rules).toContain("`Acceptance.md`");
    expect(rules).toContain("search existing tests and static checks");
    expect(rules).toContain("acceptance test ID/title -> real test file/name");
    expect(rules).toContain("Do not mark the phase complete");
  });
});
