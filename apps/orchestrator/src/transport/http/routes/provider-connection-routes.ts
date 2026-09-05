import type { IncomingMessage, ServerResponse } from "node:http";
import type { ProviderConnectionService } from "../../../provider-connections/service.js";
import type { ProviderCatalogMutationOperations } from "../../../model-catalog/provider-catalog-scan-application.js";
import {
  handleCreateConnection,
  handleCreateSecret,
  handleDeleteConnection,
  handleDeletionPreflight,
  handleGetConnection,
  handleGetDiagnostics,
  handleListConnections,
  handleRevokeSecret,
  handleRotateSecret,
  handleUpdateConnection,
  handleValidateConnection,
} from "../../../provider-connections/http-adapter.js";

export interface ProviderConnectionRouteContext {
  readonly service: ProviderConnectionService;
  readonly mutations: ProviderCatalogMutationOperations;
}

export interface ProviderConnectionRouteHandlers {
  create(request: IncomingMessage, response: ServerResponse, service: Pick<ProviderCatalogMutationOperations, "createConnection">): Promise<void>;
  createSecret(request: IncomingMessage, response: ServerResponse, service: Pick<ProviderCatalogMutationOperations, "createSecret">, id: string): Promise<void>;
  delete(request: IncomingMessage, response: ServerResponse, service: ProviderConnectionService, id: string): Promise<void>;
  deletionPreflight(response: ServerResponse, service: ProviderConnectionService, id: string): Promise<void>;
  diagnostics(response: ServerResponse, service: ProviderConnectionService, id: string, limit?: number): Promise<void>;
  get(response: ServerResponse, service: ProviderConnectionService, id: string): Promise<void>;
  list(response: ServerResponse, service: ProviderConnectionService): Promise<void>;
  revokeSecret(response: ServerResponse, service: ProviderConnectionService, id: string): Promise<void>;
  rotateSecret(request: IncomingMessage, response: ServerResponse, service: Pick<ProviderCatalogMutationOperations, "rotateSecret">, id: string): Promise<void>;
  update(request: IncomingMessage, response: ServerResponse, service: Pick<ProviderCatalogMutationOperations, "updateConnection">, id: string): Promise<void>;
  validate(response: ServerResponse, service: ProviderConnectionService, id: string): Promise<void>;
}

const defaultHandlers: ProviderConnectionRouteHandlers = {
  create: handleCreateConnection,
  createSecret: handleCreateSecret,
  delete: handleDeleteConnection,
  deletionPreflight: handleDeletionPreflight,
  diagnostics: handleGetDiagnostics,
  get: handleGetConnection,
  list: handleListConnections,
  revokeSecret: handleRevokeSecret,
  rotateSecret: handleRotateSecret,
  update: handleUpdateConnection,
  validate: handleValidateConnection,
};

export async function handleProviderConnectionRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: ProviderConnectionRouteContext,
  handlers: ProviderConnectionRouteHandlers = defaultHandlers,
): Promise<boolean> {
  const { service, mutations } = context;
  if (url.pathname === "/api/provider-connections") {
    if (request.method === "GET") await handlers.list(response, service);
    else if (request.method === "POST") await handlers.create(request, response, mutations);
    else return false;
    return true;
  }

  const rotate = url.pathname.match(/^\/api\/provider-connections\/([^/]+)\/secrets\/rotate$/);
  if (request.method === "POST" && rotate?.[1]) {
    await handlers.rotateSecret(request, response, mutations, rotate[1]);
    return true;
  }
  const revoke = url.pathname.match(/^\/api\/provider-connections\/([^/]+)\/secrets\/revoke$/);
  if (request.method === "POST" && revoke?.[1]) {
    await handlers.revokeSecret(response, service, revoke[1]);
    return true;
  }
  const secret = url.pathname.match(/^\/api\/provider-connections\/([^/]+)\/secrets$/);
  if (request.method === "POST" && secret?.[1]) {
    await handlers.createSecret(request, response, mutations, secret[1]);
    return true;
  }
  const validate = url.pathname.match(/^\/api\/provider-connections\/([^/]+)\/validate$/);
  if (request.method === "POST" && validate?.[1]) {
    await handlers.validate(response, service, validate[1]);
    return true;
  }
  const diagnostics = url.pathname.match(/^\/api\/provider-connections\/([^/]+)\/diagnostics$/);
  if (request.method === "GET" && diagnostics?.[1]) {
    const rawLimit = url.searchParams.get("limit");
    await handlers.diagnostics(
      response,
      service,
      diagnostics[1],
      rawLimit ? Number.parseInt(rawLimit) : undefined,
    );
    return true;
  }
  const preflight = url.pathname.match(/^\/api\/provider-connections\/([^/]+)\/delete-preflight$/);
  if (request.method === "GET" && preflight?.[1]) {
    await handlers.deletionPreflight(response, service, preflight[1]);
    return true;
  }
  const item = url.pathname.match(/^\/api\/provider-connections\/([^/]+)$/);
  if (!item?.[1]) return false;
  if (request.method === "GET") await handlers.get(response, service, item[1]);
  else if (request.method === "PUT") await handlers.update(request, response, mutations, item[1]);
  else if (request.method === "DELETE") await handlers.delete(request, response, service, item[1]);
  else return false;
  return true;
}
