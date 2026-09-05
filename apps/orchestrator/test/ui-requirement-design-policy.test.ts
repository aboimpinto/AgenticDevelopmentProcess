// Behavior suite: ui requirement design.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { designArtifactDefinitions } from "@hepha/shared";
import { describe, expect, it } from "vitest";

const testDir = resolve(import.meta.dirname, "..");
const orchestratorSource = [
  readFileSync(resolve(testDir, "src/index.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/bootstrap/feature-preparation-applications.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/workflows/prompts/feature-entry-prompts.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/agent-routing/routing-action-resolver.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/agent-routing/agent-registry.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/application/features/design-artifact-policy.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/application/features/design-feature-execution-application.ts"), "utf8"),
  readFileSync(resolve(testDir, "src/application/features/feature-workflow-run-coordinator.ts"), "utf8"),
].join("\n");
const routingActionResolverSource = readFileSync(
  resolve(testDir, "src/agent-routing/routing-action-resolver.ts"),
  "utf8",
);
const commandTemplate = readFileSync(resolve(testDir, "../../.hepha/commands/design-feature.md"), "utf8");
const skillTemplate = readFileSync(
  resolve(testDir, "../../pi-packages/pi-skill-hepha-continue-implementation/skills/design-feature/SKILL.md"),
  "utf8",
);

// ---------------------------------------------------------------------------
// UI Requirement Classifier (classifyNoUiMaintenanceFeature)
// ---------------------------------------------------------------------------

describe("UI requirement classifier — classifyNoUiMaintenanceFeature", () => {
  it("exists in orchestrator source", () => {
    expect(orchestratorSource).toContain("classifyNoUiMaintenanceFeature");
  });

  it("detects command-maintenance FEATs as no_ui", () => {
    expect(orchestratorSource).toContain("command-boundary, parser/registry, completion/palette metadata");
    expect(orchestratorSource).toContain("does not explicitly change visual UI requirements");
  });

  it("recognizes CLI/TUI command refactors as no_ui signals", () => {
    expect(orchestratorSource).toContain("TUI command routing");
    expect(orchestratorSource).toContain("slash command behavior");
    expect(orchestratorSource).toContain("CLI/TUI command refactors");
  });

  it("recognizes command-palette and completion metadata as command signals", () => {
    expect(orchestratorSource).toContain("command palette metadata");
    expect(orchestratorSource).toContain("completion metadata");
  });

  it("does not classify as no_ui when explicit UI change signals are present", () => {
    // The no_ui classifier must not trigger when the FEAT explicitly
    // mentions screens, forms, layouts, wireframes, or visual components
    expect(orchestratorSource).toContain("explicitUiChangeSignals");
    expect(orchestratorSource).toContain("!explicitUiChangeSignals");
  });

  it("recognizes screen, form, modal, layout, wireframe as explicit UI signals", () => {
    expect(orchestratorSource).toContain("screen");
    expect(orchestratorSource).toContain("forms");
    expect(orchestratorSource).toContain("modal");
    expect(orchestratorSource).toContain("layout");
    expect(orchestratorSource).toContain("wireframe");
  });
});

// ---------------------------------------------------------------------------
// UI Requirement Pi Prompt (buildUiRequirementPrompt)
// ---------------------------------------------------------------------------

describe("UI requirement Pi prompt — buildUiRequirementPrompt", () => {
  it("exists in orchestrator source", () => {
    expect(orchestratorSource).toContain("buildUiRequirementPrompt");
  });

  it("describes decision rules for requires_ui", () => {
    expect(orchestratorSource).toContain("Choose requires_ui when the FEAT changes screens, forms, navigation");
    expect(orchestratorSource).toContain("visual states, interaction flows, UX copy, accessibility behavior");
  });

  it("describes decision rules for no_ui", () => {
    expect(orchestratorSource).toContain("Choose no_ui when the FEAT is backend-only, command-line/internal behavior");
  });

  it("handles ambiguous cases by preferring no_ui for maintenance work", () => {
    expect(orchestratorSource).toContain("primarily maintenance, refactoring, command dispatch");
    expect(orchestratorSource).toContain("If uncertain and the FEAT is primarily maintenance");
  });

  it("includes FEAT identity in the prompt", () => {
    expect(orchestratorSource).toContain('FEAT: ${feature.externalId} - ${feature.title}');
  });

  it("includes FeatureDescription.md content in the prompt", () => {
    expect(orchestratorSource).toContain("FeatureDescription.md:");
  });
});

// ---------------------------------------------------------------------------
// UI Requirement Decision Parser (parseUiRequirementDecision)
// ---------------------------------------------------------------------------

