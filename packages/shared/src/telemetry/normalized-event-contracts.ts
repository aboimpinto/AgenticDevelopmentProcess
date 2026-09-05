export type NormalizedEventName =
  | "agent.started"
  | "agent.finished"
  | "agent.failed"
  | "agent.timeout";

export type RawEventRefSource =
  | "pi-jsonl"
  | "workflow-stream-log"
  | "orchestrator-launch"
  | "session-file";

export interface RawEventRef {
  readonly source: RawEventRefSource;
  readonly originalType: string;
  readonly logPath?: string;
  readonly lineNumber?: number;
  readonly rawPayload?: string;
  readonly sequenceId?: string;
  readonly sessionId?: string;
}

export interface NormalizedEvent {
  readonly type: NormalizedEventName;
  readonly timestamp: string;
  readonly workflowCommand?: string;
  readonly workflowNode?: string;
  readonly phase?: string;
  readonly agentRole?: string;
  readonly model?: string;
  readonly pid?: number | null;
  readonly logPath?: string;
  readonly receiptPath?: string;
  readonly rawRef?: RawEventRef;
  readonly metadata?: Record<string, unknown>;
  readonly extensionRef?: {
    readonly extensionId: string;
    readonly extensionVersion: string;
    readonly operation: string;
    readonly correlationId: string;
  };
  readonly errorMessage?: string;
  readonly exitCode?: number | null;
}

export interface PiJsonLineInput {
  readonly raw: Record<string, unknown>;
  readonly lineNumber?: number;
  readonly logPath?: string;
  readonly sessionId?: string;
}

export interface OrchestratorLifecycleInput {
  readonly event: NormalizedEventName;
  readonly timestamp?: string;
  readonly workflowCommand?: string;
  readonly workflowNode?: string;
  readonly phase?: string;
  readonly agentRole?: string;
  readonly model?: string;
  readonly pid?: number | null;
  readonly logPath?: string;
  readonly receiptPath?: string;
  readonly metadata?: Record<string, unknown>;
  readonly errorMessage?: string;
  readonly exitCode?: number | null;
  readonly rawRef?: Omit<RawEventRef, "source">;
}
