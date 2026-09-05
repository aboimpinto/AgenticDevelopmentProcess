import { stripMarkdownFence } from "../application/deep-dive/deep-dive-document-updater.js";

/** Produces a bounded single-paragraph workflow result for durable metadata. */
export function summarizeWorkflowOutput(output: string, fallback: string): string {
  const cleaned = stripMarkdownFence(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");
  return cleaned ? truncate(cleaned, 600) : fallback;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}
