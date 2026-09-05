import { existsSync, readFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { readManualTestObligations } from "../manual-test-obligation.js";
import type { RawSourceItem } from "../manual-test-verification-policy.js";

// ---------------------------------------------------------------------------
// Source Discovery
// ---------------------------------------------------------------------------

/**
 * Options for discovering source input files.
 */
export interface SourceDiscoveryOptions {
  readonly featDescriptionPath: string;
  readonly epicDescriptionPath: string | null;
  readonly epicAcceptanceTestsPath: string | null;
  readonly gherkinPaths: readonly string[];
}

/**
 * Discover and read source documents, returning raw source items.
 * Reads files from disk and extracts acceptance criteria.
 */
export function discoverSources(
  options: SourceDiscoveryOptions,
): RawSourceItem[] {
  const items: RawSourceItem[] = [];

  // FEAT acceptance criteria
  if (existsSync(options.featDescriptionPath)) {
    const content = readFileSync(options.featDescriptionPath, "utf8");
    const criteria = extractAcceptanceCriteria(content, "FEAT");
    for (const text of criteria) {
      items.push({
        category: "feat-ac",
        relativePath: relative(process.cwd(), options.featDescriptionPath),
        explicitId: extractCriterionId(text),
        text,
      });
    }
  }

  // HEPHA-owned manual obligations created during Refine or implementation
  // recovery. These remain durable even when the implementation task itself
  // is correctly SKIPPED.
  const obligations = readManualTestObligations(dirname(options.featDescriptionPath));
  for (const obligation of obligations?.obligations ?? []) {
    items.push({
      category: "phase-ac",
      relativePath: relative(
        process.cwd(),
        `${dirname(options.featDescriptionPath)}/ManualTestObligations.json`,
      ),
      explicitId: obligation.id,
      text: [
        obligation.title,
        `Reason: ${obligation.reason}`,
        `Preconditions: ${obligation.preconditions.join("; ")}`,
        `Steps: ${obligation.steps.join("; ")}`,
        `Expected: ${obligation.expectedResult}`,
        `Evidence: ${obligation.evidenceRequirements.join("; ")}`,
      ].join("\n"),
    });
  }

  // EPIC acceptance material
  if (options.epicDescriptionPath && existsSync(options.epicDescriptionPath)) {
    const content = readFileSync(options.epicDescriptionPath, "utf8");
    const criteria = extractAcceptanceCriteria(content, "EPIC");
    for (const text of criteria) {
      items.push({
        category: "epic-ac",
        relativePath: relative(process.cwd(), options.epicDescriptionPath),
        explicitId: extractCriterionId(text),
        text,
      });
    }
  }

  // EpicAcceptanceTests.md (optional)
  if (options.epicAcceptanceTestsPath && existsSync(options.epicAcceptanceTestsPath)) {
    const content = readFileSync(options.epicAcceptanceTestsPath, "utf8");
    const criteria = extractAcceptanceCriteria(content, "EAT");
    for (const text of criteria) {
      items.push({
        category: "epic-ac-test-file",
        relativePath: relative(process.cwd(), options.epicAcceptanceTestsPath),
        text,
      });
    }
  }

  // Gherkin scenarios
  for (const gherkinPath of options.gherkinPaths) {
    if (existsSync(gherkinPath)) {
      const content = readFileSync(gherkinPath, "utf8");
      const scenarios = extractGherkinScenarios(content);
      for (const text of scenarios) {
        items.push({
          category: "gherkin",
          relativePath: relative(process.cwd(), gherkinPath),
          text,
        });
      }
    }
  }

  return items;
}

/**
 * Extract acceptance criteria from a Markdown document.
 * Looks for unordered list items under "## Acceptance Criteria" sections.
 */
export function extractAcceptanceCriteria(
  markdown: string,
  _sourceLabel: string,
): string[] {
  const criteria: string[] = [];
  const lines = markdown.split("\n");
  let inAcceptanceSection = false;

  let currentCriterion: string[] | null = null;
  const flushCriterion = () => {
    if (currentCriterion?.length) criteria.push(currentCriterion.join(" ").replace(/\s+/g, " ").trim());
    currentCriterion = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect acceptance criteria section heading
    if (/^##\s+(Acceptance Criteria|Acceptance Tests|Manual Tests)/i.test(trimmed)) {
      flushCriterion();
      inAcceptanceSection = true;
      continue;
    }

    // Exit on next ## section
    if (inAcceptanceSection && /^##\s/.test(trimmed) && !/^##\s+(Acceptance|Manual)/i.test(trimmed)) {
      flushCriterion();
      inAcceptanceSection = false;
      continue;
    }

    if (!inAcceptanceSection) {
      continue;
    }

    // Extract unordered, ordered, and checkbox criteria exactly once.
    const criterionMatch = trimmed.match(/^(?:[-*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.+)$/);
    if (criterionMatch) {
      flushCriterion();
      const text = criterionMatch[1]!.trim();
      if (text) {
        currentCriterion = [text];
      }
    } else if (currentCriterion && trimmed && !/^#{1,6}\s/.test(trimmed)) {
      currentCriterion.push(trimmed);
    }
  }

  flushCriterion();

  return criteria;
}

function extractCriterionId(text: string): string | undefined {
  return text.match(/\b(?:AC|AT)-[A-Z0-9]+(?:-[A-Z0-9]+)+\b/i)?.[0]?.toUpperCase();
}

/**
 * Extract scenario names from a Gherkin .feature file.
 */
export function extractGherkinScenarios(content: string): string[] {
  const scenarios: string[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    const scenarioMatch = trimmed.match(/^(Scenario|Scenario Outline|Example):\s+(.+)$/i);
    if (scenarioMatch) {
      scenarios.push(scenarioMatch[2]!.trim());
    }
  }

  return scenarios;
}
