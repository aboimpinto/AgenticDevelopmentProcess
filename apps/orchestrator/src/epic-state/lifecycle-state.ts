import type { EpicDeliveryState, MemoryBankStateFolder } from "@hepha/shared";

const epicStateFields = new Set(["state", "epicstate", "deliverystate"]);

export function extractEpicState(markdown: string): EpicDeliveryState | null {
  const explicitState = extractMarkdownTableField(markdown, epicStateFields);

  return normalizeEpicState(explicitState);
}

export function normalizeEpicState(value: string | null | undefined): EpicDeliveryState | null {
  if (!value) {
    return null;
  }

  const normalized = cleanMarkdownTableCell(value).toLowerCase().replace(/[^a-z0-9]+/g, "");

  if (["notstarted", "notstart", "new", "planned", "planning", "draft", "todo"].includes(normalized)) {
    return "not-started";
  }

  if (["inprogress", "progress", "started", "active", "implementing"].includes(normalized)) {
    return "in-progress";
  }

  if (["completed", "complete", "done", "finished"].includes(normalized)) {
    return "completed";
  }

  if (["cancelled", "canceled", "cancel", "abandoned", "rejected"].includes(normalized)) {
    return "cancelled";
  }

  return null;
}

export function formatEpicStateForFile(state: EpicDeliveryState) {
  switch (state) {
    case "cancelled":
      return "Cancelled";
    case "completed":
      return "Completed";
    case "in-progress":
      return "InProgress";
    case "not-started":
      return "NotStarted";
  }
}

export function upsertEpicState(markdown: string, state: EpicDeliveryState) {
  const nextValue = formatEpicStateForFile(state);
  const lines = markdown.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const cells = parseMarkdownTableLine(lines[index] ?? "");

    if (cells.length >= 2 && epicStateFields.has(normalizeFieldName(cells[0] ?? ""))) {
      lines[index] = `| State | ${nextValue} |`;

      return preserveTrailingNewline(markdown, lines.join("\n"));
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const cells = parseMarkdownTableLine(lines[index] ?? "");

    if (cells.length >= 2 && normalizeFieldName(cells[0] ?? "") === "epicid") {
      lines.splice(index + 1, 0, `| State | ${nextValue} |`);

      return preserveTrailingNewline(markdown, lines.join("\n"));
    }
  }

  const headingIndex = lines.findIndex((line) => line.startsWith("# "));

  if (headingIndex >= 0) {
    lines.splice(
      headingIndex + 1,
      0,
      "",
      "| Field | Value |",
      "|-------|-------|",
      `| State | ${nextValue} |`,
    );

    return preserveTrailingNewline(markdown, lines.join("\n"));
  }

  return `| Field | Value |\n|-------|-------|\n| State | ${nextValue} |\n\n${markdown.trimStart()}`;
}

export function deriveEpicStateFromFeatureStateFolders(
  featureStateFolders: MemoryBankStateFolder[],
  hasMissingFeatureReferences: boolean,
): EpicDeliveryState {
  if (
    featureStateFolders.length > 0 &&
    !hasMissingFeatureReferences &&
    featureStateFolders.every((stateFolder) => stateFolder === "04_COMPLETED")
  ) {
    return "completed";
  }

  if (
    featureStateFolders.length > 0 &&
    !hasMissingFeatureReferences &&
    featureStateFolders.every((stateFolder) => stateFolder === "05_CANCELLED")
  ) {
    return "cancelled";
  }

  if (
    featureStateFolders.some((stateFolder) =>
      ["03_IN_PROGRESS", "04_COMPLETED", "05_CANCELLED"].includes(stateFolder),
    )
  ) {
    return "in-progress";
  }

  return "not-started";
}

function extractMarkdownTableField(markdown: string, fieldNames: Set<string>) {
  for (const line of markdown.split(/\r?\n/)) {
    const cells = parseMarkdownTableLine(line);

    if (cells.length >= 2 && fieldNames.has(normalizeFieldName(cells[0] ?? ""))) {
      return cells[1] ?? "";
    }
  }

  return null;
}

export function parseMarkdownTableLine(line: string) {
  if (!line.includes("|")) {
    return [];
  }

  return line
    .split("|")
    .map((cell) => cleanMarkdownTableCell(cell))
    .filter(Boolean);
}

export function cleanMarkdownTableCell(value: string) {
  return value
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/_/g, " ")
    .trim();
}

function normalizeFieldName(value: string) {
  return cleanMarkdownTableCell(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function preserveTrailingNewline(original: string, next: string) {
  return original.endsWith("\n") ? `${next.replace(/\n+$/g, "")}\n` : next.replace(/\n+$/g, "");
}
