import type { IncomingMessage, ServerResponse } from "node:http";
import type { RoutingPolicyService } from "../../../agent-routing/routing-policy-service.js";
import { handleAgentRoutingHttp } from "../../../agent-routing/routing-http-adapter.js";

/** Registers the closed agent-routing HTTP surface without duplicating policy behavior. */
export function handleAgentRoutingRoutes(request: IncomingMessage, response: ServerResponse, url: URL, service: RoutingPolicyService): Promise<boolean> {
  return handleAgentRoutingHttp(request, response, url, service);
}
