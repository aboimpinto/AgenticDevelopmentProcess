import type { SubmitEpicInput, SubmitEpicPriority } from "@hepha/shared";

export interface ExistingEpicSummary {
  externalId: string;
  summary: string;
  title: string;
}

export interface ExistingFeatureSummary {
  externalId: string;
  state: string;
  summary: string;
  title: string;
}

export interface SubmitEpicSuggestedFeature {
  dependencies: string;
  priority: "P1" | "P2" | "P3";
  scope: string;
  title: string;
  userStory: string;
}

export interface SubmitEpicRisk {
  impact: "High" | "Medium" | "Low";
  likelihood: "High" | "Medium" | "Low";
  mitigation: string;
  risk: string;
}

export interface NormalizedSubmitEpicInput {
  description: string;
  externalReference: string;
  owner: string;
  outOfScope: string[];
  priority: SubmitEpicPriority;
  problemStatement: string;
  risks: SubmitEpicRisk[];
  successCriteria: string[];
  suggestedFeatures: SubmitEpicSuggestedFeature[];
  targetCompletion: string;
  title: string;
}

export function normalizeSubmitEpicInput(input: SubmitEpicInput): NormalizedSubmitEpicInput {
  const title = cleanSingleLine(input.title);
  const description = cleanMultiline(input.description);

  if (!title) {
    throw new Error("EPIC title is required.");
  }

  if (!description) {
    throw new Error("EPIC description is required.");
  }

  return {
    description,
    externalReference: cleanSingleLine(input.externalReference) || "N/A",
    owner: cleanSingleLine(input.owner) || "TBD",
    outOfScope: defaultOutOfScope(),
    priority: normalizePriority(input.priority),
    problemStatement:
      cleanMultiline(input.problemStatement) ||
      "[NEEDS VALIDATION] Clarify the current pain, operational impact, and why this EPIC matters.",
    risks: defaultRisks(),
    successCriteria: normalizeSuccessCriteria(input.successCriteria),
    suggestedFeatures: defaultSuggestedFeatures(),
    targetCompletion: cleanSingleLine(input.targetCompletion) || "TBD - define during planning",
    title,
  };
}

export function buildSubmitEpicIdeaPrompt({
  existingEpics,
  ideaText,
  projectName,
}: {
  existingEpics: ExistingEpicSummary[];
  ideaText: string;
  projectName: string;
}) {
  return [
    "You are the Hepha Submit EPIC Agent.",
    "Persona: Strategic Product Architect. Convert a rough initiative idea into a structured EPIC submission.",
    "Strategy first: connect the EPIC to a real project outcome, keep scope coherent, and identify validation gaps.",
    "Return JSON only. Do not include Markdown fences or commentary.",
    "",
    "JSON shape:",
    "{",
    '  "title": "3-8 word outcome-oriented EPIC title",',
    '  "description": "executive summary: what we are building, why, and who benefits",',
    '  "problemStatement": "current pain, risk, or missed opportunity",',
    '  "successCriteria": ["measurable outcome", "measurable outcome"],',
    '  "priority": "Critical | High | Medium | Low",',
    '  "owner": "optional owner or TBD",',
    '  "targetCompletion": "optional target or TBD - define during planning",',
    '  "externalReference": "optional external id or N/A"',
    "}",
    "",
    "Rules:",
    "- Do not invent product facts that are not implied by the idea or existing project context.",
    "- Mark uncertainty inside field values with [NEEDS VALIDATION].",
    "- Prefer one EPIC, not a program roadmap.",
    "- Keep title free of EPIC IDs.",
    "- Return 3-6 success criteria.",
    "- Avoid duplicating existing EPICs. If the idea resembles an existing EPIC, title it as the missing outcome slice.",
    "",
    `Project: ${projectName}`,
    "",
    "Existing EPICs:",
    formatExistingEpics(existingEpics),
    "",
    "Raw EPIC idea:",
    "```text",
    ideaText,
    "```",
  ].join("\n");
}

