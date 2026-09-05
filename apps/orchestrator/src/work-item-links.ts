export function extractLinkedIds(markdown: string, prefix: "EPIC" | "FEAT") {
  const ids = new Set<string>();
  const pattern = new RegExp(`\\b${prefix}-\\d+\\b`, "gi");

  for (const match of markdown.matchAll(pattern)) {
    ids.add(match[0].toUpperCase());
  }

  return [...ids].sort();
}

export function extractEpicChildFeatureIds(markdown: string) {
  const ids = new Set<string>();

  for (const line of markdown.split(/\r?\n/)) {
    const cells = parseMarkdownTableLine(line);

    if (cells.length >= 2) {
      const firstCell = cells[0] ?? "";
      const featureId = extractLeadingFeatureId(firstCell);

      if (featureId) {
        ids.add(featureId);
      }

      continue;
    }

    const featureId = extractLeadingFeatureId(line);

    if (featureId) {
      ids.add(featureId);
    }
  }

  return [...ids].sort();
}

export function extractFeatureParentEpicIds(markdown: string) {
  const ids = new Set<string>();

  for (const line of markdown.split(/\r?\n/)) {
    const cells = parseMarkdownTableLine(line);

    if (cells.length >= 2 && /parent\s+epics?/i.test(cells[0] ?? "")) {
      for (const epicId of extractLinkedIds(cells.slice(1).join(" "), "EPIC")) {
        ids.add(epicId);
      }
      continue;
    }

    if (/parent\s+epics?/i.test(line)) {
      for (const epicId of extractLinkedIds(line, "EPIC")) {
        ids.add(epicId);
      }
    }
  }

  return [...ids].sort();
}

function extractLeadingFeatureId(value: string) {
  const normalized = cleanMarkdown(value);

  if (/^(feature\s+id|layer\s*\/\s*feature|[-:]+)$/i.test(normalized)) {
    return null;
  }

  const match = normalized.match(/^(?:#{1,6}\s*)?(?:[-*]\s*)?(?:\d+\.\s*)?(?:\*\*)?\b(FEAT-\d+)\b/i);

  return match?.[1]?.toUpperCase() ?? null;
}

function parseMarkdownTableLine(line: string) {
  if (!line.includes("|")) {
    return [];
  }

  return line
    .split("|")
    .map((cell) => cleanMarkdown(cell))
    .filter(Boolean);
}

function cleanMarkdown(value: string) {
  return value
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/_/g, " ")
    .trim();
}
