import type { FeatureHumanReviewCheck, FeatureWorkflowActionResponse, ProjectSummary, WorkItemCard } from "@hepha/shared";
import { apiPost, getErrorMessage } from "../api/http-client.js";

type SelectionPolicy = "keep" | "match-or-current" | "match-or-clear";

export interface FeatureActionControllerOptions {
  projectId: string | null;
  onError(message: string | null): void;
  onItems(items: WorkItemCard[]): void;
  onNotice(message: string | null): void;
  onPendingAction(actionId: string | null): void;
  onProject(project: ProjectSummary): void;
  onSelectItem(itemId: string | null): void;
}

export function useFeatureActions(options: FeatureActionControllerOptions) {
  async function execute(
    item: WorkItemCard,
    command: {
      actionId: string;
      body?: Record<string, unknown>;
      endpoint: string;
      notice?: boolean;
      selection?: SelectionPolicy;
    },
  ) {
    if (!options.projectId) return;
    options.onPendingAction(command.actionId);
    options.onNotice(null);
    try {
      const response = await apiPost<FeatureWorkflowActionResponse>(command.endpoint, {
        cardId: item.id,
        projectId: options.projectId,
        ...command.body,
      });
      options.onProject(response.project);
      options.onItems(response.items);
      const matchedId = response.items.find((candidate) => candidate.externalId === item.externalId)?.id;
      if (command.selection === "match-or-clear") options.onSelectItem(matchedId ?? null);
      if (command.selection === "match-or-current") options.onSelectItem(matchedId ?? item.id);
      if (command.notice !== false) options.onNotice(response.summary);
      options.onError(null);
    } catch (error: unknown) {
      options.onError(getErrorMessage(error));
    } finally {
      options.onPendingAction(null);
    }
  }

  return {
    evaluateFeatureUiRequirement: (item: WorkItemCard) => execute(item, {
      actionId: `ui-decision-${item.id}`,
      endpoint: "/api/feature-ui-requirement",
      notice: false,
      selection: "keep",
    }),
    createUiRequirements: (item: WorkItemCard) => execute(item, {
      actionId: `design-feature-${item.id}`,
      endpoint: "/api/design-feature",
      selection: "match-or-current",
    }),
    refineFeature: (item: WorkItemCard) => execute(item, {
      actionId: `refine-feature-${item.id}`,
      endpoint: "/api/refine-feature",
      selection: "match-or-clear",
    }),
    startImplementing: (item: WorkItemCard, autonomous: boolean) => execute(item, {
      actionId: `start-implementing-${item.id}`,
      body: { autonomous },
      endpoint: "/api/start-implementing",
      selection: "match-or-current",
    }),
    continueImplementing: (item: WorkItemCard, autonomous: boolean) => execute(item, {
      actionId: `continue-implementing-${item.id}`,
      body: { autonomous },
      endpoint: "/api/continue-implementing",
      selection: "match-or-current",
    }),
    completeFeature: (item: WorkItemCard) => execute(item, {
      actionId: `complete-feature-${item.id}`,
      endpoint: "/api/complete-feature",
      selection: "match-or-current",
    }),
    completeEpic: (item: WorkItemCard) => execute(item, {
      actionId: `complete-epic-${item.id}`,
      endpoint: "/api/complete-epic",
      selection: "match-or-current",
    }),
    cancelFeatureWorkflow: (item: WorkItemCard) => execute(item, {
      actionId: `cancel-workflow-${item.id}`,
      endpoint: "/api/cancel-feature-workflow",
      selection: "match-or-current",
    }),
    recordHumanReview: (item: WorkItemCard, check: FeatureHumanReviewCheck) => execute(item, {
      actionId: `${check}-${item.id}`,
      body: { check },
      endpoint: "/api/feature-human-review",
      selection: "match-or-current",
    }),
    submitFeatureFinding: (item: WorkItemCard, content: string) => execute(item, {
      actionId: `finding-submit-${item.id}`,
      body: { content },
      endpoint: "/api/feature-findings",
      selection: "match-or-current",
    }),
    addFeatureFindingDetail: (item: WorkItemCard, findingId: string, content: string) => execute(item, {
      actionId: `finding-detail-${findingId}`,
      body: { content, findingId },
      endpoint: "/api/feature-findings/detail",
      selection: "match-or-current",
    }),
    resolveFeatureFinding: (item: WorkItemCard, findingId: string) => execute(item, {
      actionId: `finding-resolve-${findingId}`,
      body: { findingId },
      endpoint: "/api/feature-findings/resolve",
      selection: "match-or-current",
    }),
    acceptHumanReviewFindings: (item: WorkItemCard) => execute(item, {
      actionId: `finding-phase-accept-${item.id}`,
      endpoint: "/api/feature-findings/accept-phase",
      selection: "match-or-current",
    }),
  };
}
