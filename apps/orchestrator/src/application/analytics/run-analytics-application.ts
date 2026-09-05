import type {
  InvocationFilter,
  MetricsGroupDimension,
  RunMetricsResponse,
  StoredAgentInvocation,
} from "@hepha/shared";
import { buildRunMetrics } from "../../run-metrics-helpers.js";

export interface RunAnalyticsInput {
  readonly cardKey?: string;
  readonly groupBy?: readonly MetricsGroupDimension[];
  readonly projectId: string;
  readonly startedAfter?: string;
  readonly startedBefore?: string;
}

export interface RunAnalyticsDependencies {
  queryInvocations(filters: InvocationFilter): Promise<StoredAgentInvocation[]>;
}

export async function readRunAnalytics(
  input: RunAnalyticsInput,
  dependencies: RunAnalyticsDependencies,
): Promise<RunMetricsResponse> {
  const invocations = await dependencies.queryInvocations({
    cardKey: input.cardKey,
    projectId: input.projectId,
    startedAfter: input.startedAfter,
    startedBefore: input.startedBefore,
  });
  return buildRunMetrics(
    input.projectId,
    invocations,
    input.groupBy?.length ? input.groupBy : undefined,
    input.cardKey,
  );
}
