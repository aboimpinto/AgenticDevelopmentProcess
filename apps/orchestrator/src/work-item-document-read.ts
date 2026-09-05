import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import type {
  CardKind,
  DocumentReadStatus,
  MemoryBankStateFolder,
  WorkItemDocumentDetail,
  WorkItemScanStatus,
} from "@hepha/shared";
import { isDesignArtifactFileName, type DesignArtifactFileName } from "@hepha/shared";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read a single work-item document from disk, returning a pure response
 * without SQLite metadata reconciliation or board state side effects.
 *
 * This is the canonical read helper for the selected-document endpoint.
 * It resolves the card from the cardId format `<projectId>:<stateFolder>:<folderName>`,
 * reads the primary document, and returns a `WorkItemDocumentDetail` response.
 */
export function readWorkItemDocument(
  project: { id: string; memoryBankPath: string; rootPath: string },
  cardId: string,
  designArtifact?: DesignArtifactFileName,
): WorkItemDocumentDetail {
  const cardParts = parseCardId(cardId);

  if (!cardParts) {
    return createDocumentDetailError(cardId, "feature", "missing", "Card ID format is invalid.");
  }

  const { stateFolder, folderName } = cardParts;
  const folderPath = resolve(project.memoryBankPath, "Features", stateFolder, folderName);

  if (!existsSync(folderPath)) {
    return createDocumentDetailError(cardId, "feature", "missing", null, stateFolder);
  }

  const kind: CardKind = stateFolder === "00_EPICS" ? "epic" : "feature";
  const primaryName = designArtifact ?? (kind === "epic" ? "EpicDescription.md" : "FeatureDescription.md");
  const primaryPath = resolve(folderPath, primaryName);

  if (!existsSync(primaryPath)) {
    if (designArtifact) {
      return createDocumentDetailError(
        cardId,
        kind,
        "missing",
        `Design artifact not found: ${designArtifact}.`,
        stateFolder,
      );
    }
    // Fallback to first .md file, matching scanner behavior
    const fallbackPath = findFirstMarkdownFile(folderPath);

    if (!fallbackPath) {
      return createDocumentDetailError(cardId, kind, "missing", "No Markdown document found in work item folder.", stateFolder);
    }

    return readAndBuildResponse(project, cardId, kind, stateFolder, folderName, fallbackPath);
  }

  return readAndBuildResponse(project, cardId, kind, stateFolder, folderName, primaryPath);
}

/** Reads one design artifact from the fixed Design Feature output contract. */
export function readDesignArtifactDocument(
  project: { id: string; memoryBankPath: string; rootPath: string },
  cardId: string,
  artifactName: string,
): WorkItemDocumentDetail {
  if (!isDesignArtifactFileName(artifactName)) {
    return createDocumentDetailError(
      cardId,
      "feature",
      "missing",
      "Unsupported design artifact.",
    );
  }
  return readWorkItemDocument(project, cardId, artifactName);
}

/**
 * Create a structured error `WorkItemDocumentDetail` response.
 *
 * Pure helper extracted for independent testing (see FEAT-003/004 Lessons Learned).
 */
export function createDocumentDetailError(
  cardId: string,
  kind: CardKind,
  readStatus: DocumentReadStatus,
  errorMessage: string | null,
  stateFolder?: MemoryBankStateFolder,
): WorkItemDocumentDetail {
  return {
    cardId,
    content: "",
    documentPath: null,
    documentRelativePath: null,
    documentUpdatedAt: null,
    externalId: "",
    folderName: "",
    kind,
    readError: errorMessage,
    readStatus,
    stateFolder: stateFolder ?? "03_IN_PROGRESS",
    stateLabel: getStateLabel(stateFolder ?? "03_IN_PROGRESS"),
    title: "",
    testCoverage: null,
  };
}

/**
 * Extract the state folder from a raw card ID string.
 *
 * Card ID format: `<projectId>:<stateFolder>:<folderName>`
 * Example: `test-project:03_IN_PROGRESS:FEAT-005-markdown-detail-panel`
 */
