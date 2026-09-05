import { preserveTrailingNewline } from "./lifecycle-state.js";
import type { EpicSyncResult } from "./feature-snapshots.js";
import { findMermaidBlockLines } from "./markdown-structure.js";

/** Update Mermaid class assignments for linked-child nodes. */
export function renderMermaidClasses(
  markdown: string,
  childClasses: Map<string, { nodeVar: string; statusClass: string }>,
): EpicSyncResult {
  const lines = markdown.split(/\r?\n/);
  const warnings: string[] = [];

  const mermaidBlocks = findMermaidBlockLines(lines);
  if (mermaidBlocks.length === 0) {
    return {
      markdown,
      changed: false,
      sections: [{ section: "mermaid-classes", changed: false, warning: "No mermaid diagram found — skipped" }],
      warnings: ["No mermaid diagram found — skipping class updates"],
      blockers: [],
    };
  }

  let changed = false;

  for (const block of mermaidBlocks) {
    // Build a map of node variable → FEAT ID from the mermaid block
    const nodeToFeat = new Map<string, string>();
    // Reverse map: featId → nodeVar (from childClasses)
    const featToNodeVar = new Map<string, string>();
    for (const [featId, info] of childClasses) {
      featToNodeVar.set(featId, info.nodeVar);
    }

    // Parse node declarations: F1[Title] or F1[Title text]
    for (let i = block.start; i <= block.end; i++) {
      const line = lines[i] ?? "";
      const nodeMatch = line.match(/^\s*(F\d+)\[(.+?)\]\s*$/);
      if (nodeMatch) {
        nodeToFeat.set(nodeMatch[1]!, nodeMatch[2]!.trim());
      }
    }

    // Update class assignments — handles both single ("class F5 inProgress") and
    // comma-separated ("class F5,F6 notStarted") patterns
    for (let i = block.start + 1; i < block.end; i++) {
      const line = lines[i] ?? "";
      // Match "class F5 ..." or "class F5,F6 ..."
      const classMatch = line.match(/^\s*class\s+((?:F\d+,?)+)\s+(\S+)\s*$/);
      if (!classMatch) continue;

      const nodeVars = (classMatch[1] ?? "").split(",").filter(Boolean);
      let lineChanged = false;

      for (const nodeVar of nodeVars) {
        const title = nodeToFeat.get(nodeVar);
        if (!title) continue;

        for (const [, info] of childClasses) {
          if (info.nodeVar === nodeVar) {
            const targetClass = info.statusClass;
            const currentClass = classMatch[2]!;
            if (currentClass !== targetClass) {
              // Replace class value for this specific node
              if (nodeVars.length === 1) {
                lines[i] = line.replace(
                  /(class\s+)(?:F\d+,?)+(\s+)\S+/,
                  `$1${nodeVar}$2${targetClass}`,
                );
              } else {
                // Multiple nodes on one line — split into individual class lines
                const newLines: string[] = [];
                for (const nv of nodeVars) {
                  let nvClass = classMatch[2]!;
                  // Check if this node var has a different target class
                  for (const [, ci] of childClasses) {
                    if (ci.nodeVar === nv) {
                      nvClass = ci.statusClass;
                      break;
                    }
                  }
                  // Preserve leading whitespace
                  const indent = line.match(/^\s*/)?.[0] ?? "";
                  newLines.push(`${indent}class ${nv} ${nvClass}`);
                }
                lines[i] = newLines.join("\n");
              }
              lineChanged = true;
            }
            break;
          }
        }
      }

      if (lineChanged) {
        changed = true;
      }
    }

    // Check for child FEATs not found in mermaid block
    for (const [featId, info] of childClasses) {
      let found = false;
      for (let i = block.start; i <= block.end; i++) {
        const line = lines[i] ?? "";
        if (line.includes(info.nodeVar)) {
          found = true;
          break;
        }
      }
      if (!found) {
        warnings.push(`FEAT ${featId} node not found in mermaid diagram — skipping class assignment`);
      }
    }
  }

  return {
    markdown: changed ? preserveTrailingNewline(markdown, lines.join("\n")) : markdown,
    changed,
    sections: [{ section: "mermaid-classes", changed }],
    warnings,
    blockers: [],
  };
}

// ---------------------------------------------------------------------------
// FEAT-012: Utility helpers
// ---------------------------------------------------------------------------

/** Derive a Mermaid node variable from its position in linked-child order. */
export function deriveMermaidNodeVar(index: number): string {
  return `F${index + 1}`;
}

/**
 * Build the child FEAT → mermaid node mapping from an EPIC document.
 * Returns a Map of featId → { nodeVar, title }.
 */
export function buildMermaidNodeMapping(
  markdown: string,
  linkedFeatureIds: string[],
): Map<string, { nodeVar: string; title: string }> {
  const mapping = new Map<string, { nodeVar: string; title: string }>();
  const lines = markdown.split(/\r?\n/);
  const mermaidBlocks = findMermaidBlockLines(lines);

  if (mermaidBlocks.length === 0) {
    return mapping;
  }

  // Build nodeVar → title map from mermaid
  const nodeToTitle = new Map<string, string>();
  for (const block of mermaidBlocks) {
    for (let i = block.start; i <= block.end; i++) {
      const line = lines[i] ?? "";
      const nodeMatch = line.match(/^\s*(F\d+)\[(.+?)\]\s*$/);
      if (nodeMatch) {
        nodeToTitle.set(nodeMatch[1]!, nodeMatch[2]!.trim());
      }
    }
  }

  // Match FEAT IDs to node variables by iterating mermaid nodes in order
  // and matching against linkedFeatureIds list
  let featIndex = 0;
  for (const [nodeVar, title] of nodeToTitle) {
    if (featIndex < linkedFeatureIds.length) {
      const featId = linkedFeatureIds[featIndex]!;
      mapping.set(featId, { nodeVar, title });
      featIndex++;
    }
  }

  return mapping;
}
