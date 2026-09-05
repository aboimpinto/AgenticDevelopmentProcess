import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import type { WorkItemDocumentDetail } from "@hepha/shared";
import type { PrimaryView } from "./app-chrome.js";

export interface AppNavigationOptions {
  closeEpicSubmission(): void;
  isBladeOpen: boolean;
  isDeepDiveOpen: boolean;
  onProjectChanged(): void;
  openEpicSubmission(): void;
  openFeatureSubmission(): void;
  refreshDocument(): void;
  resetDeepDive(): void;
  setActiveView: Dispatch<SetStateAction<PrimaryView>>;
  setDocumentDetail: Dispatch<SetStateAction<WorkItemDocumentDetail | null>>;
  setDocumentDetailLoading: Dispatch<SetStateAction<boolean>>;
  setIsAddingProject: Dispatch<SetStateAction<boolean>>;
  setIsBladeOpen: Dispatch<SetStateAction<boolean>>;
  setIsDetailExpanded: Dispatch<SetStateAction<boolean>>;
  setNoticeMessage: Dispatch<SetStateAction<string | null>>;
  setSelectedItemId: Dispatch<SetStateAction<string | null>>;
  setSelectedProjectId: Dispatch<SetStateAction<string | null>>;
  setSelectedSourceIssueId: Dispatch<SetStateAction<string | null>>;
}

export function useAppNavigation(options: AppNavigationOptions) {
  const closeDetailSurface = useCallback(() => {
    options.setIsBladeOpen(false);
    options.setIsDetailExpanded(false);
  }, [options.setIsBladeOpen, options.setIsDetailExpanded]);

  useEffect(() => {
    function handleEscapeKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || !options.isBladeOpen || options.isDeepDiveOpen) return;
      event.preventDefault();
      closeDetailSurface();
    }
    window.addEventListener("keydown", handleEscapeKey);
    return () => window.removeEventListener("keydown", handleEscapeKey);
  }, [closeDetailSurface, options.isBladeOpen, options.isDeepDiveOpen]);

  function openProjectBlade() {
    options.setSelectedItemId(null);
    options.setSelectedSourceIssueId(null);
    options.setIsAddingProject(true);
    options.setIsDetailExpanded(false);
    options.setIsBladeOpen(true);
  }

  function selectItem(itemId: string, expanded = false) {
    options.setDocumentDetail(null);
    options.setDocumentDetailLoading(true);
    options.refreshDocument();
    options.setSelectedItemId(itemId);
    options.setSelectedSourceIssueId(null);
    options.setIsAddingProject(false);
    options.setIsDetailExpanded(expanded);
    options.setIsBladeOpen(true);
  }

  function selectSourceIssue(issueId: string) {
    options.setSelectedSourceIssueId(issueId);
    options.setSelectedItemId(null);
    options.setIsAddingProject(false);
    options.setIsDetailExpanded(true);
    options.setIsBladeOpen(true);
  }

  function selectProject(projectId: string) {
    options.setSelectedProjectId(projectId);
    options.setSelectedItemId(null);
    options.setSelectedSourceIssueId(null);
    options.setIsDetailExpanded(false);
    options.resetDeepDive();
    options.closeEpicSubmission();
    options.setNoticeMessage(null);
    options.onProjectChanged();
  }

  function selectPrimaryView(view: PrimaryView) {
    options.setActiveView(view);
    options.setSelectedItemId(null);
    options.setSelectedSourceIssueId(null);
    options.setIsAddingProject(false);
    options.setIsDetailExpanded(false);
    options.closeEpicSubmission();
    options.setIsBladeOpen(false);
  }

  function openSubmission(open: () => void) {
    options.setSelectedItemId(null);
    options.setIsAddingProject(false);
    options.setIsDetailExpanded(false);
    options.setIsBladeOpen(false);
    open();
  }

  return {
    closeDetailSurface,
    openCompletedFeaturesView: () => selectPrimaryView("completed-features"),
    openProjectBlade,
    openProjectBoard: (projectId: string) => {
      selectProject(projectId);
      options.setActiveView("work-board");
    },
    openSubmitEpicOverlay: () => openSubmission(options.openEpicSubmission),
    openSubmitFeatOverlay: () => openSubmission(options.openFeatureSubmission),
    selectExpandedItem: (itemId: string) => selectItem(itemId, true),
    selectItem,
    selectPrimaryView,
    selectProject,
    selectSourceIssue,
    toggleDetailExpanded: () => options.setIsDetailExpanded((current) => !current),
  };
}
