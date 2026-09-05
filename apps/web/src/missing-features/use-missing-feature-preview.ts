import { useState } from "react";
import type {
  BatchPreviewPlan,
  CreateMissingFeaturesInput,
  CreateMissingFeaturesResponse,
  PreviewMissingFeaturesResponse,
  ProjectSummary,
  WorkItemCard,
} from "@hepha/shared";
import { apiPost, getErrorMessage } from "../api/http-client.js";
import {
  formatMissingFeaturesNotice,
  isRecoverableMissingFeaturesPreviewError,
} from "../missing-feature-preview.js";

export interface MissingFeaturePreviewOptions {
  projectId: string | null;
  onError(message: string | null): void;
  onItems(items: WorkItemCard[]): void;
  onNotice(message: string | null): void;
  onPendingAction(actionId: string | null): void;
  onProject(project: ProjectSummary): void;
}

export function useMissingFeaturePreview(options: MissingFeaturePreviewOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [plan, setPlan] = useState<BatchPreviewPlan | null>(null);
  const [sourceCardId, setSourceCardId] = useState<string | null>(null);

  function reset() {
    setPlan(null);
    setSourceCardId(null);
  }

  async function preview(item: WorkItemCard) {
    const projectId = options.projectId;
    if (!projectId) return;
    setIsLoading(true);
    setPlan(null);
    setSourceCardId(item.id);
    options.onNotice(null);
    options.onError(null);
    try {
      const response = await apiPost<PreviewMissingFeaturesResponse>("/api/missing-features/preview", {
        cardId: item.id,
        projectId,
      });
      setPlan(response.plan);
      options.onItems(response.items);
      if (!response.plan.applyAllowed) {
        options.onNotice("No new FEAT candidates found for this EPIC.");
      }
    } catch (error: unknown) {
      options.onNotice(null);
      options.onError(getErrorMessage(error));
      reset();
    } finally {
      setIsLoading(false);
    }
  }

  async function apply(candidatePlan: BatchPreviewPlan) {
    const projectId = options.projectId;
    if (!projectId || !sourceCardId) return;
    options.onPendingAction(`missing-features-${sourceCardId}`);
    options.onError(null);
    try {
      const response = await apiPost<CreateMissingFeaturesResponse>("/api/missing-features", {
        cardId: sourceCardId,
        planHash: candidatePlan.planHash,
        previewPlan: candidatePlan,
        projectId,
        sourceDocumentHash: candidatePlan.epicDocumentHash,
      } satisfies CreateMissingFeaturesInput);
      options.onProject(response.project);
      options.onItems(response.items);
      reset();
      options.onNotice(formatMissingFeaturesNotice(response));
      options.onError(null);
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      options.onNotice(null);
      options.onError(message);
      if (isRecoverableMissingFeaturesPreviewError(message)) reset();
    } finally {
      options.onPendingAction(null);
    }
  }

  function cancel() {
    reset();
    options.onNotice("Preview cancelled. No files were created.");
    options.onError(null);
  }

  return { apply, cancel, isLoading, plan, preview };
}
