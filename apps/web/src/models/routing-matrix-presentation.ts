import type {
  FailurePolicyV1,
  RouteIdentityV1,
  RoutingMatrixRouteV1,
  RoutingPolicySourceV1,
} from "@hepha/shared";
import type { RoutingMatrixErrorCode } from "./routing-policy-api.js";

const errorMessages: Readonly<Record<RoutingMatrixErrorCode, string>> = {
  ROUTING_INVALID_REQUEST: "The routing change is incomplete or invalid. Review the row and try again.",
  ROUTING_UNKNOWN_SCOPE: "This routing scope is no longer registered. Reload the latest matrix to compare.",
  ROUTING_INVALID_POLICY: "The selected route and failure policy cannot be saved together.",
  ROUTING_CAPABILITY_MISMATCH: "The selected route does not meet every requirement for this scope.",
  ROUTING_INVALID_HANDOFF_CHAIN: "The selected fallback would create an unsafe routing chain.",
  ROUTING_ROUTE_UNAVAILABLE: "The selected route is no longer available.",
  ROUTING_POLICY_CONFLICT: "The routing policy changed while this draft was open. Reload the latest matrix to compare before retrying.",
  ROUTING_BOOTSTRAP_REQUIRED: "A Global Default has not been established. Start a valid Hepha launch before editing routing defaults.",
  ROUTING_GLOBAL_UNAVAILABLE: "The Global Default is unavailable. Select an eligible replacement before using dependent routes.",
  ROUTING_ATTENTION_CONFLICT: "This routing notice changed. Reload the latest matrix before acknowledging it.",
  ROUTING_MATRIX_READ_FAILED: "The routing matrix could not be presented safely. Refresh and try again.",
};

/** Converts only allowlisted error codes to fixed operator-facing copy. */
export function routingMatrixErrorMessage(code: RoutingMatrixErrorCode | null): string {
  return code === null ? "Routing data could not be processed safely. Refresh and try again." : errorMessages[code];
}

export function routeIdentityKey(route: RouteIdentityV1): string {
  return `${route.connectionId}\u0000${route.modelId}`;
}

export function routeLabel(route: RoutingMatrixRouteV1): string {
  return `${route.connectionLabel} · ${route.route.modelId}`;
}

export function policySourceLabel(source: RoutingPolicySourceV1): string {
  if (source === "action_type") return "Action type";
  if (source === "action") return "Action";
  return "Global";
}

export function failurePolicyLabel(policy: FailurePolicyV1): string {
  if (policy.kind === "reroute_global_once") return "Reroute once to Global Default";
  if (policy.kind === "reroute_route_once") return "Reroute once to a selected route";
  return "Fail immediately";
}
