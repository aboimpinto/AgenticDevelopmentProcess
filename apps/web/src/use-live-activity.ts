/**
 * FEAT-034: Live Activity React Hook
 *
 * Manages project-level SSE subscription for live activity updates.
 * Tracks connection state, event cursor, and provides event handling
 * for the live activity stream.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LiveActivityConnectionState,
  LiveActivityEvent,
  LiveActivityStatus,
} from "@hepha/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiveActivityCallbacks {
  /** Called when a live activity event is received. */
  onEvent?: (event: LiveActivityEvent) => void;
  /** Called when replay becomes unavailable. */
  onReplayUnavailable?: (reason: string) => void;
  /** Called on SSE error. */
  onError?: (errorMessage: string) => void;
  /** Called when connection state changes. */
  onStateChange?: (state: LiveActivityConnectionState) => void;
}

export interface UseLiveActivityResult {
  /** Current live activity status. */
  status: LiveActivityStatus;
  /** Whether the live activity stream is active. */
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Parsing helper
// ---------------------------------------------------------------------------

function parseSseData<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook that manages a project-level SSE subscription for live activity.
 *
 * @param projectId - The project ID to subscribe to, or null to disable.
 * @param initialCursor - Optional initial phase lifecycle cursor for reconnect.
 * @param callbacks - Event callbacks.
 */
export function useLiveActivity(
  projectId: string | null,
  initialCursor?: string | null,
  callbacks?: LiveActivityCallbacks,
): UseLiveActivityResult {
  const [status, setStatus] = useState<LiveActivityStatus>({
    connectionState: projectId ? "connecting" : "disabled",
    lastEventTimestamp: null,
    lastPhaseCursor: initialCursor ?? null,
    isReplayUnavailable: false,
    errorMessage: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const cursorRef = useRef<string | null>(initialCursor ?? null);
  const callbacksRef = useRef(callbacks);

  // Event handlers need the latest callbacks without reconnecting the SSE stream.
  callbacksRef.current = callbacks;

  const handleEvent = useCallback(
    (event: LiveActivityEvent) => {
      cursorRef.current = event.category === "phase" ? event.id : cursorRef.current;

      setStatus((prev) => ({
        ...prev,
        connectionState: "live",
        lastEventTimestamp: event.occurredAt,
        lastPhaseCursor: event.category === "phase" ? event.id : prev.lastPhaseCursor,
        isReplayUnavailable: false,
        errorMessage: null,
      }));

      callbacksRef.current?.onEvent?.(event);
    },
    [],
  );

  useEffect(() => {
    if (!projectId) {
      setStatus({
        connectionState: "disabled",
        lastEventTimestamp: null,
        lastPhaseCursor: null,
        isReplayUnavailable: false,
        errorMessage: null,
      });
      cursorRef.current = null;

      return undefined;
    }

    let cancelled = false;
    const activeProjectId = projectId;
    cursorRef.current = initialCursor ?? null;

    setStatus({
      connectionState: "connecting",
      lastEventTimestamp: null,
      lastPhaseCursor: cursorRef.current,
      isReplayUnavailable: false,
      errorMessage: null,
    });

    function connect() {
      if (cancelled) {
        return;
      }

      const cursor = cursorRef.current;
      const queryParam = cursor ? `?lastPhaseCursor=${encodeURIComponent(cursor)}` : "";
      const url = `/api/projects/${encodeURIComponent(activeProjectId)}/live-activity${queryParam}`;

      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener("live-activity.connected", () => {
        if (cancelled) {
          return;
        }

        setStatus((prev) => ({
          ...prev,
          connectionState: "live",
          isReplayUnavailable: false,
          errorMessage: null,
        }));
        callbacksRef.current?.onStateChange?.("live");
      });

      es.addEventListener("live-activity.event", (event: Event) => {
        if (cancelled) {
          return;
        }

        const data = parseSseData<LiveActivityEvent>(
          (event as MessageEvent<string>).data,
        );

        if (data) {
          handleEvent(data);
        }
      });

      es.addEventListener("live-activity.replay-batch", (event: Event) => {
        if (cancelled) {
          return;
        }

        const data = parseSseData<{ events: LiveActivityEvent[] }>(
          (event as MessageEvent<string>).data,
        );

        if (data?.events) {
          for (const replayedEvent of data.events) {
            handleEvent(replayedEvent);
          }
        }
      });

      es.addEventListener("live-activity.replay-unavailable", (event: Event) => {
        if (cancelled) {
          return;
        }

        const data = parseSseData<{ reason: string }>(
          (event as MessageEvent<string>).data,
        );

        if (data?.reason) {
          setStatus((prev) => ({
            ...prev,
            isReplayUnavailable: true,
          }));
          callbacksRef.current?.onReplayUnavailable?.(data.reason);
        }
      });

      es.addEventListener("live-activity.error", (event: Event) => {
        if (cancelled) {
          return;
        }

        const data = parseSseData<{ error: string }>(
          (event as MessageEvent<string>).data,
        );

        const errorMsg = data?.error ?? "Live activity stream error";

        setStatus((prev) => ({
          ...prev,
          connectionState: "degraded",
          errorMessage: errorMsg,
        }));
        callbacksRef.current?.onError?.(errorMsg);
      });

      es.onerror = () => {
        if (cancelled) {
          return;
        }

        setStatus((prev) => ({
          ...prev,
          connectionState: prev.connectionState === "live" ? "reconnecting" : "offline",
        }));
        callbacksRef.current?.onStateChange?.("offline");
      };
    }

    connect();

    return () => {
      cancelled = true;

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [projectId, initialCursor, handleEvent]);

  return {
    status,
    isActive: status.connectionState === "live" || status.connectionState === "reconnecting",
  };
}
