/**
 * FEAT-056: Workflow interaction panel.
 *
 * Composes all workflow panels and integrates with the workflow controller.
 * Receives authoritative facts from the parent (detail blade) and dispatches
 * typed intents through the controller. No lifecycle policy evaluation here.
 */

import React, { useCallback, useMemo, useState } from "react";
import type { BatchPreviewPlan, DeepDiveSession, WorkItemCard } from "@hepha/shared";
import { buildPortfolioTimingAnalytics, getTerminalWorkItemLifecycle } from "@hepha/shared";

import type { WorkflowActionId } from "./types.js";
import type { WorkflowApiAdapter } from "./workflow-api.js";
import type { RuntimeEvidenceApi } from "./runtime-evidence-api.js";
import { useRuntimeEvidenceController } from "./use-runtime-evidence-controller.js";
import { useWorkflowController } from "./use-workflow-controller.js";
import { createWorkflowApiAdapter } from "./workflow-api.js";
import { buildWorkflowReadModel } from "./workflow-mappers.js";
import {
  buildOverviewDisplay,
  buildPhaseRows,
  buildRecoveryActions,
  buildHumanVerificationSummary,
  buildCompletionReadiness,
  buildFeatureTimingSummary,
  summarizeResolvedPhaseQualityGates,
} from "./workflow-presentation.js";

import { WorkflowOverviewPanel } from "./workflow-overview-panel.js";
import { WorkflowPhaseListPanel } from "./workflow-phase-list-panel.js";
import { WorkflowTimingSummaryPanel } from "./workflow-timing-summary-panel.js";
import { PortfolioTimingSummaryPanel } from "./portfolio-timing-summary-panel.js";
import { LifecycleControlsPanel } from "./lifecycle-controls-panel.js";
import { CompletionReadinessPanel } from "./completion-readiness-panel.js";
import { EpicFeatureExtractionPanel } from "./epic-feature-extraction-panel.js";

// ─── Static API adapter (shared across instances) ───────────────────────────

const defaultApi = createWorkflowApiAdapter();

// ─── Props ──────────────────────────────────────────────────────────────────

