export interface ExistingFeatureSummary {
  externalId: string;
  summary: string;
  title: string;
}

export interface PlannedFeature {
  acceptanceCriteria: string[];
  dependencyIds: string[];
  description: string;
  priority: string | null;
  title: string;
}

export function buildUnnamedFeatureDiscoveryPrompt({
  epicId,
  epicMarkdown,
  epicTitle,
  existingFeatures,
}: {
  epicId: string;
  epicMarkdown: string;
  epicTitle: string;
  existingFeatures: ExistingFeatureSummary[];
}) {
  return [
    "You are the Hepha Feature Extraction Agent.",
    "The EPIC has a current Hepha deep-dive and no [NEEDS VALIDATION] markers.",
    "Inspect the EPIC and identify concrete planned FEATs that are described without a FEAT-### ID.",
    "Return JSON only. Do not include Markdown fences or commentary.",
    "",
    "JSON shape:",
    "{",
    '  "features": [',
    "    {",
    '      "title": "short feature title without a FEAT ID",',
    '      "description": "specific scope to put in the initial FeatureDescription.md",',
    '      "acceptanceCriteria": ["testable outcome or behavior"]',
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    '- Return { "features": [] } when every planned feature already has a FEAT or when the EPIC has no concrete feature slices.',
    "- Do not include items already represented by existing FEAT documents.",
    "- Do not invent work outside the EPIC.",
    "- Prefer 1-8 concrete FEATs.",
    "- Titles must not include FEAT IDs.",
    "- Descriptions must be grounded in the EPIC text.",
    "- Acceptance criteria should be concise, testable, and specific.",
    "",
    `EPIC: ${epicId} - ${epicTitle}`,
    "",
    "Existing FEATs:",
    existingFeatures.length > 0
      ? existingFeatures
          .map((feature) => `- ${feature.externalId}: ${feature.title}${feature.summary ? ` - ${feature.summary}` : ""}`)
          .join("\n")
      : "- none",
    "",
    "EPIC document:",
    "```markdown",
    epicMarkdown,
    "```",
  ].join("\n");
}

export function parseDiscoveredFeatures(output: string): PlannedFeature[] {
  const jsonText = extractJsonPayload(stripMarkdownFence(output));

  if (!jsonText) {
    return [];
  }

  const parsed = JSON.parse(jsonText) as unknown;
  const rawFeatures = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).features)
      ? ((parsed as Record<string, unknown>).features as unknown[])
      : [];
  const seenTitles = new Set<string>();
  const features: PlannedFeature[] = [];

  for (const rawFeature of rawFeatures) {
    const feature = normalizeDiscoveredFeature(rawFeature);

    if (!feature) {
      continue;
    }

    const titleKey = feature.title.toLowerCase();

    if (seenTitles.has(titleKey)) {
      continue;
    }

    seenTitles.add(titleKey);
    features.push(feature);
  }

  return features.slice(0, 8);
}

export function renderSubmittedFeatureDocument({
  epicId,
  epicTitle,
  feature,
  featureId,
}: {
  epicId: string;
  epicTitle: string;
  feature: PlannedFeature;
  featureId: string;
}) {
  const acceptanceCriteria =
    feature.acceptanceCriteria.length > 0
      ? feature.acceptanceCriteria.map((criterion) => `- ${criterion}`)
      : ["- [NEEDS VALIDATION] Define acceptance criteria during FEAT deep-dive."];

  const dependencyLines =
    feature.dependencyIds.length > 0
      ? ["", "## Dependencies", "", ...feature.dependencyIds.map((depId) => `- ${depId}`)]
      : [];

  const priorityLine = feature.priority
    ? [`**Priority**: ${feature.priority}`]
    : [];

  return [
    `# ${featureId}: ${feature.title}`,
    "",
    `**Feature ID**: ${featureId}`,
    `**Parent Epic**: ${epicId}`,
    "**Status**: Submitted",
    ...priorityLine,
    "",
    "## Summary",
    "",
    feature.description,
    "",
    "## Source",
    "",
    `- EPIC: ${epicId} - ${epicTitle}`,
    "- Created by Hepha unnamed FEAT discovery from the current EPIC document.",
    "",
    "## Acceptance Criteria",
    "",
    ...acceptanceCriteria,
    ...dependencyLines,
    "",
    "## Validation",
    "",
    "- [NEEDS VALIDATION] Confirm this generated FEAT scope before refinement.",
  ].join("\n") + "\n";
}

function normalizeDiscoveredFeature(value: unknown): PlannedFeature | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawFeature = value as Record<string, unknown>;
  const title = cleanTitle(readString(rawFeature.title ?? rawFeature.name));
  const description = cleanParagraph(
    readString(rawFeature.description ?? rawFeature.summary ?? rawFeature.scope),
  );

  if (!title || !description || /^(none|n\/a|not applicable)$/i.test(title)) {
    return null;
  }

  return {
    acceptanceCriteria: readStringArray(
      rawFeature.acceptanceCriteria ??
        rawFeature.acceptance_criteria ??
        rawFeature.criteria,
    ),
    dependencyIds: readStringArray(
      rawFeature.dependencyIds ??
        rawFeature.dependency_ids ??
        rawFeature.dependencies,
    ),
    description,
    priority: readString(rawFeature.priority) || null,
    title,
  };
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => cleanParagraph(readString(entry)))
    .filter(Boolean)
    .slice(0, 12);
}

function cleanTitle(value: string) {
  return value
    .replace(/^(FEAT-\d+\s*[-:]?\s*)+/i, "")
    .replace(/^Feature\s*[-:]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function cleanParagraph(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
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

  const arrayStart = value.indexOf("[");
  const arrayEnd = value.lastIndexOf("]");

  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return value.slice(arrayStart, arrayEnd + 1);
  }

  return null;
}