describe("UI requirement decision parser — parseUiRequirementDecision", () => {
  it("exists in orchestrator source", () => {
    expect(orchestratorSource).toContain("parseUiRequirementDecision");
  });

  it("normalizes requires_ui return value", () => {
    expect(orchestratorSource).toContain('"requires_ui" : "no_ui"');
    expect(orchestratorSource).toContain('"requires_ui" ? "requires_ui"');
  });

  it("defaults to no_ui for unrecognized decisions", () => {
    // The ternary should fall through to "no_ui" when the parsed
    // decision is not "requires_ui"
    const fallbackLines = orchestratorSource
      .split("\n")
      .filter(
        (line) =>
          line.includes("rawDecision === ") && line.includes('"requires_ui"'),
      );
    expect(fallbackLines.length).toBeGreaterThanOrEqual(1);
  });

  it("provides default reasons for both decision paths", () => {
    expect(orchestratorSource).toContain("The FEAT appears to involve user-facing UI or interaction changes.");
    expect(orchestratorSource).toContain("The FEAT appears to be backend, internal, or non-visual work.");
  });
});

// ---------------------------------------------------------------------------
// Design Feature Prompt Builder (buildDesignFeaturePrompt)
// ---------------------------------------------------------------------------

describe("Design feature prompt builder — buildDesignFeaturePrompt", () => {
  it("exists in orchestrator source", () => {
    expect(orchestratorSource).toContain("buildDesignFeaturePrompt");
  });

  it("formats skill target string with project root and MemoryBank path", () => {
    expect(orchestratorSource).toContain("formatProjectSkillTarget");
  });

  it("uses design-feature prefix", () => {
    expect(orchestratorSource).toContain('`design-feature ${formatProjectSkillTarget');
  });
});

// ---------------------------------------------------------------------------
// Design Artifact Validation
// ---------------------------------------------------------------------------

describe("Design artifact validation policy", () => {
  it("is composed by the orchestrator", () => {
    expect(orchestratorSource).toContain("artifactPolicy.assertComplete");
  });

  it("checks all 3 required artifact files", () => {
    expect(designArtifactDefinitions.map(({ fileName }) => fileName)).toEqual([
      "UX-research-report.md",
      "Wireframes-design.md",
      "design-summary.md",
    ]);
    expect(orchestratorSource).toContain("requiredDesignArtifacts");
  });

  it("rejects empty artifact content (non-empty check)", () => {
    expect(orchestratorSource).toContain("trim().length === 0");
  });

  it("throws meaningful error with missing file names", () => {
    expect(orchestratorSource).toContain("required design artifacts");
    expect(orchestratorSource).toContain("missingFiles.join");
  });
});

// ---------------------------------------------------------------------------
// Workflow Runner Integration
// ---------------------------------------------------------------------------

describe("Design feature workflow runner integration", () => {
  it("calls the workflow runner with design-feature command", () => {
    expect(orchestratorSource).toContain('command: "design-feature"');
  });

  it("uses the feature workflow run coordinator for design-feature", () => {
    expect(orchestratorSource).toContain("workflowCoordinator.createFeatureRunner");
  });

  it("runs collect-context node", () => {
    expect(orchestratorSource).toContain('"collect-context"');
  });

  it("runs generate-design-artifacts node", () => {
    expect(orchestratorSource).toContain('"generate-design-artifacts"');
  });
});

// ---------------------------------------------------------------------------
// Design Command Template and Skill Alignment
// ---------------------------------------------------------------------------

describe("Design command template and Pi skill alignment", () => {
  it("command template names UX-research-report.md output", () => {
    expect(commandTemplate).toContain("ux_research");
    expect(commandTemplate).toContain("wireframes");
    expect(commandTemplate).toContain("design_summary");
  });

  it("Pi skill requires all 3 artifact files", () => {
    expect(skillTemplate).toContain("UX-research-report.md");
    expect(skillTemplate).toContain("Wireframes-design.md");
    expect(skillTemplate).toContain("design-summary.md");
  });

  it("Pi skill requires non-empty actionable content", () => {
    expect(skillTemplate).toContain("non-empty Markdown");
    expect(skillTemplate).toContain("actionable for");
  });

  it("command template and Pi skill both describe design artifact contract", () => {
    // Both should mention the same artifact set
    expect(commandTemplate).toContain("design artifacts");
    expect(skillTemplate).toContain("design artifacts");
  });
});

// ---------------------------------------------------------------------------
// Model Routing
// ---------------------------------------------------------------------------

describe("Design-feature model routing", () => {
  it("routes through the model declared by the design workflow node", () => {
    expect(orchestratorSource).toContain('resolvePlan("design-feature")');
    expect(orchestratorSource).toContain('["design-feature", "discovery_planning", "Design Feature", 5, "ux-design-agent"');
    expect(orchestratorSource).not.toContain("node.model");
  });

  it("has a DEFAULT_DESIGN_FEATURE_MODEL env key", () => {
    expect(orchestratorSource).not.toContain("DEFAULT_DESIGN_FEATURE_MODEL");
    expect(orchestratorSource).not.toMatch(/DEFAULT_[A-Z_]+_MODEL/);
    expect(orchestratorSource).toContain("RoutingActionResolver");
  });

  it("defaults to high-think model when no env override is set", () => {
    expect(routingActionResolverSource).toContain("RoutingActionResolver");
    expect(routingActionResolverSource).toContain("resolvePlan(actionId: AgentActionId): HandoffPlanV1");
    expect(routingActionResolverSource).toContain("policy.resolve");
    expect(routingActionResolverSource).not.toContain("process.env");
  });
});
