import type { ServerResponse } from "node:http";

/** Apply the local dashboard's base cross-origin request contract. */
export function setBaseHeaders(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:5173");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
