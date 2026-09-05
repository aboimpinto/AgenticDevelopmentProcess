import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { relative, resolve } from "node:path";
import type { ScannedCardMetadata } from "@hepha/db";
import type {
  MemoryBankStateFolder,
  WorkItemCard,
  WorkItemScanStatus,
  WorkItemSourceIssue,
  WorkItemSourceIssueReason,
} from "@hepha/shared";
import { extractEpicChildFeatureIds, extractFeatureParentEpicIds, extractLinkedIds } from "./work-item-links.js";
import {
  countNeedsValidationTags,
  createValidationSummary,
} from "./work-item-validation.js";
import { extractEpicState } from "./epic-state.js";
import { readEpicRefinementHistory } from "./epic-refinement.js";
import type { StoredProject } from "./projects/stored-project.js";
import { scanFeatureImplementationEvidence } from "./memorybank/implementation-evidence-scanner.js";
import { cleanInlineMarkdown, escapeRegExp } from "./memorybank/markdown-parsing.js";
import { scanFeaturePhases } from "./memorybank/phase-scanner.js";
import { readDeepDivePreparationSource } from "./application/deep-dive/deep-dive-preparation-source.js";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface ScannedWorkItem {
  card: WorkItemCard;
  metadata: ScannedCardMetadata;
}

export interface ScannedMemoryBankResult {
  items: ScannedWorkItem[];
  scanStatus: WorkItemScanStatus;
  sourceIssues: WorkItemSourceIssue[];
}

// ---------------------------------------------------------------------------
// Public API – pure scanner (no workflow-metadata or notification side effects)
// ---------------------------------------------------------------------------

/**
 * Scan MemoryBank feature/EPIC folders and return raw `ScannedWorkItem` records.
 *
 * This function is intentionally **pure** with respect to workflow metadata:
 * it reads files, parses Markdown, and constructs records, but does **not** call
 * `reconcileStaleRunningFeatureWorkflows`, `recordFeatureWorkflowRun`,
 * `notifyProjectChanged`, or any other write-side-effect operation.
 *
 * The caller (e.g. `scanWorkItems` in `index.ts`) is responsible for adding
 * workflow-metadata reconciliation as a separate step.
 */
export function scanMemoryBankFolders(
  project: StoredProject,
  stateFolders: MemoryBankStateFolder[],
  stateFolderLabels: Record<MemoryBankStateFolder, string>,
): ScannedWorkItem[] {
  return scanMemoryBankFoldersWithIssues(project, stateFolders, stateFolderLabels).items;
}

export function scanMemoryBankFoldersWithIssues(
  project: StoredProject,
  stateFolders: MemoryBankStateFolder[],
  stateFolderLabels: Record<MemoryBankStateFolder, string>,
): ScannedMemoryBankResult {
  const featuresRoot = resolve(project.memoryBankPath, "Features");
  const scannedItems: ScannedWorkItem[] = [];
  const sourceIssues: WorkItemSourceIssue[] = [];
  const scanStatus: WorkItemScanStatus = {
    epicDocumentCount: 0,
    epicFolderExists: false,
    epicInvalidSourceCount: 0,
    epicScanFailed: false,
    epicValidItemCount: 0,
    message: null,
  };

  if (!existsSync(featuresRoot)) {
    return { items: scannedItems, scanStatus, sourceIssues };
  }

  for (const stateFolder of stateFolders) {
    const folderPath = resolve(featuresRoot, stateFolder);

    if (!existsSync(folderPath)) {
      continue;
    }

    if (stateFolder === "00_EPICS") {
      scanStatus.epicFolderExists = true;
    }

    const readResult = readDirectory(folderPath);

    if (readResult.failed) {
      if (stateFolder === "00_EPICS") {
        scanStatus.epicScanFailed = true;
        scanStatus.message = readResult.message;
      }

      continue;
    }

    for (const entry of readResult.entries) {
      const itemFolderPath = resolve(folderPath, entry);

      if (!safeIsDirectory(itemFolderPath)) {
        continue;
      }

      const scannedItem = readWorkItem(project, stateFolder, stateFolderLabels, entry, itemFolderPath);

      if (stateFolder === "00_EPICS") {
        if (scannedItem.card.documentPath) {
          scanStatus.epicDocumentCount += 1;
        }

        const issue = createEpicSourceIssue(project, scannedItem);

        if (issue) {
          sourceIssues.push(issue);
          scanStatus.epicInvalidSourceCount += 1;
          continue;
        }

        scanStatus.epicValidItemCount += 1;
      } else {
        const issue = createFeatureSourceIssue(project, scannedItem);

        if (issue) {
          sourceIssues.push(issue);
          continue;
        }
      }

      scannedItems.push(scannedItem);
    }
  }

  return { items: scannedItems, scanStatus, sourceIssues };
}

