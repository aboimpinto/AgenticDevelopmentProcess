/** Parse Markdown pipe tables without assigning domain meaning to their rows. */

export function parseMarkdownPipeTableRows(markdown: string): string[][] {
  return parseMarkdownPipeTables(markdown)[0] ?? [];
}

/**
 * Return every contiguous pipe table. Versioned document consumers can then
 * select their authoritative table by header schema instead of file position.
 */
export function parseMarkdownPipeTables(markdown: string): string[][][] {
  const tables: string[][][] = [];
  let current: string[][] = [];

  const finish = () => {
    if (current.length > 0) tables.push(current);
    current = [];
  };

  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      finish();
      continue;
    }
    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (!isSeparatorRow(cells)) current.push(cells);
  }
  finish();
  return tables;
}

function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell.trim()));
}
