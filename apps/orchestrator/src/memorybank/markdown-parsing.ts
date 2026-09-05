export function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/_/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractMarkdownSection(
  markdown: string,
  matchesHeading: (heading: string) => boolean,
): string {
  const lines = markdown.split(/\r?\n/);
  const sectionLines: string[] = [];
  let collecting = false;
  let headingLevel = 0;

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);

    if (heading?.[1] && heading[2]) {
      const nextHeadingLevel = heading[1].length;
      const headingText = cleanInlineMarkdown(heading[2]);

      if (collecting && nextHeadingLevel <= headingLevel) {
        break;
      }

      if (!collecting && matchesHeading(headingText)) {
        collecting = true;
        headingLevel = nextHeadingLevel;
      }

      continue;
    }

    if (collecting) {
      sectionLines.push(line);
    }
  }

  return sectionLines.join("\n");
}

export function extractMarkdownField(markdown: string, labels: readonly string[]): string | null {
  for (const label of labels) {
    const escapedLabel = escapeRegExp(label);
    const lineMatch = markdown.match(
      new RegExp(`^\\s*(?:[-*]\\s*)?(?:\\*\\*)?${escapedLabel}(?:\\*\\*)?[ \\t]*:[ \\t]*([^\\r\\n]+)`, "im"),
    );
    if (lineMatch?.[1]) return cleanInlineMarkdown(lineMatch[1]);

    const tableLine = markdown
      .split(/\r?\n/)
      .find((line) => new RegExp(`\\|\\s*\\*{0,2}${escapedLabel}\\*{0,2}\\s*\\|`, "i").test(line));
    if (!tableLine) continue;

    const cells = tableLine
      .split("|")
      .map((cell) => cleanInlineMarkdown(cell.trim()))
      .filter(Boolean);
    const labelIndex = cells.findIndex((cell) => cell.toLowerCase() === label.toLowerCase());
    if (labelIndex >= 0 && cells[labelIndex + 1]) return cells[labelIndex + 1];
  }
  return null;
}