export function buildSubmitEpicFinalizerPrompt({
  draft,
  existingEpics,
  existingFeatures,
  projectName,
}: {
  draft: NormalizedSubmitEpicInput;
  existingEpics: ExistingEpicSummary[];
  existingFeatures: ExistingFeatureSummary[];
  projectName: string;
}) {
  return [
    "You are the Hepha Submit EPIC Agent.",
    "This is the native Hepha equivalent of DevCycleManager/Prompts/submit-epic.md.",
    "Persona: Strategic Product Architect. Finalize one EPIC submission so it is ready for MemoryBank storage.",
    "",
    "Core beliefs:",
    "- Strategy first: connect the EPIC to the project vision and a real problem.",
    "- Feature decomposition: propose discrete, deliverable feature slices.",
    "- Dependency awareness: identify sequencing and prerequisites.",
    "- Visual clarity: output structured content that can render a progress table and dependency diagram.",
    "",
    "Return JSON only. Do not include Markdown fences or commentary.",
    "",
    "JSON shape:",
    "{",
    '  "title": "3-8 word outcome-oriented EPIC title",',
    '  "description": "executive summary: what we are building, why, and who benefits",',
    '  "problemStatement": "current pain, risk, or missed opportunity",',
    '  "successCriteria": ["measurable outcome", "measurable outcome"],',
    '  "priority": "Critical | High | Medium | Low",',
    '  "owner": "owner or TBD",',
    '  "targetCompletion": "target or TBD - define during planning",',
    '  "externalReference": "external id or N/A",',
    '  "suggestedFeatures": [',
    '    {"title": "feature title", "userStory": "As a ..., I want ..., so that ...", "scope": "scope", "dependencies": "None | Feature title | TBD", "priority": "P1 | P2 | P3"}',
    "  ],",
    '  "outOfScope": ["explicit boundary"],',
    '  "risks": [{"risk": "risk", "impact": "High | Medium | Low", "likelihood": "High | Medium | Low", "mitigation": "strategy"}]',
    "}",
    "",
    "Rules:",
    "- Preserve explicit user-provided facts from the draft unless they are malformed.",
    "- Improve vague wording into concrete product language without inventing unsupported facts.",
    "- Mark uncertainty inside field values with [NEEDS VALIDATION].",
    "- Prefer one coherent EPIC, not a roadmap of unrelated initiatives.",
    "- Return 3-6 success criteria.",
    "- Return 2-6 suggested features.",
    "- Keep suggested feature titles short and implementation-neutral.",
    "- Avoid duplicating existing EPICs or FEATs; define the missing outcome slice instead.",
    "- Do not include an EPIC ID. Hepha assigns the ID after this prompt.",
    "",
    `Project: ${projectName}`,
    "",
    "Existing EPICs:",
    formatExistingEpics(existingEpics),
    "",
    "Existing FEATs:",
    formatExistingFeatures(existingFeatures),
    "",
    "Draft EPIC input:",
    "```json",
    JSON.stringify(
      {
        description: draft.description,
        externalReference: draft.externalReference,
        owner: draft.owner,
        priority: draft.priority,
        problemStatement: draft.problemStatement,
        successCriteria: draft.successCriteria,
        targetCompletion: draft.targetCompletion,
        title: draft.title,
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}

export function parseSubmitEpicIdeaResponse(output: string): Omit<SubmitEpicInput, "projectId"> {
  const jsonText = extractJsonPayload(stripMarkdownFence(output));

  if (!jsonText) {
    throw new Error("Submit EPIC idea response did not include JSON.");
  }

  const parsed = JSON.parse(jsonText) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Submit EPIC idea response JSON must be an object.");
  }

  const raw = parsed as Record<string, unknown>;
  const successCriteria = readStringArray(raw.successCriteria ?? raw.success_criteria);

  return {
    description: cleanMultiline(readString(raw.description ?? raw.summary ?? raw.executiveSummary)),
    externalReference: cleanSingleLine(readString(raw.externalReference ?? raw.external_reference)),
    owner: cleanSingleLine(readString(raw.owner)),
    priority: normalizePriority(readString(raw.priority) as SubmitEpicPriority),
    problemStatement: cleanMultiline(readString(raw.problemStatement ?? raw.problem_statement ?? raw.problem)),
    successCriteria: successCriteria.join("\n"),
    targetCompletion: cleanSingleLine(readString(raw.targetCompletion ?? raw.target_completion)),
    title: cleanSingleLine(readString(raw.title ?? raw.name)),
  };
}

export function parseSubmitEpicFinalizerResponse(
  output: string,
  fallback: NormalizedSubmitEpicInput,
): NormalizedSubmitEpicInput {
  const jsonText = extractJsonPayload(stripMarkdownFence(output));

  if (!jsonText) {
    throw new Error("Submit EPIC finalizer response did not include JSON.");
  }

  const parsed = JSON.parse(jsonText) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Submit EPIC finalizer response JSON must be an object.");
  }

  const raw = parsed as Record<string, unknown>;
  const successCriteria = readStringArray(raw.successCriteria ?? raw.success_criteria);
  const priority = cleanSingleLine(readString(raw.priority));
  const normalized = normalizeSubmitEpicInput({
    description: cleanMultiline(readString(raw.description ?? raw.summary ?? raw.executiveSummary)) || fallback.description,
    externalReference: cleanSingleLine(readString(raw.externalReference ?? raw.external_reference)) || fallback.externalReference,
    owner: cleanSingleLine(readString(raw.owner)) || fallback.owner,
    priority: priority ? normalizePriority(priority as SubmitEpicPriority) : fallback.priority,
    problemStatement:
      cleanMultiline(readString(raw.problemStatement ?? raw.problem_statement ?? raw.problem)) || fallback.problemStatement,
    projectId: "submit-epic-finalizer",
    successCriteria: successCriteria.length > 0 ? successCriteria.join("\n") : fallback.successCriteria.join("\n"),
    targetCompletion:
      cleanSingleLine(readString(raw.targetCompletion ?? raw.target_completion)) || fallback.targetCompletion,
    title: cleanSingleLine(readString(raw.title ?? raw.name)) || fallback.title,
  });

  return {
    ...normalized,
    outOfScope: normalizeOutOfScope(raw.outOfScope ?? raw.out_of_scope, fallback.outOfScope),
    risks: normalizeRisks(raw.risks, fallback.risks),
    suggestedFeatures: normalizeSuggestedFeatures(
      raw.suggestedFeatures ?? raw.suggested_features ?? raw.features,
      fallback.suggestedFeatures,
    ),
  };
}

export function renderSubmittedEpicDocument({
  createdDate,
  epicId,
  input,
}: {
  createdDate: string;
  epicId: string;
  input: NormalizedSubmitEpicInput;
}) {
  const featureRows = input.suggestedFeatures.map(
    (feature) =>
      `| TBD | ${escapeMarkdownTable(feature.title)} | SUBMITTED | ${escapeMarkdownTable(
        feature.dependencies,
      )} | ${feature.priority} |`,
  );
  const featureTitles = input.suggestedFeatures.map((feature) => feature.title).join(", ");
  const mermaidFeatureNodes = input.suggestedFeatures.map(
    (feature, index) => `    F${index + 1}["${escapeMermaidLabel(`Feature ${index + 1}: ${feature.title}`)}"]`,
  );
  const mermaidEdges = input.suggestedFeatures.flatMap((_, index) => {
    if (index === 0) {
      return ["    E --> F1"];
    }

    return [`    F${Math.max(1, index)} --> F${index + 1}`];
  });
  const featureDetails = input.suggestedFeatures.flatMap((feature, index) => [
    `### Feature ${index + 1}: ${feature.title}`,
    `**User Story:** ${feature.userStory}`,
    `**Scope:** ${feature.scope}`,
    `**Dependencies:** ${feature.dependencies}`,
    "",
  ]);
  const outOfScope = input.outOfScope.map((item) => `- ${item}`);
  const riskRows = input.risks.map(
    (risk) =>
      `| ${escapeMarkdownTable(risk.risk)} | ${risk.impact} | ${risk.likelihood} | ${escapeMarkdownTable(
        risk.mitigation,
      )} |`,
  );

  return [
    `# ${epicId}: ${input.title}`,
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| Epic ID | ${epicId} |`,
    "| State | NotStarted |",
    "| Status | Submitted |",
    `| Created | ${createdDate} |`,
    `| Target Completion | ${input.targetCompletion} |`,
    `| Owner | ${input.owner} |`,
    `| Priority | ${input.priority} |`,
    `| External Reference | ${input.externalReference} |`,
    "",
    "## Executive Summary",
    input.description,
    "",
    "## Problem Statement",
    input.problemStatement,
    "",
    "## Success Criteria",
    ...input.successCriteria.map((criterion) => `- [ ] ${criterion}`),
    "",
    "## Features Breakdown",
    "",
    "| Feature ID | Title | Status | Dependencies | Priority |",
    "|------------|-------|--------|--------------|----------|",
    ...featureRows,
    "",
    "> Feature IDs are assigned when FEATs are created from this EPIC.",
    "",
    "## Epic Progress",
    "",
    "**Status:** Submitted",
    `**Progress:** 0% (0/${input.suggestedFeatures.length} suggested features complete)`,
    "",
    "| Status | Count | Features |",
    "|--------|-------|----------|",
    "| Completed | 0 | - |",
    "| In Progress | 0 | - |",
    "| Ready | 0 | - |",
    `| Submitted | ${input.suggestedFeatures.length} | ${escapeMarkdownTable(featureTitles)} |`,
    "",
    "## Dependency Flow Diagram",
    "",
    "```mermaid",
    "flowchart TD",
    `    E[\"${escapeMermaidLabel(`${epicId}: ${input.title}`)}\"]`,
    ...mermaidFeatureNodes,
    ...mermaidEdges,
    "",
    "    classDef epic fill:#4d535a,color:#ffc174,stroke:#a08e7a",
    "    classDef planned fill:#252a31,color:#d8c3ad,stroke:#6f6254",
    "    class E epic",
    `    class ${input.suggestedFeatures.map((_, index) => `F${index + 1}`).join(",")} planned`,
    "```",
    "",
    "## Feature Details",
    "",
    ...featureDetails,
    "## Out of Scope",
    ...outOfScope,
    "",
    "## Risks and Mitigations",
    "",
    "| Risk | Impact | Likelihood | Mitigation |",
    "|------|--------|------------|------------|",
    ...riskRows,
    "",
    "## Progress Tracking",
    "",
    "| Feature ID | Status | Started | Completed | Notes |",
    "|------------|--------|---------|-----------|-------|",
    ...input.suggestedFeatures.map((feature) => `| TBD | SUBMITTED | - | - | ${escapeMarkdownTable(feature.title)} |`),
    "",
    `**Overall Progress:** 0/${input.suggestedFeatures.length} suggested features complete (0%)`,
    "",
    "## Next Steps",
    "1. Run `deep-dive` on this EPIC to gather comprehensive details.",
    "2. Resolve `[NEEDS VALIDATION]` markers from the deep-dive.",
    "3. Create FEATs from the EPIC with the planned create-epic-features flow.",
  ].join("\n") + "\n";
}

function normalizePriority(value: SubmitEpicPriority | undefined): SubmitEpicPriority {
  return value && ["Critical", "High", "Medium", "Low"].includes(value) ? value : "High";
}

function normalizeSuccessCriteria(value: string | undefined) {
  const criteria = cleanMultiline(value)
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*(?:\[[ xX]\]\s*)?/, "").trim())
    .filter(Boolean)
    .slice(0, 12);

  return criteria.length > 0
    ? criteria
    : [
        "[NEEDS VALIDATION] Define one measurable business or product outcome.",
        "[NEEDS VALIDATION] Define one implementation or workflow outcome.",
        "[NEEDS VALIDATION] Define one verification outcome.",
      ];
}

