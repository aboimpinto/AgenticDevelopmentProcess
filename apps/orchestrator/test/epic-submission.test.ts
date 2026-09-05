import { describe, expect, it } from "vitest";
import {
  buildSubmitEpicFinalizerPrompt,
  buildSubmitEpicIdeaPrompt,
  normalizeSubmitEpicInput,
  parseSubmitEpicFinalizerResponse,
  parseSubmitEpicIdeaResponse,
  renderSubmittedEpicDocument,
} from "../src/epic-submission.js";

describe("submit EPIC document rendering", () => {
  it("renders the submit-epic contract with explicit delivery state", () => {
    const input = normalizeSubmitEpicInput({
      description: "Create persistent project memory for lessons learned.",
      priority: "High",
      projectId: "project-1",
      successCriteria: "Lessons are stored\n- New projects can reuse lessons",
      title: "Persistent Lessons Memory",
    });
    const markdown = renderSubmittedEpicDocument({
      createdDate: "2026-06-29",
      epicId: "EPIC-011",
      input,
    });

    expect(markdown).toContain("# EPIC-011: Persistent Lessons Memory");
    expect(markdown).toContain("| State | NotStarted |");
    expect(markdown).toContain("| Status | Submitted |");
    expect(markdown).toContain("## Features Breakdown");
    expect(markdown).toContain("```mermaid");
    expect(markdown).toContain("- [ ] Lessons are stored");
    expect(markdown).toContain("- [ ] New projects can reuse lessons");
    expect(markdown).toContain("0/3 suggested features complete");
    expect(markdown).toContain("[NEEDS VALIDATION]");
  });

  it("requires a title and description", () => {
    expect(() =>
      normalizeSubmitEpicInput({
        description: "",
        projectId: "project-1",
        title: "Missing description",
      }),
    ).toThrow("EPIC description is required.");

    expect(() =>
      normalizeSubmitEpicInput({
        description: "Strategic scope.",
        projectId: "project-1",
        title: "",
      }),
    ).toThrow("EPIC title is required.");
  });

  it("builds and parses the idea-mode planning prompt", () => {
    const prompt = buildSubmitEpicIdeaPrompt({
      existingEpics: [
        {
          externalId: "EPIC-001",
          summary: "Existing project registry work.",
          title: "Project Registry",
        },
      ],
      ideaText: "We need memory that carries lessons between projects.",
      projectName: "HEPHA",
    });

    expect(prompt).toContain("You are the Hepha Submit EPIC Agent.");
    expect(prompt).toContain("Return JSON only.");
    expect(prompt).toContain("EPIC-001: Project Registry - Existing project registry work.");
    expect(prompt).toContain("We need memory that carries lessons between projects.");

    const parsed = parseSubmitEpicIdeaResponse(`
\`\`\`json
{
  "title": "Cross Project Lessons Memory",
  "description": "Persist lessons so future projects can reuse proven practices.",
  "problemStatement": "Lessons are currently trapped inside one project.",
  "successCriteria": ["Lessons are stored", "New projects can retrieve lessons"],
  "priority": "High"
}
\`\`\`
`);

    expect(normalizeSubmitEpicInput({ ...parsed, projectId: "project-1" })).toMatchObject({
      description: "Persist lessons so future projects can reuse proven practices.",
      priority: "High",
      problemStatement: "Lessons are currently trapped inside one project.",
      successCriteria: ["Lessons are stored", "New projects can retrieve lessons"],
      title: "Cross Project Lessons Memory",
    });
  });

  it("builds and parses the canonical submit-epic finalizer prompt", () => {
    const draft = normalizeSubmitEpicInput({
      description: "Persist reusable lessons between projects.",
      priority: "High",
      projectId: "project-1",
      successCriteria: "Lessons are stored\nFuture projects can retrieve lessons",
      title: "Persistent Lessons Memory",
    });
    const prompt = buildSubmitEpicFinalizerPrompt({
      draft,
      existingEpics: [
        {
          externalId: "EPIC-001",
          summary: "Project registry work.",
          title: "Project Registry",
        },
      ],
      existingFeatures: [
        {
          externalId: "FEAT-007",
          state: "Completed",
          summary: "Existing memory parser.",
          title: "Memory Parser",
        },
      ],
      projectName: "HEPHA",
    });

    expect(prompt).toContain("native Hepha equivalent of DevCycleManager/Prompts/submit-epic.md");
    expect(prompt).toContain("Draft EPIC input:");
    expect(prompt).toContain("suggestedFeatures");
    expect(prompt).toContain("FEAT-007: Memory Parser [Completed] - Existing memory parser.");

    const finalized = parseSubmitEpicFinalizerResponse(
      `
\`\`\`json
{
  "title": "Persistent Lessons Memory",
  "description": "Store durable project lessons so future work can reuse proven decisions.",
  "problemStatement": "Lessons currently remain trapped in one project context.",
  "successCriteria": ["Lessons are captured", "New projects can retrieve relevant lessons"],
  "priority": "High",
  "suggestedFeatures": [
    {
      "title": "Lesson Capture Store",
      "userStory": "As a maintainer, I want lessons captured with project context so that they remain reusable.",
      "scope": "Persist lesson records and source references.",
      "dependencies": "None",
      "priority": "P1"
    }
  ],
  "outOfScope": ["Automated lesson quality scoring"],
  "risks": [
    {
      "risk": "Low quality lessons reduce trust",
      "impact": "High",
      "likelihood": "Medium",
      "mitigation": "Require validation markers and source links."
    }
  ]
}
\`\`\`
`,
      draft,
    );

    expect(finalized).toMatchObject({
      description: "Store durable project lessons so future work can reuse proven decisions.",
      outOfScope: ["Automated lesson quality scoring"],
      risks: [
        {
          impact: "High",
          likelihood: "Medium",
          mitigation: "Require validation markers and source links.",
          risk: "Low quality lessons reduce trust",
        },
      ],
      suggestedFeatures: [
        {
          dependencies: "None",
          priority: "P1",
          scope: "Persist lesson records and source references.",
          title: "Lesson Capture Store",
        },
      ],
      title: "Persistent Lessons Memory",
    });
  });
});
