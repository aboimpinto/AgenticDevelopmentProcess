import type { IncomingMessage } from "node:http";

/** Decode one complete HTTP request body as JSON. */
export async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  if (!rawBody) {
    return {} as T;
  }

  return JSON.parse(rawBody) as T;
}
