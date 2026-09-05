import type { HandoffPlanV1, ProviderConnectionId, ProviderConnectionRecord } from "@hepha/shared";
import type { RuntimeExecutionResult } from "./runtime-execution-coordinator.js";

type FailedRuntimeExecution = Extract<RuntimeExecutionResult, { readonly ok: false }>;

/** Presents durable route-attempt facts without reducing them to sequence exhaustion. */
export function presentRuntimeRouteFailure(
  result: FailedRuntimeExecution,
  plan: HandoffPlanV1,
  getConnection: (connectionId: ProviderConnectionId) => ProviderConnectionRecord | null,
): string {
  const attempt = result.attemptResult?.attempt;
  const attemptIndex = attempt?.attemptIndex ?? 0;
  const step = plan.steps[attemptIndex] ?? plan.steps[0];
  const connection = step ? getConnection(step.route.connectionId) : null;
  const routeLabel = step
    ? `${connection?.label ?? step.route.connectionId} / ${step.route.modelId}`
    : "the selected route";
  const failureCode = attempt?.failureCode ?? "unknown_runtime_failure";
  const routeKind = attempt?.attemptKind ?? "primary";
  const exhausted = plan.steps.length === 1
    ? "No fallback route is configured."
    : "The configured route sequence was exhausted.";
  const actionLabel = plan.resolvedRoute.action.label;
  const recovery = failureCode === "provider_unsupported"
    ? `Recovery: configure a supported primary provider or add a fallback for ${actionLabel} in Projects > Agent Routing, then retry ${actionLabel}.`
    : `Recovery: inspect the failed route evidence, update ${actionLabel} routing if needed, then retry ${actionLabel}.`;

  return `${result.code}: ${actionLabel} could not start its ${routeKind} route ${routeLabel} because ${failureCode}. ${exhausted} ${recovery}`;
}
