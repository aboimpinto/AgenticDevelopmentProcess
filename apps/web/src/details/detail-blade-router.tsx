import { RelationPanel } from "./relation-panel.js";
import type { DetailBladeProps } from "./detail-blade.js";
import { WorkItemDetailBlade } from "./work-item-detail-blade.js";
import { ProjectBlade } from "./project-blade.js";
import { SourceIssueDetailBlade } from "./source-issue-detail-blade.js";
import { WorkflowInteractionPanel } from "../workflow/workflow-interaction-panel.js";
import { ManualTestVerificationPanel } from "../manual-tests/manual-test-verification-panel.js";
import { FeatureDeliveryPanel } from "./feature-delivery-panel.js";
import { EpicRefinementPanel } from "./epic-refinement-panel.js";
import { LinkEpicPanel } from "./link-epic-panel.js";
import { DesignArtifactsPanel } from "./design-artifacts-panel.js";

export function DetailBlade(props: DetailBladeProps) {
  const {
    form,
    isAddingProject,
    isCreating,
    isDetailExpanded,
    mode,
    onClose,
    onAddFeatureFindingDetail,
    onAcceptHumanReviewFindings,
    onCancelFeatureWorkflow,
    onCompleteEpic,
    onCompleteFeature,
    onCreateMissingFeatures,
    onCreateUiRequirements,
    onEvaluateFeatureUiRequirement,
    onContinueImplementing,
    onCreateProject,
    onFormChange,
    documentDetail,
    documentDetailLoading,
    onRefreshDocument,
    onToggleDetailExpanded,
    onRecordHumanReview,
    onResolveFeatureFinding,
    onRefineFeature,
    onSelectItem,
    onStartImplementing,
    onStartDeepDive,
    onOpenDeepDiveRecovery,
    onLinkFeatureToEpic,
    isLinkingEpic,
    linkEpicResult,
    linkEpicError,
    onSubmitEpicRefinement,
    onSubmitFeatureFinding,
    pendingDeepDiveAction,
    previewPlan,
    onApplyMissingFeatures,
    onCancelPreview,
    isPreviewLoading,
    selectedItem,
    workItems,
    selectedProject,
    selectedSourceIssue,
    onGenerateManualTestPack,
    onReviewManualTestPack,
    onRecordManualTestResult,
    onFetchManualTestStatus,
  } = props;
  if (mode === "detail" && selectedItem) {
    const visibleRelations = selectedItem.kind === "epic" ? selectedItem.linkedFeatures : selectedItem.linkedEpics;
    const relationTitle = selectedItem.kind === "epic" ? "Linked FEATs" : "Linked EPICs";
    const linkedFeatureExternalIds = new Set([
      ...selectedItem.linkedFeatureIds,
      ...selectedItem.linkedFeatures.map((feature) => feature.externalId),
    ]);
    const relatedFeatures = selectedItem.kind === "epic"
      ? workItems.filter((candidate) =>
          candidate.kind === "feature" && linkedFeatureExternalIds.has(candidate.externalId),
        )
      : [];
    const latestRefinementId =
      selectedItem.epicRefinements[selectedItem.epicRefinements.length - 1]?.id ?? "no-refinement";
    const detailRefreshKey = [
      selectedItem.id,
      selectedItem.documentUpdatedAt ?? "no-document-update",
      latestRefinementId,
    ].join(":");

    const panelContents = (
      <>
        <WorkflowInteractionPanel
          item={selectedItem}
          relatedFeatures={relatedFeatures}
          projectId={selectedProject?.id ?? ""}
          onNotice={props.onNotice}
          onError={props.onError}
          onStartDeepDive={onStartDeepDive}
          onDeepDiveRecoverySession={onOpenDeepDiveRecovery}
          isDeepDivePending={pendingDeepDiveAction === `start-${selectedItem.id}`}
          previewPlan={previewPlan}
          isFeaturePreviewLoading={isPreviewLoading}
          isApplyingFeaturePreview={pendingDeepDiveAction === `missing-features-${selectedItem.id}`}
          onPreviewFeatures={onCreateMissingFeatures}
          onApplyFeaturePreview={onApplyMissingFeatures}
          onCancelFeaturePreview={onCancelPreview}
          onSubmitFinding={onSubmitFeatureFinding}
          onItemsUpdated={props.onWorkItemsUpdated}
        />

        {selectedItem.kind === "feature" && selectedProject ? (
          <FeatureDeliveryPanel item={selectedItem} projectId={selectedProject.id} />
        ) : null}

        {selectedItem.kind === "feature" && selectedItem.featureWorkflow?.implementationCompleted ? (
          <section className="validation-panel" aria-label="Manual test verification">
            <div className="validation-heading"><strong>Manual Tests</strong></div>
            <ManualTestVerificationPanel
              item={selectedItem}
              workflow={selectedItem.featureWorkflow}
              isPending={pendingDeepDiveAction?.startsWith(`manual-test-`) ?? false}
              isDisabled={Boolean(selectedItem.featureWorkflow.activeRun)}
              onGenerate={onGenerateManualTestPack}
              onReview={onReviewManualTestPack}
              onRecordResult={onRecordManualTestResult}
              onFetchStatus={onFetchManualTestStatus}
              getArtifactUrl={(item, format, download = false) =>
                `/api/manual-test-verification/artifact?projectId=${encodeURIComponent(selectedProject?.id ?? "")}&cardId=${encodeURIComponent(item.id)}&format=${format}${download ? "&download=1" : ""}`
              }
            />
          </section>
        ) : null}

        <RelationPanel
          emptyLabel={selectedItem.kind === "epic" ? "No linked FEATs detected." : "No linked EPICs detected."}
          onSelectItem={onSelectItem}
          relations={visibleRelations}
          title={relationTitle}
        />

        {selectedItem.kind === "feature" ? (
          <LinkEpicPanel
            item={selectedItem}
            isLinkingEpic={isLinkingEpic}
            linkEpicResult={linkEpicResult}
            linkEpicError={linkEpicError}
            onLinkFeatureToEpic={onLinkFeatureToEpic}
          />
        ) : null}

        {selectedItem.kind === "feature" && selectedProject && selectedItem.featureWorkflow?.hasDesignArtifacts ? (
          <DesignArtifactsPanel cardId={selectedItem.id} projectId={selectedProject.id} />
        ) : null}

        {selectedItem.kind === "epic" && selectedItem.epicState !== "completed" && selectedItem.linkedFeatures.length > 0 && selectedItem.linkedFeatures.every((feature) => feature.stateFolder === "04_COMPLETED") ? (
          <section className="validation-panel" aria-label="EPIC completion">
            <div className="validation-heading"><strong>EPIC completion</strong></div>
            <p className="validation-message">All linked FEATs are completed. Record the EPIC completion explicitly.</p>
            <button className="workflow-action-button" onClick={() => onCompleteEpic(selectedItem)} type="button">
              Complete EPIC
            </button>
          </section>
        ) : null}

        {selectedItem.kind === "epic" ? (
          <EpicRefinementPanel
            item={selectedItem}
            onSubmit={onSubmitEpicRefinement}
            pendingAction={pendingDeepDiveAction}
          />
        ) : null}
      </>
    );

    return (
      <WorkItemDetailBlade
        key={detailRefreshKey}
        documentDetail={documentDetail}
        documentDetailLoading={documentDetailLoading}
        item={selectedItem}
        isExpanded={isDetailExpanded}
        onClose={onClose}
        onToggleExpanded={onToggleDetailExpanded}
        onRefreshDocument={onRefreshDocument}
        onSelectItem={onSelectItem}
        project={selectedProject}
        panelContents={panelContents}
      />
    );
  }

  if (mode === "source-issue" && selectedSourceIssue) {
    return <SourceIssueDetailBlade issue={selectedSourceIssue} onClose={onClose} project={selectedProject} />;
  }

  return (
    <ProjectBlade
      form={form}
      isAddingProject={isAddingProject}
      isCreating={isCreating}
      onClose={onClose}
      onCreateProject={onCreateProject}
      onFormChange={onFormChange}
      selectedProject={selectedProject}
    />
  );
}
