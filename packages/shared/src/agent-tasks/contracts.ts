export * from "./dispatch-contracts.js";

export type FeatureColumnId = "submitted" | "execute" | "done";
export type AgentRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type FeatureState =
  | "Submitted"
  | "Clarify"
  | "Waiting For User"
  | "Spec Review"
  | "Design"
  | "Refine"
  | "Ready To Implement"
  | "Execute"
  | "Implementing"
  | "Verification"
  | "Done"
  | "Cancelled";

export interface FeatureCard {
  id: string;
  title: string;
  state: FeatureState;
  agent: string;
  latestActivity: string;
  eventCount: number;
  age: string;
  priority?: "Urgent" | "High" | "Normal";
  progress?: number;
  selected?: boolean;
}

export interface AgentTask extends FeatureCard {
  columnId: FeatureColumnId;
  createdAt: number;
  duration?: string;
  model: string;
  output?: string;
  prompt: string;
  runId: string;
  status: AgentRunStatus;
  tokens?: string;
  events: AgentEvent[];
}

export interface AgentEvent {
  id: string;
  type: string;
  title: string;
  detail: string;
  time: string;
  tone: "live" | "action" | "neutral";
}

export interface RunSummary {
  model: string;
  duration: string;
  tokens: string;
  result: "Success" | "Warning" | "Failed" | "Blocked";
}

export interface CreateAgentTaskInput {
  /** Exact top-level orchestrated action authority. */
  agent_action: import("../agent-routing.js").AgentActionId;
  agent?: string;
  prompt: string;
  title?: string;
}

export interface TaskListResponse {
  tasks: AgentTask[];
}

export interface TaskResponse {
  task: AgentTask;
}
