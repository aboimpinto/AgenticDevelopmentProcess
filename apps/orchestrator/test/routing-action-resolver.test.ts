import { describe, expect, it, vi } from "vitest";
import type { RoutingResolutionResult } from "../src/agent-routing/routing-resolver.js";
import { RoutingActionResolver } from "../src/agent-routing/routing-action-resolver.js";

const route = { connectionId: "pi-openai", modelId: "gpt-5.6-sol" } as const;
const plan = {
  schemaVersion: "agent-routing/v1",
  resolvedRoute: {
    schemaVersion: "agent-routing/v1",
    action: {
      schemaVersion: "agent-routing/v1",
      actionId: "continue-implementing",
      actionType: "implementation",
      actionTypeLabel: "Implementation",
      actionTypeDisplayOrder: 2,
      label: "Continue Implementing",
      displayOrder: 2,
      roleId: "implementation-agent",
      promptVersion: "continue-implementing/v1",
      capabilityRequirements: {
        minimumContextWindowTokens: 32_000,
        requiresTools: true,
        requiresApi: true,
        requiresReasoning: false,
      },
    },
    route,
    policySource: "global",
    revisionId: "routing-revision-1",
  },
  steps: [{ kind: "primary", route }],
} as const;

describe("RoutingActionResolver", () => {
  it("supplies the installation route only after the policy reports bootstrap required", () => {
    const resolve = vi.fn()
      .mockReturnValueOnce(rejection("ROUTING_BOOTSTRAP_REQUIRED"))
      .mockReturnValueOnce({ ok: true, plan } satisfies RoutingResolutionResult);
    const resolver = new RoutingActionResolver({ resolve }, {
      route,
      now: () => "2026-07-23T08:00:00.000Z",
      createCorrelationId: () => "bootstrap-correlation",
    });

    expect(resolver.resolvePlan("continue-implementing")).toBe(plan);
    expect(resolve.mock.calls).toEqual([
      [{ actionId: "continue-implementing", bootstrap: null }],
      [{
        actionId: "continue-implementing",
        bootstrap: {
          route,
          occurredAt: "2026-07-23T08:00:00.000Z",
          actor: "pi-installation-default",
          correlationId: "bootstrap-correlation",
        },
      }],
    ]);
  });

  it("does not replace invalid or unavailable persisted policy with an installation default", () => {
    const resolve = vi.fn(() => rejection("ROUTING_GLOBAL_UNAVAILABLE"));
    const resolver = new RoutingActionResolver({ resolve }, {
      route,
      now: () => "2026-07-23T08:00:00.000Z",
      createCorrelationId: () => "not-used",
    });

    expect(() => resolver.resolvePlan("continue-implementing")).toThrow("ROUTING_GLOBAL_UNAVAILABLE");
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("keeps display projection non-mutating when Global is unset", () => {
    const resolve = vi.fn(() => rejection("ROUTING_BOOTSTRAP_REQUIRED"));
    const resolver = new RoutingActionResolver({ resolve }, {
      route,
      now: () => "2026-07-23T08:00:00.000Z",
      createCorrelationId: () => "not-used",
    });

    expect(resolver.getStartImplementationDefaultForDisplay()).toBeNull();
    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledWith({ actionId: "start-feature", bootstrap: null });
  });

  it("maps each public worker intent to its stable registered action", () => {
    const resolve = vi.fn(() => ({ ok: true, plan }) satisfies RoutingResolutionResult);
    const resolver = new RoutingActionResolver({ resolve });

    expect([
      resolver.resolvePlan("submit-feature"),
      resolver.resolvePlan("ui-requirement-evaluation"),
      resolver.resolvePlan("submit-epic"),
      resolver.resolvePlan("code-review"),
      resolver.resolvePlan("start-feature"),
      resolver.resolvePlan("continue-implementing"),
    ].map((resolved) => resolved.resolvedRoute.route.modelId)).toEqual(Array(6).fill(route.modelId));
    expect(resolve.mock.calls.map(([input]) => input.actionId)).toEqual([
      "submit-feature",
      "ui-requirement-evaluation",
      "submit-epic",
      "code-review",
      "start-feature",
      "continue-implementing",
    ]);
  });
});

function rejection(code: "ROUTING_BOOTSTRAP_REQUIRED" | "ROUTING_GLOBAL_UNAVAILABLE"): RoutingResolutionResult {
  return { ok: false, code, message: code };
}