function normalizeSuggestedFeatures(value: unknown, fallback: SubmitEpicSuggestedFeature[]) {
  if (!Array.isArray(value)) {
    return fallback.length > 0 ? fallback : defaultSuggestedFeatures();
  }

  const features = value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const raw = entry as Record<string, unknown>;
      const title = cleanSingleLine(readString(raw.title ?? raw.name));

      if (!title) {
        return null;
      }

      return {
        dependencies: normalizeDependencies(raw.dependencies),
        priority: normalizeFeaturePriority(readString(raw.priority)),
        scope: cleanMultiline(readString(raw.scope)) || "TBD during EPIC deep-dive.",
        title,
        userStory:
          cleanMultiline(readString(raw.userStory ?? raw.user_story)) ||
          "[NEEDS VALIDATION] Define the user, capability, and benefit during EPIC deep-dive.",
      } satisfies SubmitEpicSuggestedFeature;
    })
    .filter((feature): feature is SubmitEpicSuggestedFeature => Boolean(feature))
    .slice(0, 6);

  return features.length > 0 ? features : fallback.length > 0 ? fallback : defaultSuggestedFeatures();
}

function normalizeOutOfScope(value: unknown, fallback: string[]) {
  const boundaries = readStringArray(value);

  return boundaries.length > 0 ? boundaries : fallback.length > 0 ? fallback : defaultOutOfScope();
}

