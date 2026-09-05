import { describe, expect, it } from "vitest";
import {
  failurePolicyLabel,
  policySourceLabel,
  routeIdentityKey,
  routeLabel,
  routingMatrixErrorMessage,
} from "./routing-matrix-presentation.js";
import { fallbackRoute } from "./test-support/routing-matrix-fixture.js";

describe("routing matrix presentation", () => {
  it("uses friendly route text while preserving an unambiguous immutable value", () => {
    expect(routeLabel(fallbackRoute)).toBe("OpenAI Work · fallback-model");
    expect(routeIdentityKey(fallbackRoute.route)).toBe("connection-fallback\u0000fallback-model");
  });

  it("labels every server-owned policy source without exposing enum syntax", () => {
    expect([policySourceLabel("global"), policySourceLabel("action_type"), policySourceLabel("action")]).toEqual(["Global", "Action type", "Action"]);
  });

  it("labels all failure-policy modes without using an identity as primary copy", () => {
    expect(failurePolicyLabel({ kind: "fail_immediately" })).toBe("Fail immediately");
    expect(failurePolicyLabel({ kind: "reroute_global_once" })).toBe("Reroute once to Global Default");
    expect(failurePolicyLabel({ kind: "reroute_route_once", fallbackRoute: fallbackRoute.route })).toBe("Reroute once to a selected route");
  });

  it("maps known codes and unknown failures to fixed safe copy", () => {
    expect(routingMatrixErrorMessage("ROUTING_POLICY_CONFLICT")).toContain("Reload the latest matrix");
    expect(routingMatrixErrorMessage(null)).toBe("Routing data could not be processed safely. Refresh and try again.");
    expect(routingMatrixErrorMessage(null)).not.toContain("private-provider-error");
  });
});
