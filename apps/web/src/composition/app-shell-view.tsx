import { useMemo } from "react";
import { buildEpicBoardModel, buildFeatureBoardModel } from "@hepha/shared";
import { ApprovalQueue } from "../approval-queue.js";
import { getCompletedFeatures, getWorkBoardItems } from "../boards/board-selectors.js";
import { CompletedFeaturesView } from "../boards/completed-features-view.js";
import { EpicBoard } from "../boards/epic-board.js";
import { FeatBoard } from "../boards/feat-board.js";
import { WorkBoard } from "../boards/work-board.js";
import { DeepDiveOverlay } from "../deep-dive/deep-dive-overlay.js";
import type { useDeepDiveController } from "../deep-dive/use-deep-dive-controller.js";
import { DetailBlade } from "../details/detail-blade-router.js";
import { GovernanceDashboard } from "../governance/GovernanceDashboard.js";
import type { useManualTestActions } from "../manual-tests/use-manual-test-actions.js";
import type { useMissingFeaturePreview } from "../missing-features/use-missing-feature-preview.js";
import { ProjectsView } from "../projects/projects-view.js";
import { ModelsDestination } from "../models/ModelsDestination.js";
import type { useFeatureEpicLink } from "../relationships/use-feature-epic-link.js";
import { SubmitEpicOverlay } from "../submissions/epic-submission-overlay.js";
import { SubmitFeatOverlay } from "../submissions/feature-submission-overlay.js";
import type { useEpicSubmission } from "../submissions/use-epic-submission.js";
import type { useFeatureSubmission } from "../submissions/use-feature-submission.js";
import type { useFeatureActions } from "../workflow/use-feature-actions.js";
import type { useDashboardLiveActivity } from "../workspace/use-dashboard-live-activity.js";
import type { useWorkspaceController } from "../workspace/use-workspace-controller.js";
import {
  ConnectionBanner,
  MemoryBankBanner,
  NoticeBanner,
  Sidebar,
  Topbar,
  type PrimaryView,
} from "./app-chrome.js";
import type { useAppNavigation } from "./use-app-navigation.js";

export interface AppShellViewProps {
  activeView: PrimaryView;
  deepDive: ReturnType<typeof useDeepDiveController>;
  epicSubmission: ReturnType<typeof useEpicSubmission>;
  featureActions: ReturnType<typeof useFeatureActions>;
  featureEpicLink: ReturnType<typeof useFeatureEpicLink>;
  featureSubmission: ReturnType<typeof useFeatureSubmission>;
  isAddingProject: boolean;
  isBladeOpen: boolean;
  isDetailExpanded: boolean;
  liveActivity: ReturnType<typeof useDashboardLiveActivity>;
  manualTests: ReturnType<typeof useManualTestActions>;
  missingFeatures: ReturnType<typeof useMissingFeaturePreview>;
  navigation: ReturnType<typeof useAppNavigation>;
  workspace: ReturnType<typeof useWorkspaceController>;
}

