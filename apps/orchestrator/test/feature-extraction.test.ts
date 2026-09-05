import { describe, expect, it } from "vitest";
import {
  buildUnnamedFeatureDiscoveryPrompt,
  parseDiscoveredFeatures,
  renderSubmittedFeatureDocument,
} from "../src/feature-extraction.js";

describe("parseDiscoveredFeatures", () => {
  it("parses planned features from fenced model JSON", () => {
    const features = parseDiscoveredFeatures(`
\`\`\`json
{
  "features": [
    {
      "title": "FEAT-999: Command ownership guard",
      "description": "Move command ownership checks into the dispatch boundary.",
      "acceptanceCriteria": [
        "Dispatch rejects commands owned by another surface."
      ]
    }
  ]
}
\`\`\`
`);

    expect(features).toEqual([
      {
        acceptanceCriteria: ["Dispatch rejects commands owned by another surface."],
        dependencyIds: [],
        description: "Move command ownership checks into the dispatch boundary.",
        priority: null,
        title: "Command ownership guard",
      },
    ]);
  });

  it("drops invalid and duplicate feature candidates", () => {
    const features = parseDiscoveredFeatures(
      JSON.stringify({
        features: [
          { title: "Layer 3 completion", description: "Finish the remaining layer 3 work." },
          { title: "Layer 3 completion", description: "Duplicate title." },
          { title: "None", description: "No work." },
          { title: "Missing description" },
        ],
      }),
    );

    expect(features).toHaveLength(1);
    expect(features[0]?.title).toBe("Layer 3 completion");
    expect(features[0]?.dependencyIds).toEqual([]);
    expect(features[0]?.priority).toBeNull();
  });
});

describe("renderSubmittedFeatureDocument", () => {
  it("renders a submitted FEAT document with an EPIC backlink", () => {
    const markdown = renderSubmittedFeatureDocument({
      epicId: "EPIC-001",
      epicTitle: "Command Dispatch and Ownership Refactor",
      feature: {
        acceptanceCriteria: ["The dispatch boundary owns command routing."],
        dependencyIds: [],
        description: "Create the final dispatch boundary for layer 3.",
        priority: null,
        title: "Dispatch boundary completion",
      },
      featureId: "FEAT-001",
    });

    expect(markdown).toContain("# FEAT-001: Dispatch boundary completion");
    expect(markdown).toContain("**Parent Epic**: EPIC-001");
    expect(markdown).toContain("- EPIC: EPIC-001 - Command Dispatch and Ownership Refactor");
    expect(markdown).toContain("- The dispatch boundary owns command routing.");
  });

  it("renders dependency and priority when provided", () => {
    const markdown = renderSubmittedFeatureDocument({
      epicId: "EPIC-001",
      epicTitle: "Command Dispatch",
      feature: {
        acceptanceCriteria: ["Criterion 1"],
        dependencyIds: ["FEAT-002", "FEAT-003"],
        description: "Implement command dispatch.",
        priority: "P1",
        title: "Dispatch boundary",
      },
      featureId: "FEAT-010",
    });

    expect(markdown).toContain("**Priority**: P1");
    expect(markdown).toContain("- FEAT-002");
    expect(markdown).toContain("- FEAT-003");
  });
});

describe("buildUnnamedFeatureDiscoveryPrompt", () => {
  it("includes existing FEATs so the model can avoid duplicates", () => {
    const prompt = buildUnnamedFeatureDiscoveryPrompt({
      epicId: "EPIC-001",
      epicMarkdown: "# EPIC-001",
      epicTitle: "Command Dispatch",
      existingFeatures: [
        {
          externalId: "FEAT-001",
          summary: "Existing command parser work.",
          title: "Command parser migration",
        },
      ],
    });

    expect(prompt).toContain("FEAT-001: Command parser migration - Existing command parser work.");
    expect(prompt).toContain('Return { "features": [] }');
  });
});
