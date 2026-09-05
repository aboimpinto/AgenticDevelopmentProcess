import type { IncomingMessage, ServerResponse } from "node:http";
import {
  handleCatalogDiagnostics,
  handleListCatalogConnections,
  handleListModelCatalog,
  handleScanActiveCatalog,
  handleScanCatalogConnection,
  type ModelCatalogHttpContext,
} from "../../../model-catalog/catalog-http-adapter.js";

/** Dispatches only the documented server-side model catalog scan and read routes. */
export async function handleModelCatalogRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: ModelCatalogHttpContext,
): Promise<boolean> {
  if (url.pathname === "/api/model-catalog") {
    if (request.method !== "GET") return false;
    await handleListModelCatalog(request, response, context);
    return true;
  }
  if (url.pathname === "/api/model-catalog/scan-active") {
    if (request.method !== "POST") return false;
    await handleScanActiveCatalog(request, response, context);
    return true;
  }
  if (url.pathname === "/api/model-catalog/connections") {
    if (request.method !== "GET") return false;
    await handleListCatalogConnections(request, response, context);
    return true;
  }

  const scan = url.pathname.match(/^\/api\/model-catalog\/connections\/([^/]+)\/scan$/);
  if (scan) {
    if (request.method !== "POST") return false;
    const connectionId = decodeConnectionId(scan[1]);
    await handleScanCatalogConnection(request, response, connectionId, context);
    return true;
  }
  const diagnostics = url.pathname.match(/^\/api\/model-catalog\/connections\/([^/]+)\/diagnostics$/);
  if (diagnostics) {
    if (request.method !== "GET") return false;
    const connectionId = decodeConnectionId(diagnostics[1]);
    await handleCatalogDiagnostics(request, response, connectionId, url.searchParams.get("limit"), context);
    return true;
  }
  return false;
}

function decodeConnectionId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}