export interface WorkflowInteractionPanelProps {
  readonly item: WorkItemCard;
  readonly relatedFeatures?: readonly WorkItemCard[];
  readonly projectId: string;
  readonly onItemsUpdated?: (items: WorkItemCard[]) => void;
  readonly onNotice?: (message: string | null) => void;
  readonly onError?: (message: string | null) => void;
  /** Deep-Dive creates a session/overlay and is not a FeatureWorkflowAction route. */
  readonly onStartDeepDive?: (item: WorkItemCard) => void;
  /** Opens the persisted recovery session returned by Continue Implementation. */
  readonly onDeepDiveRecoverySession?: (session: DeepDiveSession, item: WorkItemCard) => void;
  readonly isDeepDivePending?: boolean;
  readonly previewPlan?: BatchPreviewPlan | null;
  readonly isFeaturePreviewLoading?: boolean;
  readonly isApplyingFeaturePreview?: boolean;
  readonly onPreviewFeatures?: (item: WorkItemCard) => void;
  readonly onApplyFeaturePreview?: (plan: BatchPreviewPlan) => void;
  readonly onCancelFeaturePreview?: () => void;
  readonly onSubmitFinding?: (item: WorkItemCard, content: string) => void;
  readonly api?: WorkflowApiAdapter;
  readonly runtimeEvidenceApi?: RuntimeEvidenceApi;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function WorkflowInteractionPanel({
  item,
  relatedFeatures = [],
  projectId,
  onItemsUpdated,
  onNotice,
  onError,
  onStartDeepDive,
  onDeepDiveRecoverySession,
  isDeepDivePending = false,
  previewPlan = null,
  isFeaturePreviewLoading = false,
  isApplyingFeaturePreview = false,
  onPreviewFeatures,
  onApplyFeaturePreview,
  onCancelFeaturePreview,
  onSubmitFinding,
  api = defaultApi,
  runtimeEvidenceApi,
}: WorkflowInteractionPanelProps) {
  const controller = useWorkflowController(api);
  const [findingDraft, setFindingDraft] = useState("");
  const [isFindingFormOpen, setIsFindingFormOpen] = useState(false);
  const terminalLifecycle = getTerminalWorkItemLifecycle(item);
  const portfolioTiming = useMemo(
    () => buildPortfolioTimingAnalytics(relatedFeatures),
    [relatedFeatures],
  );
  const runtimeCardKey = `feature:${item.externalId.toUpperCase()}`;
  const runtimeEvidence = useRuntimeEvidenceController(
    projectId,
    runtimeCardKey,
    item.id,
    runtimeEvidenceApi,
    item.kind === "feature" && projectId.length > 0,
  );

  // Build read model from authoritative card data
  const readModel = useMemo(
    () => buildWorkflowReadModel(item, (actionId) =>
      controller.state.pendingActionId === actionId,
    ),
    [item, controller.state.pendingActionId],
  );

  // Build display models
  const overview = useMemo(
    () => buildOverviewDisplay(item.featureWorkflow ?? null, terminalLifecycle),
    [item.featureWorkflow, terminalLifecycle],
  );

  const phaseRows = useMemo(
    () =>
      buildPhaseRows(
        item.phases,
        item.featureWorkflow?.implementationPhases ?? [],
        item.featureWorkflow?.lastRun?.runId ?? null,
        item.implementationEvidence?.phaseQualityGates ?? [],
        item.featureWorkflow?.implementationAgentRuns ?? [],
        item.featureWorkflow?.defaultImplementationModel ?? null,
        item.featureWorkflow?.refineCompletedAt ?? null,
      ),
    [item.phases, item.featureWorkflow?.implementationPhases, item.featureWorkflow?.implementationAgentRuns, item.featureWorkflow?.defaultImplementationModel, item.featureWorkflow?.lastRun?.runId, item.featureWorkflow?.refineCompletedAt, item.implementationEvidence?.phaseQualityGates],
  );

  const featureTiming = useMemo(
    () => buildFeatureTimingSummary(
      item.phases,
      item.featureWorkflow?.implementationPhases ?? [],
      item.featureWorkflow?.implementationAgentRuns ?? [],
    ),
    [item.phases, item.featureWorkflow?.implementationPhases, item.featureWorkflow?.implementationAgentRuns],
  );

  const recoveryActions = useMemo(
    () => buildRecoveryActions(item.featureWorkflow ?? null, terminalLifecycle),
    [item.featureWorkflow, terminalLifecycle],
  );

  const canSelectImplementationMode = readModel.actions.some(
    (action) =>
      action.available &&
      (action.id === "start-implementing" || action.id === "continue-implementing"),
  );
  const isImplementationModePending =
    controller.state.pendingActionId === "start-implementing" ||
    controller.state.pendingActionId === "continue-implementing";

  const completionReadiness = useMemo(() => {
    const gateSummary = summarizeResolvedPhaseQualityGates(
      item.implementationEvidence?.phaseQualityGates ?? [],
    );
    return buildCompletionReadiness(
      item.featureWorkflow ?? null,
      gateSummary.total,
      gateSummary,
      terminalLifecycle,
    );
  }, [item.featureWorkflow, item.implementationEvidence?.phaseQualityGates, terminalLifecycle]);

  // Action handler
  const handleAction = useCallback(
    async (actionId: WorkflowActionId) => {
      if (actionId === "submit-finding") {
        setIsFindingFormOpen(true);
        return;
      }

      if (actionId === "accept-human-review-findings") {
        const result = await controller.acceptHumanReviewFindings(projectId, item.id);
        if (result.error) {
          onError?.(result.error);
        } else {
          onItemsUpdated?.(result.items);
          onNotice?.(result.message);
          onError?.(null);
        }
        return;
      }

      if (actionId === "record-user-code-review") {
        const result = await controller.recordHumanReview(
          projectId,
          item.id,
          "user-code-review",
          item,
        );
        if (result.error) {
          onError?.(result.error);
        } else {
          onItemsUpdated?.(result.items);
          onNotice?.(result.message);
          onError?.(null);
        }
        return;
      }

      const intent = {
        actionId,
        cardId: item.id,
        projectId,
        autonomous: controller.state.autonomousMode,
      };

      const result = await controller.executeAction(intent, item, 
        // onSuccess
        (res) => {
          if (res.kind === "success" && res.deepDiveRecoverySession) {
            onDeepDiveRecoverySession?.(res.deepDiveRecoverySession, item);
          }
          onNotice?.(res.message);
          onError?.(null);
        },
        // onRejection
        (res) => {
          onError?.(res.message);
        },
        // onTransportError
        (err) => {
          onError?.(err.message);
        },
      );

      if (result.error) {
        onError?.(result.error);
      } else if (result.message) {
        onNotice?.(result.message);
      }
    },
    [controller, item, projectId, onItemsUpdated, onNotice, onError, onDeepDiveRecoverySession],
  );

  // Complete handler
  const handleComplete = useCallback(async () => {
    await handleAction("complete-feature");
  }, [handleAction]);

  const deepDiveRecoveryActions = recoveryActions.filter((action) => action.type === "deep_dive");
  const workflowRecoveryActions = recoveryActions.filter((action) => action.type !== "deep_dive");

  if (item.kind === "epic") {
    const needsDeepDive = !terminalLifecycle && item.validation.needsValidationCount > 0;

    return (
      <div className="workflow-interaction-panel" role="region" aria-label="EPIC workflow">
        <PortfolioTimingSummaryPanel analytics={portfolioTiming} title="EPIC delivery timing" />
        {needsDeepDive ? (
          <section className="validation-panel" aria-labelledby="epic-deep-dive-title">
            <div className="validation-heading">
              <strong id="epic-deep-dive-title">Deep-Dive Required</strong>
            </div>
            <p className="validation-message">
              {item.validation.deepDiveMessage || "Resolve the EPIC validation markers before extracting FEATs."}
            </p>
            <div className="feature-workflow-actions" role="group" aria-label="EPIC Deep-Dive">
              <button
                className="mini-button validation-action"
                disabled={!onStartDeepDive || isDeepDivePending}
                onClick={() => onStartDeepDive?.(item)}
                type="button"
              >
                {isDeepDivePending ? "Starting EPIC Deep-Dive..." : "Start EPIC Deep-Dive"}
              </button>
            </div>
          </section>
        ) : !terminalLifecycle ? (
          <EpicFeatureExtractionPanel
            isApplyingPreview={isApplyingFeaturePreview}
            isPreviewLoading={isFeaturePreviewLoading}
            item={item}
            onApply={onApplyFeaturePreview}
            onCancel={onCancelFeaturePreview}
            onPreview={onPreviewFeatures}
            previewPlan={previewPlan}
          />
        ) : null}
      </div>
    );
  }

  if (!readModel.available) {
    return <WorkflowOverviewPanel overview={overview} />;
  }

  return (
    <div className="workflow-interaction-panel" role="region" aria-label="Feature workflow">
      {/* Overview — readiness, active run, last run */}
      <WorkflowOverviewPanel overview={overview} />

      {/* A FEAT Deep-Dive is an overlay/session workflow, not a FeatureWorkflowAction route. */}
      {deepDiveRecoveryActions.length > 0 && (
        <section className="validation-panel" aria-labelledby="feature-deep-dive-title">
          <div className="validation-heading">
            <strong id="feature-deep-dive-title">Deep-Dive Required</strong>
          </div>
          <p className="validation-message">{deepDiveRecoveryActions[0]?.description}</p>
          <div className="feature-workflow-actions" role="group" aria-label="FEAT Deep-Dive">
            <button
              className="mini-button validation-action"
              disabled={!onStartDeepDive || isDeepDivePending}
              onClick={() => onStartDeepDive?.(item)}
              type="button"
            >
              {isDeepDivePending ? "Opening FEAT Deep-Dive..." : deepDiveRecoveryActions[0]?.label}
            </button>
          </div>
        </section>
      )}

      {/* Lifecycle controls for recovery and implementation actions */}
      {workflowRecoveryActions.length > 0 && (
        <LifecycleControlsPanel
          actions={workflowRecoveryActions.map((action) => ({
            id: action.type === "ui_requirement" ? "check-ui-requirement" : "create-ui-requirements",
            label: action.label,
            available: action.available,
            busy: false,
            reason: null,
            group: "recovery",
          }))}
          title="Recovery Actions"
          onAction={handleAction}
        />
      )}
      <LifecycleControlsPanel
        actions={readModel.actions.filter((a) => a.id === "refine-feature")}
        title="Feature Preparation"
        onAction={handleAction}
      />

      {canSelectImplementationMode ? (
        <label className="workflow-toggle workflow-execution-mode">
          <input
            aria-label="Autonomous implementation"
            checked={controller.state.autonomousMode}
            disabled={isImplementationModePending}
            onChange={(event) => controller.setAutonomousMode(event.currentTarget.checked)}
            type="checkbox"
          />
          <span>Autonomous implementation</span>
          <small>Unchecked: implement and accept only the next phase.</small>
        </label>
      ) : null}
      <LifecycleControlsPanel
        actions={readModel.actions.filter(
          (a) =>
            a.id === "start-implementing" ||
            a.id === "continue-implementing" ||
            a.id === "cancel-workflow",
        )}
        title="Implementation"
        onAction={handleAction}
      />

      {/* Estimates are generated by Start Feature post-processing; actuals come from completed phase runs. */}
      <WorkflowTimingSummaryPanel timing={featureTiming} />

      {/* Phase list with the server-authoritative runtime projection. */}
      <WorkflowPhaseListPanel
        phases={phaseRows}
        runtimeEvidence={{
          summaries: runtimeEvidence.state.summary?.phases ?? [],
          snapshots: runtimeEvidence.state.phases,
          openPhaseIds: runtimeEvidence.state.openPhaseIds,
          pendingPhaseIds: runtimeEvidence.state.pendingPhaseIds,
          isRefreshing: runtimeEvidence.state.isRefreshing,
          isStale: runtimeEvidence.state.isStale,
          onToggle: runtimeEvidence.togglePhase,
          onLoadMore: runtimeEvidence.loadMore,
          onRefresh: runtimeEvidence.refresh,
        }}
      />
      {runtimeEvidence.state.error ? <p className="validation-message" role="alert">{runtimeEvidence.state.error}</p> : null}

      {/* Human checkpoint actions */}
      <LifecycleControlsPanel
        actions={readModel.actions.filter(
          (a) =>
            a.id === "record-user-code-review" ||
            a.id === "submit-finding" ||
            a.id === "accept-human-review-findings",
        )}
        title="Human Checkpoint"
        onAction={handleAction}
      />
      {isFindingFormOpen && (
        <form
          className="finding-form"
          onSubmit={(event) => {
            event.preventDefault();
            const content = findingDraft.trim();
            if (!content || !onSubmitFinding) return;
            onSubmitFinding(item, content);
            setFindingDraft("");
            setIsFindingFormOpen(false);
          }}
        >
          <label>
            <span>Finding</span>
            <textarea
              autoFocus
              onChange={(event) => setFindingDraft(event.currentTarget.value)}
              placeholder="Describe the observed problem, expected outcome, and evidence."
              value={findingDraft}
            />
          </label>
          <div className="feature-workflow-actions">
            <button className="mini-button validation-action" disabled={!findingDraft.trim() || !onSubmitFinding} type="submit">Submit Finding</button>
            <button className="mini-button" onClick={() => setIsFindingFormOpen(false)} type="button">Cancel</button>
          </div>
        </form>
      )}

      {/* Completion readiness */}
      <CompletionReadinessPanel
        readiness={completionReadiness}
        isPending={controller.state.pendingActionId === "complete-feature"}
        onComplete={handleComplete}
      />
    </div>
  );
}
