import { useEffect, useState, type FormEvent } from "react";
import type { ProjectSummary, SubmitFeatureResponse, WorkItemCard } from "@hepha/shared";
import { apiPost, getErrorMessage } from "../api/http-client.js";
import { initialSubmitFeatForm, type SubmitFeatForm } from "./feature-submission-overlay.js";

export interface FeatureSubmissionOptions {
  projectId: string | null;
  onError(message: string | null): void;
  onItems(items: WorkItemCard[]): void;
  onNotice(message: string | null): void;
  onPendingAction(actionId: string | null): void;
  onProject(project: ProjectSummary): void;
  onSelectItem(itemId: string): void;
  onShowDetail(): void;
}

export function useFeatureSubmission(options: FeatureSubmissionOptions) {
  const [form, setForm] = useState<SubmitFeatForm>(initialSubmitFeatForm);
  const [isOpen, setIsOpen] = useState(false);

  function close() {
    setIsOpen(false);
  }

  function open() {
    setIsOpen(true);
    options.onNotice(null);
  }

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented && isOpen) {
        event.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const projectId = options.projectId;
    if (!projectId) return;
    options.onPendingAction("submit-feat");
    options.onNotice(null);
    try {
      const response = await apiPost<SubmitFeatureResponse>("/api/submit-feature", { ...form, projectId });
      options.onProject(response.project);
      options.onItems(response.items);
      options.onSelectItem(response.feature.id);
      setForm(initialSubmitFeatForm);
      close();
      options.onShowDetail();
      options.onNotice(response.summary);
      options.onError(null);
    } catch (error: unknown) {
      options.onError(getErrorMessage(error));
    } finally {
      options.onPendingAction(null);
    }
  }

  return { close, form, isOpen, open, setForm, submit };
}
