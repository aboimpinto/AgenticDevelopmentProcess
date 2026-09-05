import type { EpicDeliveryState } from "@hepha/shared";
import { upsertEpicState } from "./lifecycle-state.js";
import {
  getMermaidClassName,
  type EpicSyncResult,
  type FeatNormalizedState,
  type FeatStatusSnapshot,
  type ProgressCounts,
  type SectionChangeSummary,
} from "./feature-snapshots.js";
import {
  renderFeatureTableStatuses,
  renderMetadataProgress,
} from "./metadata-feature-renderers.js";
import {
  renderEpicProgress,
  renderProgressTrackingStatuses,
} from "./progress-renderers.js";
import { renderMermaidClasses } from "./mermaid-renderers.js";

/** Run all targeted renderers in order and accumulate their evidence. */
export function syncEpicLifecycleRegions(
  markdown: string,
  snapshots: FeatStatusSnapshot[],
  counts: ProgressCounts,
  derivedState: EpicDeliveryState,
  progressPercent: number,
  mermaidMapping: Map<string, { nodeVar: string; title: string }>,
): EpicSyncResult {
  const allWarnings: string[] = [];
  const allBlockers: string[] = [];
  const allSections: SectionChangeSummary[] = [];
  let currentMarkdown = markdown;
  let finalChanged = false;

  // Check for ambiguous state blockers before any render
  const ambiguousSnapshots = snapshots.filter((s) => s.ambiguousState);
  if (ambiguousSnapshots.length > 0) {
    for (const amb of ambiguousSnapshots) {
      allBlockers.push(
        `Ambiguous state: ${amb.featId} found in multiple state folders — cannot determine correct status`,
      );
    }
    return {
      markdown,
      changed: false,
      sections: [],
      warnings: allWarnings,
      blockers: allBlockers,
    };
  }

  // 1. Metadata state (use existing upsertEpicState)
  const stateResult = upsertEpicState(currentMarkdown, derivedState);
  const stateChanged = stateResult !== currentMarkdown;
  allSections.push({ section: "metadata-state", changed: stateChanged });
  if (stateChanged) {
    currentMarkdown = stateResult;
    finalChanged = true;
  }

  // 2. Metadata progress
  const progressResult = renderMetadataProgress(currentMarkdown, progressPercent);
  allSections.push(...progressResult.sections.filter((s) => s.section === "metadata-progress"));
  allWarnings.push(...progressResult.warnings);
  if (progressResult.changed) {
    currentMarkdown = progressResult.markdown;
    finalChanged = true;
  }

  // 3. Feature table statuses
  const childStateMap = new Map<string, FeatNormalizedState>();
  for (const snap of snapshots) {
    childStateMap.set(snap.featId, snap.normalizedState);
  }
  const tableResult = renderFeatureTableStatuses(currentMarkdown, childStateMap);
  allSections.push(...tableResult.sections.filter((s) => s.section === "feature-table"));
  allWarnings.push(...tableResult.warnings.filter((w) => !allWarnings.includes(w)));
  if (tableResult.changed) {
    currentMarkdown = tableResult.markdown;
    finalChanged = true;
  }

  // 4. Epic Progress
  const progressSectionResult = renderEpicProgress(currentMarkdown, counts, derivedState, progressPercent);
  allSections.push(...progressSectionResult.sections.filter((s) => s.section === "epic-progress"));
  allWarnings.push(...progressSectionResult.warnings.filter((w) => !allWarnings.includes(w)));
  if (progressSectionResult.changed) {
    currentMarkdown = progressSectionResult.markdown;
    finalChanged = true;
  }

  // 5. Progress Tracking
  const trackingStateMap = new Map<string, { state: FeatNormalizedState; started?: string }>();
  const today = new Date().toISOString().slice(0, 10);
  for (const snap of snapshots) {
    trackingStateMap.set(snap.featId, {
      state: snap.normalizedState,
      started: snap.normalizedState === "IN_PROGRESS" ? today : undefined,
    });
  }
  const trackingResult = renderProgressTrackingStatuses(currentMarkdown, trackingStateMap);
  allSections.push(...trackingResult.sections.filter((s) => s.section === "progress-tracking"));
  allWarnings.push(...trackingResult.warnings.filter((w) => !allWarnings.includes(w)));
  if (trackingResult.changed) {
    currentMarkdown = trackingResult.markdown;
    finalChanged = true;
  }

  // 6. Mermaid classes
  const mermaidClassMap = new Map<string, { nodeVar: string; statusClass: string }>();
  for (const snap of snapshots) {
    const mermaidInfo = mermaidMapping.get(snap.featId);
    if (mermaidInfo) {
      mermaidClassMap.set(snap.featId, {
        nodeVar: mermaidInfo.nodeVar,
        statusClass: getMermaidClassName(snap.normalizedState),
      });
    }
  }
  const mermaidResult = renderMermaidClasses(currentMarkdown, mermaidClassMap);
  allSections.push(...mermaidResult.sections.filter((s) => s.section === "mermaid-classes"));
  allWarnings.push(...mermaidResult.warnings.filter((w) => !allWarnings.includes(w)));
  if (mermaidResult.changed) {
    currentMarkdown = mermaidResult.markdown;
    finalChanged = true;
  }

  return {
    markdown: currentMarkdown,
    changed: finalChanged,
    sections: allSections,
    warnings: allWarnings,
    blockers: allBlockers,
  };
}