export function parseCardId(cardId: string): { stateFolder: MemoryBankStateFolder; folderName: string } | null {
  const parts = cardId.split(":");

  // cardId has at least 3 parts: projectId:stateFolder:folderName
  // folderName may contain colons in theory, so take the first two parts as
  // projectId and stateFolder, and the rest as folderName.
  if (parts.length < 3) {
    return null;
  }

  const stateFolder = parts[1] as MemoryBankStateFolder;
  const validStateFolders: MemoryBankStateFolder[] = [
    "00_EPICS",
    "01_SUBMITTED",
    "02_READY_TO_DEVELOP",
    "03_IN_PROGRESS",
    "04_COMPLETED",
    "05_CANCELLED",
  ];

  if (!validStateFolders.includes(stateFolder)) {
    return null;
  }

  const folderName = parts.slice(2).join(":");

  if (!folderName) {
    return null;
  }

  return { stateFolder, folderName };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readAndBuildResponse(
  project: { id: string; memoryBankPath: string; rootPath: string },
  cardId: string,
  kind: CardKind,
  stateFolder: MemoryBankStateFolder,
  folderName: string,
  documentPath: string,
): WorkItemDocumentDetail {
  try {
    const content = readFileSync(documentPath, "utf8");
    const stats = statSync(documentPath);
    const relativePath = normalizeRelativePath(project.rootPath, documentPath);
    const title = extractTitle(folderName, content);

    return {
      cardId,
      content,
      documentPath,
      documentRelativePath: relativePath,
      documentUpdatedAt: stats.mtime.toISOString(),
      externalId: extractExternalId(folderName, content, kind),
      folderName,
      kind,
      readError: null,
      readStatus: "ok",
      stateFolder,
      stateLabel: getStateLabel(stateFolder),
      title,
      testCoverage: null,
    };
  } catch (error) {
    return createDocumentDetailError(
      cardId,
      kind,
      "unreadable",
      error instanceof Error ? error.message : String(error),
      stateFolder,
    );
  }
}

function findFirstMarkdownFile(folderPath: string): string | null {
  try {
    const entries = readdirSafe(folderPath);
    const mdFile = entries.find((entry) => entry.toLowerCase().endsWith(".md"));

    return mdFile ? resolve(folderPath, mdFile) : null;
  } catch {
    return null;
  }
}

function readdirSafe(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function extractExternalId(folderName: string, markdown: string, kind: CardKind) {
  const prefix = kind === "epic" ? "EPIC" : "FEAT";
  const folderMatch = folderName.match(new RegExp(`(${prefix}-\\d+)`, "i"));

  if (folderMatch?.[1]) {
    return folderMatch[1].toUpperCase();
  }

  const markdownMatch = markdown.match(new RegExp(`\\b(${prefix}-\\d+)\\b`, "i"));

  return markdownMatch?.[1]?.toUpperCase() ?? folderName;
}

function extractTitle(folderName: string, markdown: string) {
  const heading = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));

  if (heading) {
    return cleanTitle(heading.replace(/^#\s+/, ""));
  }

  const titleField = markdown.match(/\*\*(?:Feature Name|Epic Name|Title)\*\*:\s*(.+)/i);

  if (titleField?.[1]) {
    return cleanTitle(titleField[1]);
  }

  return cleanTitle(folderName);
}

function cleanTitle(value: string) {
  return value
    .replace(/^(EPIC|FEAT)-\d+\s*[-:]?\s*/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRelativePath(fromPath: string, toPath: string) {
  const relativePath = relative(fromPath, toPath);

  return relativePath && !relativePath.startsWith("..") ? relativePath.replaceAll("\\", "/") : toPath;
}

function getStateLabel(stateFolder: MemoryBankStateFolder): string {
  const labels: Record<MemoryBankStateFolder, string> = {
    "00_EPICS": "Epics",
    "01_SUBMITTED": "Submitted",
    "02_READY_TO_DEVELOP": "Ready To Develop",
    "03_IN_PROGRESS": "In Progress",
    "04_COMPLETED": "Completed",
    "05_CANCELLED": "Cancelled",
  };

  return labels[stateFolder] ?? stateFolder;
}