export function AppShellView(props: AppShellViewProps) {
  const { workspace, navigation } = props;
  const workBoardItems = useMemo(() => getWorkBoardItems(workspace.workItems), [workspace.workItems]);
  const epicBoardModel = useMemo(
    () => buildEpicBoardModel(workspace.workItems, workspace.sourceIssues, workspace.scanStatus),
    [workspace.scanStatus, workspace.sourceIssues, workspace.workItems],
  );
  const featBoardModel = useMemo(
    () => buildFeatureBoardModel(workspace.workItems, workspace.sourceIssues),
    [workspace.sourceIssues, workspace.workItems],
  );
  const completedFeatures = useMemo(
    () => getCompletedFeatures(workspace.workItems),
    [workspace.workItems],
  );
  const bladeMode = workspace.selectedItem
    ? "detail"
    : workspace.selectedSourceIssue ? "source-issue" : "project";
  const isDetailOverlayOpen = props.isBladeOpen && Boolean(workspace.selectedItem) && props.isDetailExpanded;
  const isLoading = workspace.isLoadingProjects || workspace.isLoadingItems;
  const refresh = () => {
    void workspace.refreshProjects();
    if (workspace.selectedProjectId) void workspace.refreshWorkItems(workspace.selectedProjectId);
  };
  const initializeSelectedProject = () => {
    if (workspace.selectedProject) void workspace.initializeMemoryBank(workspace.selectedProject.id);
  };

  return (
    <div className="app-shell">
      <Sidebar activeView={props.activeView} onSelectView={navigation.selectPrimaryView} />
      <div className="workspace">
        <Topbar
          hasError={Boolean(workspace.errorMessage)}
          onRefresh={refresh}
          projects={workspace.projects}
          scannedAt={workspace.scannedAt}
          selectedProjectId={workspace.selectedProjectId}
          onSelectProject={navigation.selectProject}
          liveActivityStatus={props.liveActivity.status}
          liveActivityAnnouncement={props.liveActivity.announcement}
        />
        <main className={props.isBladeOpen && !isDetailOverlayOpen ? "main-grid" : "main-grid main-grid-full"}>
          {props.activeView === "projects" ? (
            <ProjectsView
              isLoading={workspace.isLoadingProjects}
              onAddProject={navigation.openProjectBlade}
              onInitializeProject={(projectId) => void workspace.initializeMemoryBank(projectId)}
              onOpenBoard={navigation.openProjectBoard}
              onRefresh={refresh}
              onSelectProject={navigation.selectProject}
              pendingActionId={workspace.pendingActionId}
              projects={workspace.projects}
              projectWorkItems={workspace.workItems}
              selectedProjectId={workspace.selectedProjectId}
            />
          ) : props.activeView === "completed-features" ? (
            <CompletedFeaturesView
              completedFeatures={completedFeatures}
              isLoading={isLoading}
              onOpenWorkBoard={() => navigation.selectPrimaryView("work-board")}
              onSelectFeature={navigation.selectExpandedItem}
              selectedItemId={workspace.selectedItemId}
            />
          ) : props.activeView === "epic-board" ? (
            <div className="board-shell">
              <WorkspaceBanners
                errorMessage={workspace.errorMessage}
                initialize={initializeSelectedProject}
                noticeMessage={workspace.noticeMessage}
                pendingActionId={workspace.pendingActionId}
                project={workspace.selectedProject}
              />
              <EpicBoard
                boardModel={epicBoardModel}
                canAddEpic={Boolean(workspace.selectedProject && !workspace.selectedProject.needsInitialization)}
                isLoading={isLoading}
                onAddEpic={navigation.openSubmitEpicOverlay}
                onSelectItem={navigation.selectExpandedItem}
                onSelectSourceIssue={navigation.selectSourceIssue}
                selectedItemId={workspace.selectedItemId}
                selectedSourceIssueId={workspace.selectedSourceIssueId}
              />
            </div>
          ) : props.activeView === "feat-board" ? (
            <FeatBoard
              boardModel={featBoardModel}
              isLoading={isLoading}
              onAddFeat={navigation.openSubmitFeatOverlay}
              onSelectItem={navigation.selectItem}
              selectedItemId={workspace.selectedItemId}
            />
          ) : props.activeView === "models" ? (
            <ModelsDestination />
          ) : props.activeView === "governance" ? (
            <GovernanceDashboard projectId={workspace.selectedProjectId} />
          ) : props.activeView === "approvals" ? (
            <ApprovalQueue projectId={workspace.selectedProjectId} />
          ) : (
            <div className="board-shell">
              <WorkspaceBanners
                errorMessage={workspace.errorMessage}
                initialize={initializeSelectedProject}
                noticeMessage={workspace.noticeMessage}
                pendingActionId={workspace.pendingActionId}
                project={workspace.selectedProject}
              />
              <WorkBoard
                isLoading={isLoading}
                onOpenCompletedFeatures={navigation.openCompletedFeaturesView}
                onSelectItem={navigation.selectItem}
                selectedItemId={workspace.selectedItemId}
                shouldCenterSelectedItem={
                  props.isBladeOpen && !isDetailOverlayOpen && workspace.selectedItem?.kind === "feature"
                }
                totalItems={workBoardItems.length}
                workItems={workBoardItems}
              />
            </div>
          )}
          {props.isBladeOpen ? (
            <DetailBlade
              form={workspace.form}
              isAddingProject={props.isAddingProject}
              isCreating={workspace.pendingActionId === "create-project"}
              isDetailExpanded={props.isDetailExpanded}
              mode={bladeMode}
              onClose={navigation.closeDetailSurface}
              onCreateProject={(event) => void workspace.createProject(event)}
              onFormChange={workspace.setForm}
              documentDetail={workspace.documentDetail}
              documentDetailLoading={workspace.documentDetailLoading}
              onRefreshDocument={workspace.refreshDocument}
              onToggleDetailExpanded={navigation.toggleDetailExpanded}
              onCreateMissingFeatures={props.missingFeatures.preview}
              onCreateUiRequirements={props.featureActions.createUiRequirements}
              onEvaluateFeatureUiRequirement={props.featureActions.evaluateFeatureUiRequirement}
              onAcceptHumanReviewFindings={props.featureActions.acceptHumanReviewFindings}
              onCancelFeatureWorkflow={props.featureActions.cancelFeatureWorkflow}
              onCompleteEpic={props.featureActions.completeEpic}
              onCompleteFeature={props.featureActions.completeFeature}
              onContinueImplementing={props.featureActions.continueImplementing}
              onAddFeatureFindingDetail={props.featureActions.addFeatureFindingDetail}
              onRecordHumanReview={props.featureActions.recordHumanReview}
              onResolveFeatureFinding={props.featureActions.resolveFeatureFinding}
              onSelectItem={navigation.selectItem}
              onRefineFeature={props.featureActions.refineFeature}
              onStartImplementing={props.featureActions.startImplementing}
              onStartDeepDive={props.deepDive.start}
              onOpenDeepDiveRecovery={props.deepDive.openRecoverySession}
              onLinkFeatureToEpic={props.featureEpicLink.link}
              isLinkingEpic={props.featureEpicLink.isLinking}
              linkEpicResult={props.featureEpicLink.result}
              linkEpicError={props.featureEpicLink.error}
              onSubmitEpicRefinement={props.epicSubmission.refine}
              onSubmitFeatureFinding={props.featureActions.submitFeatureFinding}
              pendingDeepDiveAction={workspace.pendingDeepDiveAction}
              previewPlan={props.missingFeatures.plan}
              onApplyMissingFeatures={props.missingFeatures.apply}
              onCancelPreview={props.missingFeatures.cancel}
              isPreviewLoading={props.missingFeatures.isLoading}
              selectedItem={workspace.selectedItem}
              workItems={workspace.workItems}
              selectedProject={workspace.selectedProject}
              selectedSourceIssue={workspace.selectedSourceIssue}
              onGenerateManualTestPack={props.manualTests.generate}
              onReviewManualTestPack={props.manualTests.review}
              onRecordManualTestResult={props.manualTests.record}
              onFetchManualTestStatus={props.manualTests.status}
              onNotice={workspace.setNoticeMessage}
              onError={workspace.setErrorMessage}
              onWorkItemsUpdated={workspace.setWorkItems}
            />
          ) : null}
        </main>
      </div>
      {props.deepDive.isOpen && props.deepDive.session ? (
        <DeepDiveOverlay
          onAnswer={(questionId, optionId, answer) => void props.deepDive.answer(questionId, optionId, answer)}
          onChat={(questionId, message) => void props.deepDive.chat(questionId, message)}
          onClose={props.deepDive.close}
          onComplete={() => void props.deepDive.complete()}
          pendingAction={workspace.pendingDeepDiveAction}
          session={props.deepDive.session}
        />
      ) : null}
      {props.epicSubmission.isOpen && workspace.selectedProject ? (
        <SubmitEpicOverlay
          form={props.epicSubmission.form}
          isSubmitting={workspace.pendingActionId === "submit-epic"}
          onClose={props.epicSubmission.close}
          onFormChange={props.epicSubmission.setForm}
          onSubmit={(event) => void props.epicSubmission.submit(event)}
          project={workspace.selectedProject}
        />
      ) : null}
      {props.featureSubmission.isOpen && workspace.selectedProject ? (
        <SubmitFeatOverlay
          form={props.featureSubmission.form}
          isSubmitting={workspace.pendingActionId === "submit-feat"}
          onClose={props.featureSubmission.close}
          onFormChange={props.featureSubmission.setForm}
          onSubmit={(event) => void props.featureSubmission.submit(event)}
          project={workspace.selectedProject}
        />
      ) : null}
    </div>
  );
}

function WorkspaceBanners(props: {
  errorMessage: string | null;
  initialize(): void;
  noticeMessage: string | null;
  pendingActionId: string | null;
  project: ReturnType<typeof useWorkspaceController>["selectedProject"];
}) {
  return (
    <>
      {props.errorMessage ? <ConnectionBanner message={props.errorMessage} /> : null}
      {!props.errorMessage && props.noticeMessage ? <NoticeBanner message={props.noticeMessage} /> : null}
      {props.project?.needsInitialization ? (
        <MemoryBankBanner
          isPending={props.pendingActionId === `init-${props.project.id}`}
          onInitialize={props.initialize}
          project={props.project}
        />
      ) : null}
    </>
  );
}
