import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { DeepDiveSession } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { handleDeepDiveSessionRoutes } from "../src/transport/http/routes/deep-dive-session-routes.js";

function request(pathname: string, body?: unknown, method = "GET"): IncomingMessage {
  const value = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as IncomingMessage;
  value.method = method;
  value.url = pathname;
  return value;
}

function response(): ServerResponse {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
}

const session = { id: "session id", status: "question_round" } as DeepDiveSession;

describe("deep-dive session HTTP routes", () => {
  it("starts a session and returns created", async () => {
    const outgoing = response();
    const input = { cardId: "card", projectId: "project" };
    const start = vi.fn(async () => session);

    expect(await handleDeepDiveSessionRoutes(
      request("/api/deep-dive-sessions", input, "POST"), outgoing,
      new URL("http://localhost/api/deep-dive-sessions"),
      { answer: vi.fn(), chat: vi.fn(), complete: vi.fn(), get: vi.fn(), start },
    )).toBe(true);
    expect(start).toHaveBeenCalledWith(input);
    expect(outgoing.writeHead).toHaveBeenCalledWith(201, {
      "Content-Type": "application/json; charset=utf-8",
    });
    expect(outgoing.end).toHaveBeenCalledWith(JSON.stringify({ session }));
  });

  it("reads and completes decoded session identities", async () => {
    for (const [pathname, method, operationName] of [
      ["/api/deep-dive-sessions/session%20id", "GET", "get"],
      ["/api/deep-dive-sessions/session%20id/complete", "POST", "complete"],
    ] as const) {
      const operation = vi.fn(async () => session);
      const context = {
        answer: vi.fn(), chat: vi.fn(), complete: vi.fn(), get: vi.fn(), start: vi.fn(),
        [operationName]: operation,
      };
      const outgoing = response();

      expect(await handleDeepDiveSessionRoutes(
        request(pathname, method === "POST" ? {} : undefined, method), outgoing,
        new URL(`http://localhost${pathname}`), context,
      )).toBe(true);
      expect(operation).toHaveBeenCalledWith("session id");
      expect(outgoing.end).toHaveBeenCalledWith(JSON.stringify({ session }));
    }
  });

  it.each([
    ["answer", "/api/deep-dive-sessions/session%20id/questions/question%20id/answer", { answerText: "Because", selectedOptionId: "option" }],
    ["chat", "/api/deep-dive-sessions/session%20id/questions/question%20id/chat", { message: "Clarify" }],
  ] as const)("dispatches a decoded question %s command", async (operationName, pathname, input) => {
    const operation = vi.fn(async () => session);
    const context = {
      answer: vi.fn(), chat: vi.fn(), complete: vi.fn(), get: vi.fn(), start: vi.fn(),
      [operationName]: operation,
    };
    const outgoing = response();

    expect(await handleDeepDiveSessionRoutes(
      request(pathname, input, "POST"), outgoing, new URL(`http://localhost${pathname}`), context,
    )).toBe(true);
    expect(operation).toHaveBeenCalledWith("session id", "question id", input);
    expect(outgoing.end).toHaveBeenCalledWith(JSON.stringify({ session }));
  });

  it("refuses sibling paths and unsupported methods", async () => {
    const context = { answer: vi.fn(), chat: vi.fn(), complete: vi.fn(), get: vi.fn(), start: vi.fn() };
    await expect(handleDeepDiveSessionRoutes(
      request("/api/tasks"), response(), new URL("http://localhost/api/tasks"), context,
    )).resolves.toBe(false);
    await expect(handleDeepDiveSessionRoutes(
      request("/api/deep-dive-sessions/session", undefined, "DELETE"), response(),
      new URL("http://localhost/api/deep-dive-sessions/session"), context,
    )).resolves.toBe(false);
  });
});