function normalizeRisks(value: unknown, fallback: SubmitEpicRisk[]) {
  if (!Array.isArray(value)) {
    return fallback.length > 0 ? fallback : defaultRisks();
  }

  const risks = value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const raw = entry as Record<string, unknown>;
      const risk = cleanSingleLine(readString(raw.risk ?? raw.title));

      if (!risk) {
        return null;
      }

      return {
        impact: normalizeImpact(readString(raw.impact)),
        likelihood: normalizeImpact(readString(raw.likelihood)),
        mitigation:
          cleanMultiline(readString(raw.mitigation)) ||
          "[NEEDS VALIDATION] Define a concrete mitigation during EPIC deep-dive.",
        risk,
      } satisfies SubmitEpicRisk;
    })
    .filter((risk): risk is SubmitEpicRisk => Boolean(risk))
    .slice(0, 6);

  return risks.length > 0 ? risks : fallback.length > 0 ? fallback : defaultRisks();
}

function defaultSuggestedFeatures(): SubmitEpicSuggestedFeature[] {
  return [
    {
      dependencies: "None",
      priority: "P1",
      scope: "TBD during EPIC deep-dive.",
      title: "[NEEDS VALIDATION] First feature slice",
      userStory: "As a user, I want a validated first capability so that the EPIC can start delivering value.",
    },
    {
      dependencies: "Feature 1",
      priority: "P1",
      scope: "TBD during EPIC deep-dive.",
      title: "[NEEDS VALIDATION] Second feature slice",
      userStory: "As a user, I want the next validated capability so that the EPIC can progress safely.",
    },
    {
      dependencies: "Feature 1",
      priority: "P2",
      scope: "TBD during EPIC deep-dive.",
      title: "[NEEDS VALIDATION] Third feature slice",
      userStory: "As a user, I want the final validated capability so that the EPIC reaches its intended outcome.",
    },
  ];
}

