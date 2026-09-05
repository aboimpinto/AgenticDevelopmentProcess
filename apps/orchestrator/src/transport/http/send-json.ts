import type { ServerResponse } from "node:http";

/** Serialize one JSON response with the orchestrator's canonical content type. */
export function sendJson<T>(response: ServerResponse, statusCode: number, body: T): void {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
