import { describe, expect, it } from "vitest";
import {
  AGENT_ROUTING_SCHEMA_VERSION,
  isHandoffPlanV1,
  type HandoffPlanV1,
  type RouteIdentityV1,
} from "../src/index.js";

const primary: RouteIdentityV1 = { connectionId: "connection-primary" as RouteIdentityV1["connectionId"], modelId: "primary-model" };
const recovery: RouteIdentityV1 = { connectionId: "connection-recovery" as RouteIdentityV1["connectionId"], modelId: "recovery-model" };

function plan(policySource: "global" | "action_type" | "action", steps: HandoffPlanV1["steps"]): HandoffPlanV1 {
  return {
    schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
    resolvedRoute: {
      schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
      action: {
        schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
        actionId: "code-review",
        actionType: "review",
        actionTypeLabel: "Review",
        actionTypeDisplayOrder: 3,
        label: "Code Review",
        displayOrder: 1,
        roleId: "code-review-agent",
        promptVersion: "code-review/v1",
        capabilityRequirements: { minimumContextWindowTokens: 64_000, requiresTools: true, requiresApi: true, requiresReasoning: false },
      },
      route: primary,
      policySource,
      revisionId: "routing-revision-1",
    },
    steps,
  };
}

describe("isHandoffPlanV1", () => {
  it.each([
    ["a Global primary-only plan", plan("global", [{ kind: "primary", route: primary }])],
    ["an action-type primary-only plan", plan("action_type", [{ kind: "primary", route: primary }])],
    ["an action plan with one distinct recovery", plan("action", [{ kind: "primary", route: primary }, { kind: "recovery", route: recovery }])],
  ])("accepts %s", (_name, candidate) => {
    expect(isHandoffPlanV1(candidate)).toBe(true);
  });

  it.each([
    ["a primary route that differs from the resolved route", plan("action", [{ kind: "primary", route: recovery }])],
    ["a recovery route that repeats the primary route", plan("action", [{ kind: "primary", route: primary }, { kind: "recovery", route: primary }])],
    ["a Global plan with recovery", plan("global", [{ kind: "primary", route: primary }, { kind: "recovery", route: recovery }])],
    ["wrongly ordered steps", plan("action", [{ kind: "recovery", route: primary }])],
    ["an extra step", plan("action", [{ kind: "primary", route: primary }, { kind: "recovery", route: recovery }, { kind: "recovery", route: primary }])],
    ["a malformed step", { ...plan("action", [{ kind: "primary", route: primary }]), steps: [{ kind: "primary", route: { connectionId: "connection-primary", modelId: "" } }] }],
  ])("rejects %s without throwing", (_name, candidate) => {
    expect(() => isHandoffPlanV1(candidate)).not.toThrow();
    expect(isHandoffPlanV1(candidate)).toBe(false);
  });
});
