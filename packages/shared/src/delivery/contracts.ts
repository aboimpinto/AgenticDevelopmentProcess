// FEAT-046: Delivery Policy & PR Creation types
// ---------------------------------------------------------------------------

/**
 * Delivery mode choice for a FEAT.
 */
export type FeatDeliveryMode = "direct_merge" | "pull_request";

/**
 * Role of an associated GitHub issue.
 */
export type FeatIssueRole = "feature_issue" | "tracking" | "epic";

/**
 * How the issue is updated during PR creation.
 */
export type FeatIssueUpdateMode = "pr_body" | "checklist" | "comment";

/**
 * Delivery status lifecycle for a FEAT.
 */
export type FeatDeliveryStatus =
  | "not_applicable"    // direct_merge
  | "blocked"           // prerequisites not met
  | "ready"             // eligible to prepare PR
  | "preparing"         // PR creation/update in flight
  | "open"              // PR exists and is open
  | "error";            // remote operation failed

/**
 * Parsed delivery configuration from FeatureDescription.md.
 */
export interface ParsedDeliveryConfig {
  readonly deliveryMode: FeatDeliveryMode;
  readonly targetBranch: string;
  readonly githubIssue: number | null;
  readonly issueRole: FeatIssueRole;
  readonly issueUpdateMode: FeatIssueUpdateMode;
  readonly pullRequest: number | null;
  readonly deliveryStatus: FeatDeliveryStatus;
}

/**
 * Persisted delivery metadata for a FEAT.
 */
export interface DeliveryMetadata {
  readonly projectId: string;
  readonly cardKey: string;
  readonly deliveryMode: FeatDeliveryMode;
  readonly targetBranch: string;
  readonly githubIssue: number | null;
  readonly issueRole: FeatIssueRole;
  readonly issueUpdateMode: FeatIssueUpdateMode;
  readonly pullRequest: number | null;
  readonly deliveryStatus: FeatDeliveryStatus;
  readonly deliveryError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Read model for the dashboard delivery panel.
 */
export interface DeliveryReadModel {
  readonly cardKey: string;
  readonly mode: FeatDeliveryMode;
  readonly targetBranch: string;
  readonly githubIssue: number | null;
  readonly issueRole: FeatIssueRole;
  readonly pullRequest: number | null;
  readonly status: FeatDeliveryStatus;
  readonly statusLabel: string;
  readonly statusExplanation: string;
  readonly canPrepare: boolean;
  readonly preparationDisabledReason: string | null;
  readonly deliveryError: string | null;
}
