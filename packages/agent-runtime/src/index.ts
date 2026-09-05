import type { AgentEvent } from "@hepha/shared";

export interface AgentRuntimeEventEnvelope {
  eventId: string;
  agentSessionId: string;
  seq: number;
  ts: string;
  cardId: string;
  jobId: string;
  runId: string;
  event: AgentEvent;
}

export function createRuntimeEvent(
  input: Omit<AgentRuntimeEventEnvelope, "ts">,
): AgentRuntimeEventEnvelope {
  return {
    ...input,
    ts: new Date().toISOString(),
  };
}
