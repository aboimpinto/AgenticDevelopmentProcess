import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { WorkItemCard } from "@hepha/shared";
import {
  renderSubmittedFeatureDocument,
  type PlannedFeature,
} from "../../feature-extraction.js";
import type { StoredProject } from "../../projects/stored-project.js";

/** Creates missing submitted feature documents derived from an approved EPIC extraction plan. */
export class SubmittedFeatureDocumentWriter {
  createFromEpicReference(project: StoredProject, epic: WorkItemCard, featureId: string) {
    const featureTitle = extractFeatureReferenceTitle(epic.specMarkdown, featureId) ?? featureId;

    return this.#create(project, featureId, featureTitle, [
      `# ${featureId}: ${featureTitle}`,
      "",
      `**Feature ID**: ${featureId}`,
      `**Parent Epic**: ${epic.externalId}`,
      "**Status**: Submitted",
      "",
      "## Summary",
      "",
      `Created from ${epic.externalId} because the EPIC references ${featureId} and no matching FEAT folder existed.`,
      "",
      "## Source",
      "",
      `- EPIC: ${epic.externalId} - ${epic.title}`,
      "",
      "## Requirements",
      "",
      "- [NEEDS VALIDATION] Expand this FEAT from the EPIC context before refinement.",
    ].join("\n") + "\n");
  }

  createFromPlan(
    project: StoredProject,
    epic: WorkItemCard,
    featureId: string,
    feature: PlannedFeature,
  ) {
    return this.#create(
      project,
      featureId,
      feature.title,
      renderSubmittedFeatureDocument({
        epicId: epic.externalId,
        epicTitle: epic.title,
        feature,
        featureId,
      }),
    );
  }

  #create(project: StoredProject, featureId: string, featureTitle: string, markdown: string) {
    const folderName = `${featureId}-${slugify(featureTitle)}`;
    const folderPath = resolve(project.memoryBankPath, "Features", "01_SUBMITTED", folderName);
    const documentPath = resolve(folderPath, "FeatureDescription.md");

    if (existsSync(folderPath) || existsSync(documentPath)) {
      return false;
    }

    mkdirSync(folderPath, { recursive: true });
    writeFileSync(documentPath, markdown, "utf8");

    return true;
  }
}

export function extractFeatureReferenceTitle(markdown: string, featureId: string) {
  const escapedFeatureId = escapeRegExp(featureId);
  const patterns = [
    new RegExp(`\\b${escapedFeatureId}\\b\\s*[-:â€“â€”]\\s*([^\\r\\n|#]+)`, "i"),
    new RegExp(`^\\s*[-*]\\s*\\*{0,2}\\b${escapedFeatureId}\\b\\*{0,2}\\s*[-:â€“â€”]?\\s*([^\\r\\n]+)`, "im"),
    new RegExp(`\\|\\s*\\b${escapedFeatureId}\\b\\s*\\|\\s*([^|\\r\\n]+)`, "i"),
  ];

  for (const pattern of patterns) {
    const match = markdown.match(pattern);
    const title = match?.[1] ? cleanTitle(match[1], featureId) : "";

    if (title) {
      return title;
    }
  }

  return null;
}

function cleanTitle(value: string, externalId: string) {
  return value
    .replace(new RegExp(`^${escapeRegExp(externalId)}\\s*[-:]?\\s*`, "i"), "")
    .replace(/^(EPIC|FEAT)-\d+\s*[-:]?\s*/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "option";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
