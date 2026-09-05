import type {
  BatchPreviewPlan,
  CreateProjectInput,
  FeatureHumanReviewCheck,
  ManualTestVerificationStatusResponse,
  ProjectSummary,
  WorkItemCard,
  WorkItemDocumentDetail,
  WorkItemSourceIssue,
} from "@hepha/shared";
import type { BladeMode } from "../boards/board-types.js";

/**
 * Props contract for the DetailBlade router component.
 *
 * Defines the typed interface consumed by detail-blade routing, used inline
 * in app-shell.tsx until child blades are extracted in Phase 5.
 *
 * @see FEAT-055 Phase 3 planning-analysis-report.md for contract ownership.
 * @see FEAT-056 for workflow-policy callback ownership.
 */
export interface DetailBladeProps {
  form: CreateProjectInput;
  isAddingProject: boolean;
  isCreating: boolean;
  isDetailExpanded: boolean;
  mode: BladeMode;
  onClose: () => void;
  onAddFeatureFindingDetail: (item: WorkItemCard, findingId: string, content: string) => void;
  onAcceptHumanReviewFindings: (item: WorkItemCard) => void;
  onCancelFeatureWorkflow: (item: WorkItemCard) => void;
  onCompleteEpic: (item: WorkItemCard) => void;
  onCompleteFeature: (item: WorkItemCard) => void;
  onCreateMissingFeatures: (item: WorkItemCard) => void;
  onCreateUiRequirements: (item: WorkItemCard) => void;
  onEvaluateFeatureUiRequirement: (item: WorkItemCard) => void;
  onContinueImplementing: (item: WorkItemCard, autonomous: boolean) => void;
  onCreateProject: (event: React.FormEvent<HTMLFormElement>) => void;
  onFormChange: React.Dispatch<React.SetStateAction<CreateProjectInput>>;
  documentDetail: WorkItemDocumentDetail | null;
  documentDetailLoading: boolean;
  onRefreshDocument: () => void;
  onToggleDetailExpanded: () => void;
  onRecordHumanReview: (item: WorkItemCard, check: FeatureHumanReviewCheck) => void;
  onResolveFeatureFinding: (item: WorkItemCard, findingId: string) => void;
  onRefineFeature: (item: WorkItemCard) => void;
  onSelectItem: (itemId: string) => void;
  onStartImplementing: (item: WorkItemCard, autonomous: boolean) => void;
  onStartDeepDive: (item: WorkItemCard) => void;
  onOpenDeepDiveRecovery: (session: import("@hepha/shared").DeepDiveSession, item: WorkItemCard) => void;
  onLinkFeatureToEpic: (
    item: WorkItemCard,
    operation: "link" | "relink" | "unlink",
    targetEpicCardId?: string,
  ) => void;
  isLinkingEpic: boolean;
  linkEpicResult: string | null;
  linkEpicError: string | null;
  onSubmitEpicRefinement: (item: WorkItemCard, request: string) => void;
  onSubmitFeatureFinding: (item: WorkItemCard, content: string) => void;
  pendingDeepDiveAction: string | null;
  previewPlan: BatchPreviewPlan | null;
  onApplyMissingFeatures: (plan: BatchPreviewPlan) => void;
  onCancelPreview: () => void;
  isPreviewLoading: boolean;
  selectedItem: WorkItemCard | null;
  workItems: readonly WorkItemCard[];
  selectedProject: ProjectSummary | null;
  selectedSourceIssue: WorkItemSourceIssue | null;
  onGenerateManualTestPack: (item: WorkItemCard) => Promise<void>;
  onReviewManualTestPack: (item: WorkItemCard, packId: string) => Promise<void>;
  onRecordManualTestResult: (
    item: WorkItemCard,
    packId: string,
    reviewId: string,
    testId: string | undefined,
    result: "pass" | "fail",
    actualResult?: string,
    notes?: string,
  ) => Promise<void>;
  onFetchManualTestStatus: (item: WorkItemCard) => Promise<ManualTestVerificationStatusResponse | null>;
  /** @see FEAT-057 workflow integration */
  onNotice?: (message: string | null) => void;
  onError?: (message: string | null) => void;
  onWorkItemsUpdated?: (items: WorkItemCard[]) => void;
}