// ---------------------------------------------------------------------------
// Read a single work item from disk
// ---------------------------------------------------------------------------

function readWorkItem(
  project: StoredProject,
  stateFolder: MemoryBankStateFolder,
  stateFolderLabels: Record<MemoryBankStateFolder, string>,
  folderName: string,
  folderPath: string,
): ScannedWorkItem {
  const kind = stateFolder === "00_EPICS" ? "epic" : "feature";
  const documentPath = findPrimaryDocument(folderPath, kind);
  const specMarkdown = documentPath ? readFileSync(documentPath, "utf8") : "";
  const documentStats = documentPath ? statSync(documentPath) : null;
  const documentUpdatedAt = documentStats ? documentStats.mtime.toISOString() : null;
  const documentHash = documentPath ? hashText(specMarkdown) : null;
  const documentSize = documentStats?.size ?? null;
  const externalId = extractExternalId(folderName, specMarkdown, kind);
  const title = extractTitle(folderName, specMarkdown, externalId);
  const linkedEpicIds = kind === "feature" ? extractLinkedIds(specMarkdown, "EPIC") : [];
  const linkedFeatureIds =
    kind === "epic"
      ? extractEpicChildFeatureIds(specMarkdown)
      : extractLinkedIds(specMarkdown, "FEAT").filter((id) => id !== externalId);
  const cardKey = createCardKey(kind, externalId);
  const phases = kind === "feature" ? scanFeaturePhases(project, folderPath) : [];
  const deepDiveSource = readDeepDivePreparationSource({
    documentPath,
    folderPath,
    kind,
    specMarkdown,
  });

  return {
    card: {
      id: `${project.id}:${stateFolder}:${folderName}`,
      documentPath,
      documentRelativePath: documentPath ? normalizeRelativePath(project.rootPath, documentPath) : null,
      documentUpdatedAt,
      epicState: kind === "epic" ? extractEpicState(specMarkdown) : null,
      epicRefinements: kind === "epic" ? readEpicRefinementHistory(folderPath) : [],
      externalId,
      folderName,
      folderPath,
      kind,
      linkedEpicIds,
      linkedEpics: [],
      featureWorkflow: null,
      implementationEvidence:
        kind === "feature" ? scanFeatureImplementationEvidence(project, folderPath, phases) : null,
      linkedFeatureIds,
      linkedFeatures: [],
      missingFeatureIds: [],
      phases,
      specMarkdown,
      stateFolder,
      stateLabel: stateFolderLabels[stateFolder],
      summary: extractSummary(specMarkdown),
      title,
      validation: createValidationSummary(kind, specMarkdown, deepDiveSource.sourceHash, null, false),
    },
    metadata: {
      cardKey,
      deepDiveSourceHash: deepDiveSource.sourceHash,
      documentHash,
      documentPath,
      documentSize,
      documentUpdatedAt,
      externalId,
      kind,
      projectId: project.id,
      stateFolder,
      title,
    },
  };
}

// ---------------------------------------------------------------------------
// Pure helper functions (no side effects beyond file reads)
// ---------------------------------------------------------------------------

function findPrimaryDocument(folderPath: string, kind: "epic" | "feature") {
  const preferredName = kind === "epic" ? "EpicDescription.md" : "FeatureDescription.md";
  const preferredPath = resolve(folderPath, preferredName);

  if (existsSync(preferredPath)) {
    return preferredPath;
  }

  const fallback = safeReadDirectory(folderPath).find((entry) => entry.toLowerCase().endsWith(".md"));

  return fallback ? resolve(folderPath, fallback) : null;
}

function extractExternalId(folderName: string, markdown: string, kind: "epic" | "feature") {
  const prefix = kind === "epic" ? "EPIC" : "FEAT";
  const folderMatch = folderName.match(new RegExp(`(${prefix}-\\d+)`, "i"));

  if (folderMatch?.[1]) {
    return folderMatch[1].toUpperCase();
  }

  const markdownMatch = markdown.match(new RegExp(`\\b(${prefix}-\\d+)\\b`, "i"));

  return markdownMatch?.[1]?.toUpperCase() ?? folderName;
}

