import type { AgentActionId, HandoffPlanV1, RouteIdentityV1 } from "@hepha/shared";
import { RoutingPolicyService } from "./routing-policy-service.js";

/**
 * Resolves one explicit registered action through the persisted routing-policy plan.
 *
 * This is deliberately a non-executing adapter: it never reads environment
 * defaults, workflow model fields, aliases, or static model configuration.
 * FEAT-062 is responsible for consuming the returned plan at the Pi boundary.
 */
export class RoutingActionResolver {
  constructor(
    private readonly policy: Pick<RoutingPolicyService, "resolve">,
    private readonly bootstrap: {
      readonly route: RouteIdentityV1;
      readonly now: () => string;
      readonly createCorrelationId: () => string;
    } | null = null,
  ) {}

  resolvePlan(actionId: AgentActionId): HandoffPlanV1 {
    let result = this.policy.resolve({ actionId, bootstrap: null });
    if (!result.ok && result.code === "ROUTING_BOOTSTRAP_REQUIRED" && this.bootstrap) {
      result = this.policy.resolve({
        actionId,
        bootstrap: {
          route: this.bootstrap.route,
          occurredAt: this.bootstrap.now(),
          actor: "pi-installation-default",
          correlationId: this.bootstrap.createCorrelationId(),
        },
      });
    }
    if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
    return result.plan;
  }

  formatLabel(value: HandoffPlanV1 | string | null): string {
    return typeof value === "string" ? value : value?.resolvedRoute.route.modelId ?? "Not configured";
  }

  /** Safe read-model projection: an unset policy is not a route and must not break work-item listing. */
  getStartImplementationDefaultForDisplay(): string | null {
    const result = this.policy.resolve({ actionId: "start-feature", bootstrap: null });
    return result.ok ? result.plan.resolvedRoute.route.modelId : null;
  }

}
