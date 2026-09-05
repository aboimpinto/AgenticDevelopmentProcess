import { useEffect, useState, type FormEvent } from "react";
import type {
  ProjectSummary,
  SubmitEpicRefinementResponse,
  SubmitEpicResponse,
  WorkItemCard,
} from "@hepha/shared";
import { apiPost, getErrorMessage } from "../api/http-client.js";
import { initialSubmitEpicForm, type SubmitEpicForm } from "./epic-submission-overlay.js";

export interface EpicSubmissionOptions {
  projectId: string | null;
  onError(message: string | null): void;
  onItems(items: WorkItemCard[]): void;
  onNotice(message: string | null): void;
  onProject(project: ProjectSummary): void;
  onRefinementPending(actionId: string | null): void;
  onSelectItem(itemId: string): void;
  onShowDetail(): void;
  onSubmissionPending(actionId: string | null): void;
}

export function useEpicSubmission(options: EpicSubmissionOptions) {
  const [form, setForm] = useState<SubmitEpicForm>(initialSubmitEpicForm);
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
    options.onSubmissionPending("submit-epic");
    options.onNotice(null);
    try {
      const response = await apiPost<SubmitEpicResponse>("/api/submit-epic", { ...form, projectId });
      options.onProject(response.project);
      options.onItems(response.items);
      options.onSelectItem(response.epic.id);
      setForm(initialSubmitEpicForm);
      close();
      options.onShowDetail();
      options.onNotice(response.summary);
      options.onError(null);
    } catch (error: unknown) {
      options.onError(getErrorMessage(error));
    } finally {
      options.onSubmissionPending(null);
    }
  }

  async function refine(item: WorkItemCard, request: string) {
    const projectId = options.projectId;
    if (!projectId) return;
    options.onRefinementPending(`epic-refinement-${item.id}`);
    options.onNotice(null);
    try {
      const response = await apiPost<SubmitEpicRefinementResponse>("/api/epic-refinements", {
        cardId: item.id,
        projectId,
        request,
      });
      options.onProject(response.project);
      options.onItems(response.items);
      options.onSelectItem(response.epic.id);
      options.onNotice(response.summary);
      options.onError(null);
    } catch (error: unknown) {
      options.onError(getErrorMessage(error));
    } finally {
      options.onRefinementPending(null);
    }
  }

  return { close, form, isOpen, open, refine, setForm, submit };
}