function extractTitle(folderName: string, markdown: string, externalId: string) {
  const heading = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));

  if (heading) {
    return cleanTitle(heading.replace(/^#\s+/, ""), externalId);
  }

  const titleField = markdown.match(/\*\*(?:Feature Name|Epic Name|Title)\*\*:\s*(.+)/i);

  if (titleField?.[1]) {
    return cleanTitle(titleField[1], externalId);
  }

  return cleanTitle(folderName, externalId);
}

function cleanTitle(value: string, externalId: string) {
  return value
    .replace(new RegExp(`^${escapeRegExp(externalId)}\\s*[-:]?\\s*`, "i"), "")
    .replace(/^(EPIC|FEAT)-\d+\s*[-:]?\s*/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSummary(markdown: string) {
  const paragraphs = markdown
    .split(/\r?\n\r?\n/)
    .map((paragraph) => paragraph.replace(/^#+\s+/gm, "").trim())
    .filter((paragraph) => paragraph && !paragraph.startsWith("|") && !paragraph.startsWith("---"));
  const firstParagraph = paragraphs[0] ?? "";

  return truncate(firstParagraph.replace(/\s+/g, " "), 220);
}

function hashText(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function createCardKey(kind: WorkItemCard["kind"], externalId: string) {
  return `${kind}:${externalId.toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Source issue and directory helpers
// ---------------------------------------------------------------------------

function createEpicSourceIssue(project: StoredProject, item: ScannedWorkItem): WorkItemSourceIssue | null {
  const reason = getEpicSourceIssueReason(item.card);

  if (!reason) {
    return null;
  }

  return {
    id: `${item.card.id}:invalid-source`,
    folderName: item.card.folderName,
    folderPath: item.card.folderPath,
    kind: "invalid-source",
    message: getSourceIssueMessage(reason),
    reason,
    severity: "invalid",
    sourcePath: item.card.documentPath,
    sourceRelativePath: item.card.documentPath ? normalizeRelativePath(project.rootPath, item.card.documentPath) : null,
    sourceType: "epic",
  };
}

function getEpicSourceIssueReason(card: WorkItemCard): WorkItemSourceIssueReason | null {
  if (!card.documentPath) {
    return "missing-document";
  }

  if (!card.specMarkdown.trim()) {
    return "empty-document";
  }

  if (!/^EPIC-\d+$/i.test(card.externalId) || !/\bEPIC-\d+\b/i.test(card.specMarkdown)) {
    return "missing-required-fields";
  }

  return null;
}

function createFeatureSourceIssue(project: StoredProject, item: ScannedWorkItem): WorkItemSourceIssue | null {
  const reason = getFeatureSourceIssueReason(item.card);

  if (!reason) {
    return null;
  }

  return {
    id: `${item.card.id}:invalid-source`,
    folderName: item.card.folderName,
    folderPath: item.card.folderPath,
    kind: "invalid-source",
    message: getFeatureSourceIssueMessage(reason),
    reason,
    severity: "invalid",
    sourcePath: item.card.documentPath,
    sourceRelativePath: item.card.documentPath ? normalizeRelativePath(project.rootPath, item.card.documentPath) : null,
    sourceType: "feature",
  };
}

function getFeatureSourceIssueReason(card: WorkItemCard): WorkItemSourceIssueReason | null {
  if (!card.documentPath) {
    return "missing-document";
  }

  const markdown = card.specMarkdown;

  if (!markdown.trim()) {
    return "empty-document";
  }

  if (!/^FEAT-\d+$/i.test(card.externalId)) {
    return "missing-required-fields";
  }

  return null;
}

function getFeatureSourceIssueMessage(reason: WorkItemSourceIssueReason) {
  switch (reason) {
    case "empty-document":
      return "FEAT source document is empty.";
    case "missing-document":
      return "FEAT folder does not contain a readable Markdown source document.";
    case "missing-required-fields":
      return "FEAT source is missing required FEAT identification fields.";
    case "parse-error":
      return "FEAT source document could not be parsed safely.";
    case "unreadable-document":
      return "FEAT source document could not be read.";
  }
}

function getSourceIssueMessage(reason: WorkItemSourceIssueReason) {
  switch (reason) {
    case "empty-document":
      return "EPIC source document is empty.";
    case "missing-document":
      return "EPIC folder does not contain a readable Markdown source document.";
    case "missing-required-fields":
      return "EPIC source is missing required EPIC identification fields.";
    case "parse-error":
      return "EPIC source document could not be parsed safely.";
    case "unreadable-document":
      return "EPIC source document could not be read.";
  }
}

function readDirectory(path: string): { entries: string[]; failed: boolean; message: string | null } {
  try {
    return { entries: existsSync(path) ? readdirSync(path) : [], failed: false, message: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return { entries: [], failed: true, message };
  }
}

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

function safeReadDirectory(path: string) {
  try {
    return existsSync(path) ? readdirSync(path) : [];
  } catch {
    return [];
  }
}

function safeReadTextFile(path: string) {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  } catch {
    return "";
  }
}

function safeIsDirectory(path: string) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function normalizeRelativePath(fromPath: string, toPath: string) {
  const relativePath = relative(fromPath, toPath);

  return relativePath && !relativePath.startsWith("..") ? relativePath.replaceAll("\\", "/") : toPath;
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}\u2026`;
}
