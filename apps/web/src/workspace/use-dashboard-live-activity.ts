import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LiveActivityEvent } from "@hepha/shared";
import { useLiveActivity } from "../use-live-activity.js";

const ATTENTION_EVENT_TYPES = new Set([
  "deep-dive.completed",
  "deep-dive.failed",
  "finding.submitted",
  "finding.closed",
  "phase.blocked",
  "phase.failed",
  "workflow.failed",
  "workflow.human-review",
  "workflow.completed",
]);

export interface DashboardLiveActivityOptions {
  projectId: string | null;
  selectedItemId: string | null;
  refreshWorkItems(projectId: string): Promise<void>;
  onDocumentChanged(): void;
  onError(message: string): void;
}

export function useDashboardLiveActivity({
  projectId,
  selectedItemId,
  refreshWorkItems,
  onDocumentChanged,
  onError,
}: DashboardLiveActivityOptions) {
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const fileChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announcementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    if (!projectId) return;
    void refreshWorkItems(projectId).catch((error: unknown) => {
      onError(error instanceof Error ? error.message : "Failed to refresh live activity");
    });
  }, [onError, projectId, refreshWorkItems]);

  const handleEvent = useCallback((event: LiveActivityEvent) => {
    if (event.category === "file-change") {
      if (fileChangeTimerRef.current !== null) clearTimeout(fileChangeTimerRef.current);
      fileChangeTimerRef.current = setTimeout(refresh, 300);
      return;
    }

    if (event.category === "phase") {
      if (event.cardId && selectedItemId === event.cardId && projectId) onDocumentChanged();
      refresh();
      return;
    }

    if (!ATTENTION_EVENT_TYPES.has(event.type)) return;

    setAnnouncement(event.summary);
    if (announcementTimerRef.current !== null) clearTimeout(announcementTimerRef.current);
    announcementTimerRef.current = setTimeout(() => {
      setAnnouncement((current) => current === event.summary ? null : current);
    }, 8000);
    refresh();
  }, [onDocumentChanged, projectId, refresh, selectedItemId]);

  const callbacks = useMemo(() => ({ onEvent: handleEvent }), [handleEvent]);
  const liveActivity = useLiveActivity(projectId, null, callbacks);

  useEffect(() => () => {
    if (fileChangeTimerRef.current !== null) clearTimeout(fileChangeTimerRef.current);
    if (announcementTimerRef.current !== null) clearTimeout(announcementTimerRef.current);
  }, []);

  return { ...liveActivity, announcement };
}
