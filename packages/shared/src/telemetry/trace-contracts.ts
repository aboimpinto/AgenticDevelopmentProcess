export type TraceEntryKind =
  | "message"
  | "tool_call"
  | "command_result"
  | "error"
  | "summary"
  | "lifecycle"
  | "raw_detail"
  | "extension";

export type TraceEntrySource = "normalized_event" | "console_log" | "derived";

export type ArtifactLinkType =
  | "console_log"
  | "code_review"
  | "receipt"
  | "evidence"
  | "extension";

export interface ArtifactLink {
  readonly type: ArtifactLinkType;
  readonly label: string;
  readonly path: string;
  readonly available: boolean;
}

export interface TraceEntry {
  readonly kind: TraceEntryKind;
  readonly timestamp: string;
  readonly source: TraceEntrySource;
  readonly content: string;
  readonly detail: string | null;
  readonly agentRole: string | null;
  readonly model: string | null;
  readonly durationMs: number | null;
  readonly status: string | null;
  readonly artifactLinks: readonly ArtifactLink[];
}

export interface RunTraceSection {
  readonly type: "phase" | "invocation-group" | "console-group";
  readonly title: string;
  readonly phaseNumber: number | null;
  readonly entries: readonly TraceEntry[];
}

export interface RunTrace {
  readonly runId: string;
  readonly projectId: string;
  readonly cardKey: string;
  readonly command: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly status: "running" | "completed" | "failed" | "blocked" | "cancelled";
  readonly sections: readonly RunTraceSection[];
}

export interface PhaseInvocationEntry {
  readonly id: string;
  readonly agentRole: string | null;
  readonly agentName: string | null;
  readonly model: string | null;
  readonly status: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly durationMs: number | null;
  readonly artifactLinks: readonly ArtifactLink[];
}

export interface PhaseInvocationSummary {
  readonly phaseNumber: number;
  readonly phaseTitle: string;
  readonly hasInvocations: boolean;
  readonly latestModel: string | null;
  readonly provider: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly durationMs: number | null;
  readonly status: string | null;
  readonly invocationCount: number;
  readonly invocations: readonly PhaseInvocationEntry[];
}
