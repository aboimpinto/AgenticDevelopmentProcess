import { useEffect, useState } from "react";
import { AppShellView } from "./composition/app-shell-view.js";
import { type PrimaryView } from "./composition/app-chrome.js";
import { useAppNavigation } from "./composition/use-app-navigation.js";
import { useDeepDiveController } from "./deep-dive/use-deep-dive-controller.js";
import { useManualTestActions } from "./manual-tests/use-manual-test-actions.js";
import { useMissingFeaturePreview } from "./missing-features/use-missing-feature-preview.js";
import { useFeatureEpicLink } from "./relationships/use-feature-epic-link.js";
import { useEpicSubmission } from "./submissions/use-epic-submission.js";
import { useFeatureSubmission } from "./submissions/use-feature-submission.js";
import { useFeatureActions } from "./workflow/use-feature-actions.js";
import { useDashboardLiveActivity } from "./workspace/use-dashboard-live-activity.js";
import { useWorkspaceController } from "./workspace/use-workspace-controller.js";
import "./styles.css";

export default function AppShell() {
  const [activeView, setActiveView] = useState<PrimaryView>("work-board");
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [isBladeOpen, setIsBladeOpen] = useState(false);
  const [isDetailExpanded, setIsDetailExpanded] = useState(false);
  const [uiDecisionAttemptedIds, setUiDecisionAttemptedIds] = useState<Set<string>>(() => new Set());
  const workspace = useWorkspaceController({
    onProjectAvailability: (hasProjects) => {
      setIsBladeOpen((current) => current || !hasProjects);
      setIsAddingProject((current) => !hasProjects || current);
      setActiveView((current) => hasProjects ? current : "projects");
    },
    onProjectCreated: () => {
      setIsAddingProject(false);
      setIsBladeOpen(false);
    },
  });
  const liveActivity = useDashboardLiveActivity({
    projectId: workspace.selectedProject && !workspace.selectedProject.needsInitialization
      ? workspace.selectedProjectId
      : null,
    selectedItemId: workspace.selectedItemId,
    refreshWorkItems: workspace.refreshWorkItems,
    onDocumentChanged: workspace.refreshDocument,
    onError: workspace.setErrorMessage,
  });
  const featureActions = useFeatureActions({
    projectId: workspace.selectedProject?.id ?? null,
    onError: workspace.setErrorMessage,
    onItems: workspace.setWorkItems,
    onNotice: workspace.setNoticeMessage,
    onPendingAction: workspace.setPendingDeepDiveAction,
    onProject: workspace.upsertProject,
    onSelectItem: workspace.setSelectedItemId,
  });
  const manualTests = useManualTestActions({
    projectId: workspace.selectedProject?.id ?? null,
    onError: workspace.setErrorMessage,
    onNotice: workspace.setNoticeMessage,
    onPendingAction: workspace.setPendingDeepDiveAction,
    refreshWorkItems: workspace.refreshWorkItems,
  });
  const missingFeatures = useMissingFeaturePreview({
    projectId: workspace.selectedProject?.id ?? null,
    onError: workspace.setErrorMessage,
    onItems: workspace.setWorkItems,
    onNotice: workspace.setNoticeMessage,
    onPendingAction: workspace.setPendingDeepDiveAction,
    onProject: workspace.upsertProject,
  });
  const featureEpicLink = useFeatureEpicLink({
    projectId: workspace.selectedProject?.id ?? null,
    onItems: workspace.setWorkItems,
    onNotice: workspace.setNoticeMessage,
  });
  const epicSubmission = useEpicSubmission({
    projectId: workspace.selectedProject?.id ?? null,
    onError: workspace.setErrorMessage,
    onItems: workspace.setWorkItems,
    onNotice: workspace.setNoticeMessage,
    onProject: workspace.upsertProject,
    onRefinementPending: workspace.setPendingDeepDiveAction,
    onSelectItem: workspace.setSelectedItemId,
    onShowDetail: () => {
      setIsDetailExpanded(true);
      setIsBladeOpen(true);
    },
    onSubmissionPending: workspace.setPendingActionId,
  });
  const featureSubmission = useFeatureSubmission({
    projectId: workspace.selectedProject?.id ?? null,
    onError: workspace.setErrorMessage,
    onItems: workspace.setWorkItems,
    onNotice: workspace.setNoticeMessage,
    onPendingAction: workspace.setPendingActionId,
    onProject: workspace.upsertProject,
    onSelectItem: workspace.setSelectedItemId,
    onShowDetail: () => {
      setIsDetailExpanded(true);
      setIsBladeOpen(true);
    },
  });
  const deepDive = useDeepDiveController({
    projectId: workspace.selectedProject?.id ?? null,
    refreshWorkItems: workspace.refreshWorkItems,
    onError: workspace.setErrorMessage,
    onPendingAction: workspace.setPendingDeepDiveAction,
    onResume: (item) => void featureActions.continueImplementing(item, true),
  });
  const navigation = useAppNavigation({
    closeEpicSubmission: epicSubmission.close,
    isBladeOpen,
    isDeepDiveOpen: deepDive.isOpen,
    onProjectChanged: () => setUiDecisionAttemptedIds(new Set()),
    openEpicSubmission: epicSubmission.open,
    openFeatureSubmission: featureSubmission.open,
    refreshDocument: workspace.refreshDocument,
    resetDeepDive: deepDive.reset,
    setActiveView,
    setDocumentDetail: workspace.setDocumentDetail,
    setDocumentDetailLoading: workspace.setDocumentDetailLoading,
    setIsAddingProject,
    setIsBladeOpen,
    setIsDetailExpanded,
    setNoticeMessage: workspace.setNoticeMessage,
    setSelectedItemId: workspace.setSelectedItemId,
    setSelectedProjectId: workspace.setSelectedProjectId,
    setSelectedSourceIssueId: workspace.setSelectedSourceIssueId,
  });

  useEffect(() => {
    const item = workspace.selectedItem;
    if (
      !workspace.selectedProject || !item || item.kind !== "feature" ||
      item.validation.needsValidationCount > 0 ||
      item.featureWorkflow?.uiRequirementDecision !== "unknown" || workspace.pendingDeepDiveAction ||
      uiDecisionAttemptedIds.has(item.id)
    ) return;
    setUiDecisionAttemptedIds((current) => new Set(current).add(item.id));
    void featureActions.evaluateFeatureUiRequirement(item);
  }, [workspace.pendingDeepDiveAction, workspace.selectedItem, workspace.selectedProject, uiDecisionAttemptedIds]);

  return (
    <AppShellView
      activeView={activeView}
      deepDive={deepDive}
      epicSubmission={epicSubmission}
      featureActions={featureActions}
      featureEpicLink={featureEpicLink}
      featureSubmission={featureSubmission}
      isAddingProject={isAddingProject}
      isBladeOpen={isBladeOpen}
      isDetailExpanded={isDetailExpanded}
      liveActivity={liveActivity}
      manualTests={manualTests}
      missingFeatures={missingFeatures}
      navigation={navigation}
      workspace={workspace}
    />
  );
}
