export type FeatureFindingStatus = "open" | "agent_running" | "agent_response" | "closed";
export type FeatureFindingEventRole = "user" | "agent" | "system";
export type FeatureFindingEventKind = "finding" | "follow_up" | "solution" | "status";

export interface FeatureFindingEventSummary {
  id: string;
  content: string;
  createdAt: string;
  kind: FeatureFindingEventKind;
  role: FeatureFindingEventRole;
}

export interface FeatureFindingSummary {
  id: string;
  closedAt: string | null;
  createdAt: string;
  currentStep: string | null;
  error: string | null;
  events: FeatureFindingEventSummary[];
  runId: string | null;
  status: FeatureFindingStatus;
  summary: string | null;
  title: string;
  updatedAt: string;
}
