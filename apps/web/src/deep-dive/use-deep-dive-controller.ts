import { useEffect, useState } from "react";
import type { DeepDiveSession, DeepDiveSessionResponse, WorkItemCard } from "@hepha/shared";
import { apiGet, apiPost, getErrorMessage } from "../api/http-client.js";

export interface DeepDiveControllerOptions {
  projectId: string | null;
  refreshWorkItems(projectId: string): Promise<void>;
  onError(message: string | null): void;
  onPendingAction(actionId: string | null): void;
  onResume(item: WorkItemCard): void;
}

export function useDeepDiveController({
  projectId,
  refreshWorkItems,
  onError,
  onPendingAction,
  onResume,
}: DeepDiveControllerOptions) {
  const [session, setSession] = useState<DeepDiveSession | null>(null);
  const [resumeItem, setResumeItem] = useState<WorkItemCard | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!session || !isOpen) return undefined;
    if (session.status !== "generating_questions" && session.status !== "updating_document") return undefined;

    let cancelled = false;
    const sessionId = session.id;

    async function refreshSession() {
      try {
        const response = await apiGet<DeepDiveSessionResponse>(
          `/api/deep-dive-sessions/${encodeURIComponent(sessionId)}`,
        );
        if (cancelled) return;
        setSession(response.session);
        if (response.session.status !== "generating_questions") {
          await refreshWorkItems(response.session.projectId);
        }
      } catch (error: unknown) {
        if (!cancelled) onError(getErrorMessage(error));
      }
    }

    const interval = window.setInterval(() => void refreshSession(), 2000);
    void refreshSession();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isOpen, onError, refreshWorkItems, session?.id, session?.status]);

  function close() {
    setIsOpen(false);
  }

  function reset() {
    setSession(null);
    setResumeItem(null);
    setIsOpen(false);
  }

  function openRecoverySession(recoverySession: DeepDiveSession, item: WorkItemCard) {
    setSession(recoverySession);
    setResumeItem(item);
    setIsOpen(true);
    onError(null);
  }

  async function start(item: WorkItemCard) {
    if (!projectId) return;
    onPendingAction(`start-${item.id}`);
    try {
      const response = await apiPost<DeepDiveSessionResponse>("/api/deep-dive-sessions", {
        cardId: item.id,
        projectId,
      });
      setSession(response.session);
      setIsOpen(true);
      onError(null);
    } catch (error: unknown) {
      onError(getErrorMessage(error));
    } finally {
      onPendingAction(null);
    }
  }

  async function answer(questionId: string, selectedOptionId: string, answerText: string) {
    if (!session) return;
    const activeSession = session;
    onPendingAction(`answer-${questionId}`);
    setSession({
      ...activeSession,
      agentConnectionStatus: "active",
      status: "generating_questions",
      updatedAt: new Date().toISOString(),
    });
    try {
      const response = await apiPost<DeepDiveSessionResponse>(
        `/api/deep-dive-sessions/${encodeURIComponent(activeSession.id)}/questions/${encodeURIComponent(questionId)}/answer`,
        { answerText, selectedOptionId },
      );
      setSession(response.session);
      onError(null);
    } catch (error: unknown) {
      const refreshed = await apiGet<DeepDiveSessionResponse>(
        `/api/deep-dive-sessions/${encodeURIComponent(activeSession.id)}`,
      ).catch(() => null);
      setSession(refreshed?.session ?? activeSession);
      onError(getErrorMessage(error));
    } finally {
      onPendingAction(null);
    }
  }

  async function chat(questionId: string, message: string) {
    if (!session) return;
    onPendingAction(`chat-${questionId}`);
    try {
      const response = await apiPost<DeepDiveSessionResponse>(
        `/api/deep-dive-sessions/${encodeURIComponent(session.id)}/questions/${encodeURIComponent(questionId)}/chat`,
        { message },
      );
      setSession(response.session);
      onError(null);
    } catch (error: unknown) {
      onError(getErrorMessage(error));
    } finally {
      onPendingAction(null);
    }
  }

  async function complete() {
    if (!session) return;
    const activeSession = session;
    onPendingAction("complete");
    setSession((current) => current?.id === activeSession.id
      ? { ...current, status: "updating_document", updatedAt: new Date().toISOString() }
      : current);
    try {
      const response = await apiPost<DeepDiveSessionResponse>(
        `/api/deep-dive-sessions/${encodeURIComponent(activeSession.id)}/complete`,
        {},
      );
      setSession(response.session);
      await refreshWorkItems(response.session.projectId);
      setIsOpen(false);
      onError(null);
      if (resumeItem) {
        setResumeItem(null);
        onResume(resumeItem);
      }
    } catch (error: unknown) {
      setSession((current) => current?.id === activeSession.id
        ? { ...current, status: "failed", updatedAt: new Date().toISOString() }
        : current);
      await refreshWorkItems(activeSession.projectId).catch(() => undefined);
      onError(getErrorMessage(error));
    } finally {
      onPendingAction(null);
    }
  }

  return {
    answer,
    chat,
    close,
    complete,
    isOpen,
    openRecoverySession,
    reset,
    session,
    start,
  };
}
