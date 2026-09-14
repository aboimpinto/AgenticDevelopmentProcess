/** Locate explicit document metadata without borrowing nested task/example status.
 * Legacy headers remain supported. Relocated metadata identifies its owning
 * feature in the same field block; headings before that block are not authority.
 */
export function compatibilityStatusDeclaration(markdown: string): { value: string; offset: number; length: number } | undefined {
  const visible = markdown.replace(/<!--[^]*?-->/g, comment => comment.replace(/[^\r\n]/g, " "));
  const candidates: { value: string; offset: number; length: number }[] = [];
  let sectionDepth = 1;
  let inHeader = true;
  let fence: string | undefined;
  let offset = 0;
  let block: { text: string; offset: number }[] = [];
  const flush = () => {
    const text = block.map(line => line.text).join("\n");
    const documentIdentity = /^\*\*Feature(?: ID)?(?::)?\*\*\s*:?\s*\S/im.test(text);
    const childIdentity = /^\*\*(?:Task|Phase) ID(?::)?\*\*/im.test(text);
    if (inHeader || (sectionDepth <= 2 && documentIdentity && !childIdentity)) {
      for (const line of block) {
        const match = line.text.match(/^([ \t]*\*\*Status(?::)?\*\*[ \t]*:?[ \t]*)([A-Z0-9_]+)((?:[ \t]+\([^()\r\n]*\))?[ \t]*)\r?$/i);
        if (match) candidates.push({ value: match[2]!.toUpperCase(), offset: line.offset + match[1]!.length, length: match[2]!.length });
        else if (/^[ \t]*\*\*Status(?::)?\*\*/i.test(line.text)) candidates.push({ value: "", offset: line.offset, length: 0 });
      }
    }
    block = [];
  };
  for (const line of visible.split(/\n/)) {
    const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (delimiter && delimiter[1]![0] === fence[0] && delimiter[1]!.length >= fence.length) fence = undefined;
    } else if (delimiter) {
      flush(); fence = delimiter[1];
    } else {
      const heading = line.match(/^(#{1,6})\s/);
      if (heading || !line.trim()) {
        flush();
        if (heading) { sectionDepth = heading[1]!.length; if (sectionDepth > 1) inHeader = false; }
      } else block.push({ text: line, offset });
    }
    offset += line.length + 1;
  }
  flush();
  // Conflicting or duplicate authority needs reconciliation, not first-match wins.
  return candidates.length === 1 && candidates[0]!.value ? candidates[0] : undefined;
}
