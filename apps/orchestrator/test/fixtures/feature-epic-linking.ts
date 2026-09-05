export function buildFeatFixture(
  featId: string,
  title: string,
  status: string,
  parentEpicId: string | null,
): string {
  const lines: string[] = [
    `# ${title}`,
    "",
    `**Feature ID**: ${featId}`,
    `**Status**: ${status}`,
  ];

  if (parentEpicId) {
    lines.push(`**Parent Epic**: ${parentEpicId}`);
  }

  lines.push(
    "",
    "## Summary",
    "",
    "Test fixture feature.",
    "",
    "## Source",
    "",
    `- EPIC: ${parentEpicId ?? "EPIC-000"} - Test Epic`,
    "",
    "## Requirements",
    "",
    "- Requirement 1",
    "- Requirement 2",
  );

  return lines.join("\n");
}
export function buildEpicFixture(
  epicId: string,
  title: string,
  childFeatureIds: string[],
  options?: { includeCustomContent?: boolean; includeMermaid?: boolean },
): string {
  const lines: string[] = [
    `# ${title}`,
    "",
    "| Field | Value |",
    "|---|---|",
    `| Epic ID | ${epicId} |`,
    "| State | InProgress |",
    "",
    "## Executive Summary",
    "",
    "Test epic fixture.",
    "",
    "## Features Breakdown",
    "",
    "| Feature ID | Title | Status | Dependencies | Priority |",
    "|---|---|---|---|---|",
  ];

  if (childFeatureIds.length === 0) {
    lines.push("| - | - | - | - | - |");
  } else {
    for (const featId of childFeatureIds) {
      lines.push(`| ${featId} | ${featId} feature | IN PROGRESS | - | - |`);
    }
  }

  lines.push("");

  if (options?.includeCustomContent) {
    lines.push(
      "## Custom Notes",
      "",
      "This is a custom note that must be preserved after link operations.",
      "",
      "| Custom Table | Value |",
      "|---|---|",
      "| Key 1 | Value 1 |",
      "| Key 2 | Value 2 |",
      "",
    );
  }

  if (options?.includeMermaid) {
    lines.push(
      "## Dependency Flow Diagram",
      "",
      "```mermaid",
      "flowchart TD",
      "    subgraph Test",
      "        direction TB",
    );
    for (let index = 0; index < childFeatureIds.length; index += 1) {
      lines.push(`        F${index + 1}[${childFeatureIds[index]} feature]`);
    }
    lines.push("    end", "");
    for (let index = 0; index < childFeatureIds.length; index += 1) {
      lines.push(`    class F${index + 1} inProgress`);
    }
    lines.push("```", "");
  }

  for (const featId of childFeatureIds) {
    lines.push(
      `### Feature 1: ${featId}`,
      "",
      "**Scope:** Test fixture.",
      "**Backlink:** - EPIC: EPIC-000 - Test Epic",
      "**Dependencies:** None",
      "",
    );
  }

  lines.push(
    "## Epic Progress",
    "",
    "**State:** InProgress",
    "**Progress:** 0% (0/0 features complete)",
    "",
    "| Status | Count | Features |",
    "|--------|-------|----------|",
    "| Completed | 0 | - |",
    "| In Progress | 0 | - |",
    "| Ready | 0 | - |",
    "| Submitted | 0 | - |",
    "",
    "## Progress Tracking",
    "",
    "| Feature ID | Status | Started | Completed | Notes |",
    "|---|---|---|---|---|",
  );

  for (const featId of childFeatureIds) {
    lines.push(`| ${featId} | IN PROGRESS | - | - | |`);
  }

  lines.push("");
  return lines.join("\n");
}