function defaultOutOfScope() {
  return ["[NEEDS VALIDATION] Define explicit boundaries during EPIC deep-dive."];
}

function defaultRisks(): SubmitEpicRisk[] {
  return [
    {
      impact: "High",
      likelihood: "Medium",
      mitigation: "Use deep-dive to split into concrete FEATs before implementation.",
      risk: "[NEEDS VALIDATION] Scope is too broad for one EPIC",
    },
  ];
}

function normalizeFeaturePriority(value: string): SubmitEpicSuggestedFeature["priority"] {
  const priority = cleanSingleLine(value).toUpperCase();

  return priority === "P1" || priority === "P2" || priority === "P3" ? priority : "P2";
}

function normalizeImpact(value: string): SubmitEpicRisk["impact"] {
  const impact = cleanSingleLine(value).toLowerCase();

  if (impact === "high" || impact === "h") {
    return "High";
  }

  if (impact === "low" || impact === "l") {
    return "Low";
  }

  return "Medium";
}

function normalizeDependencies(value: unknown) {
  if (Array.isArray(value)) {
    const dependencies = readStringArray(value);

    return dependencies.length > 0 ? dependencies.join(", ") : "TBD";
  }

  return cleanSingleLine(readString(value)) || "TBD";
}

function formatExistingEpics(existingEpics: ExistingEpicSummary[]) {
  return existingEpics.length > 0
    ? existingEpics
        .map((epic) => `- ${epic.externalId}: ${epic.title}${epic.summary ? ` - ${epic.summary}` : ""}`)
        .join("\n")
    : "- none";
}

function formatExistingFeatures(existingFeatures: ExistingFeatureSummary[]) {
  return existingFeatures.length > 0
    ? existingFeatures
        .map(
          (feature) =>
            `- ${feature.externalId}: ${feature.title} [${feature.state}]${feature.summary ? ` - ${feature.summary}` : ""}`,
        )
        .join("\n")
    : "- none";
}

function cleanSingleLine(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function cleanMultiline(value: string | undefined) {
  return (value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim()
    .slice(0, 4000);
}

function escapeMermaidLabel(value: string) {
  return value.replace(/["\\]/g, "\\$&");
}

function escapeMarkdownTable(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown) {
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((entry) => cleanSingleLine(entry.replace(/^[-*]\s*(?:\[[ xX]\]\s*)?/, "")))
      .filter(Boolean)
      .slice(0, 12);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => cleanSingleLine(readString(entry)))
    .filter(Boolean)
    .slice(0, 12);
}

function stripMarkdownFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonPayload(value: string) {
  const objectStart = value.indexOf("{");
  const objectEnd = value.lastIndexOf("}");

  if (objectStart >= 0 && objectEnd > objectStart) {
    return value.slice(objectStart, objectEnd + 1);
  }

  return null;
}
