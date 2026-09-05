import type { ArtifactLink } from "./trace-contracts.js";

export interface ReceiptSearchFilter {
  readonly projectId: string;
  readonly artifact?: string;
  readonly command?: string;
  readonly model?: string;
  readonly knowledgeRule?: string;
  readonly extensionId?: string;
  readonly extensionOperation?: string;
}

export interface ReceiptSearchResultEntry {
  readonly receiptId: string;
  readonly runId: string;
  readonly cardKey: string;
  readonly command: string;
  readonly stage: string;
  readonly timestamp: string;
  readonly status: string;
  readonly model: string | null;
  readonly provider: string | null;
  readonly phaseNumber: number | null;
  readonly phaseTitle: string | null;
  readonly workflowNodeId: string | null;
  readonly agentRole: string | null;
  readonly artifactLinks: readonly ArtifactLink[];
}

export interface ReceiptSearchResponse {
  readonly projectId: string;
  readonly results: readonly ReceiptSearchResultEntry[];
  readonly totalCount: number;
}

export interface ReceiptInvocationEntry {
  readonly id: string;
  readonly agentRole: string | null;
  readonly agentName: string | null;
  readonly command: string | null;
  readonly workflowNodeId: string | null;
  readonly model: string | null;
  readonly provider: string | null;
  readonly status: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly durationMs: number | null;
  readonly parentInvocationId: string | null;
  readonly reviewReportPath: string | null;
  readonly logPath: string | null;
  readonly artifactLinks: readonly ArtifactLink[];
}

export interface ReceiptDetailResponse {
  readonly runId: string;
  readonly projectId: string;
  readonly cardKey: string;
  readonly command: string;
  readonly stage: string;
  readonly timestamp: string;
  readonly status: string;
  readonly nextState: string;
  readonly contextLinks: readonly ArtifactLink[];
  readonly invocations: readonly ReceiptInvocationEntry[];
  readonly knowledgeRules: readonly string[];
}
