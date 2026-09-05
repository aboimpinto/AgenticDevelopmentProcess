import { createHash } from "node:crypto";

export type DeepDiveRecoveryClassification =
  | "current"
  | "lifecycle_only"
  | "substantive"
  | "baseline_unavailable";

export interface DeepDiveRecoveryAssessment {
  classification: DeepDiveRecoveryClassification;
  currentSemanticSource: string;
  currentSemanticSourceHash: string;
  changedSections: string[];
}

/**
 * Removes only generated lifecycle metadata from a FeatureDescription before
 * Deep-Dive freshness is evaluated. Requirements, scope, decisions, and
 * acceptance criteria deliberately remain in the comparison.
 */
export function normalizeDeepDiveSemanticSource(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let ignoredHeadingLevel: number | null = null;

  for (const rawLine of lines) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(rawLine);
    if (heading) {
      const level = heading[1]!.length;
      if (ignoredHeadingLevel !== null && level <= ignoredHeadingLevel) {
        ignoredHeadingLevel = null;
      }
      if (isLifecycleHeading(heading[2]!)) {
        ignoredHeadingLevel = level;
        continue;
      }
    }

    if (ignoredHeadingLevel !== null || isLifecycleMetadataLine(rawLine)) {
      continue;
    }

    output.push(rawLine.replace(/[ \t]+$/g, ""));
  }

  return output.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function assessDeepDiveRecovery(
  previousSemanticSource: string | null | undefined,
  currentMarkdown: string,
): DeepDiveRecoveryAssessment {
  const currentSemanticSource = normalizeDeepDiveSemanticSource(currentMarkdown);

  if (!previousSemanticSource) {
    return {
      classification: "baseline_unavailable",
      currentSemanticSource,
      currentSemanticSourceHash: hashSemanticSource(currentSemanticSource),
      changedSections: [],
    };
  }

  const normalizedPrevious = normalizeDeepDiveSemanticSource(previousSemanticSource);
  const currentSemanticSourceHash = hashSemanticSource(currentSemanticSource);

  if (normalizedPrevious === currentSemanticSource) {
    return {
      classification: "lifecycle_only",
      currentSemanticSource,
      currentSemanticSourceHash,
      changedSections: [],
    };
  }

  return {
    classification: "substantive",
    currentSemanticSource,
    currentSemanticSourceHash,
    changedSections: changedSemanticSections(normalizedPrevious, currentSemanticSource),
  };
}

export function hashSemanticSource(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

export function buildStaleDeepDiveRecoveryQuestion(
  assessment: DeepDiveRecoveryAssessment,
): { topic: string; prompt: string } {
  const sections = assessment.changedSections.length > 0
    ? assessment.changedSections.join(", ")
    : "the FeatureDescription";

  if (assessment.classification === "baseline_unavailable") {
    return {
      topic: "Deep-Dive recovery baseline",
      prompt: "Hepha cannot safely compare this in-progress FEAT with the Deep-Dive source because the prior semantic snapshot is unavailable. Confirm the current FeatureDescription remains the intended implementation scope, or describe the required correction.",
    };
  }

  return {
    topic: "Changed FeatureDescription scope",
    prompt: `The Deep-Dive source changed in: ${sections}. Confirm the intended implementation decision for these changes; Hepha will not infer an answer.`,
  };
}

function isLifecycleHeading(value: string): boolean {
  return /^(implementation progress|lifecycle status|execution metadata|workflow runtime|run history|phase progress)$/i.test(
    value.trim(),
  );
}

function isLifecycleMetadataLine(line: string): boolean {
  return /^\s*\*\*(?:status|lifecycle status|current phase|phase status|last updated|updated at|generated at|workflow run|run id|receipt|commit|folder)\*\*\s*:\s*.*$/i.test(line)
    || /^\s*(?:status|state|current phase|phase status|last updated|updated at|generated at|workflow run|run id|receipt|commit|folder)\s*:\s*.*$/i.test(line);
}

function changedSemanticSections(previous: string, current: string): string[] {
  const previousSections = sectionsByHeading(previous);
  const currentSections = sectionsByHeading(current);
  const headings = new Set([...previousSections.keys(), ...currentSections.keys()]);

  return [...headings]
    .filter((heading) => previousSections.get(heading) !== currentSections.get(heading))
    .sort();
}

function sectionsByHeading(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  let heading = "FeatureDescription";
  let lines: string[] = [];

  const commit = () => sections.set(heading, lines.join("\n").trim());

  for (const line of markdown.split("\n")) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) {
      commit();
      heading = match[2]!.replace(/[*_`]/g, "").trim();
      lines = [line];
    } else {
      lines.push(line);
    }
  }
  commit();

  return sections;
}
