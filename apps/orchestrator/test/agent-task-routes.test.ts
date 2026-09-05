import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { AgentTask, CreateAgentTaskInput } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { handleAgentTaskRoutes } from "../src/transport/http/routes/agent-task-routes.js";

function request(pathname: string, body?: unknown, method = "GET"): IncomingMessage {
  const value = Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as IncomingMessage;
  value.method = method;
  value.url = pathname;
  return value;
}

function response(): ServerResponse {
  return { end: vi.fn(), writeHead: vi.fn() } as unknown as ServerResponse;
}

const task = { id: "task id", createdAt: 10, status: "queued" } as AgentTask;

describe("agent task HTTP routes", () => {
  it("lists tasks and creates a typed task", async () => {
    const listTasks = vi.fn(() => [task]);
    const createTask = vi.fn(() => task);
    const base = { cancelTask: vi.fn(), createTask, findTask: vi.fn(), listTasks, startTask: vi.fn() };

    const listed = response();
    expect(await handleAgentTaskRoutes(
      request("/api/tasks"), listed, new URL("http://localhost/api/tasks"), base,
    )).toBe(true);
    expect(listed.end).toHaveBeenCalledWith(JSON.stringify({ tasks: [task] }));

    const input = { agent_action: "continue-implementing", prompt: "Do bounded work" } as CreateAgentTaskInput;
    const created = response();
    expect(await handleAgentTaskRoutes(
      request("/api/tasks", input, "POST"), created,
      new URL("http://localhost/api/tasks"), base,
    )).toBe(true);
    expect(createTask).toHaveBeenCalledWith(input);
    expect(created.writeHead).toHaveBeenCalledWith(201, {
      "Content-Type": "application/json; charset=utf-8",
    });
  });

  it.each([
    ["execute", "startTask"],
    ["cancel", "cancelTask"],
  ] as const)("resolves and dispatches %s", async (command, operationName) => {
    const current = { ...task } as AgentTask;
    const findTask = vi.fn(() => current);
    const context = {
      cancelTask: vi.fn(), createTask: vi.fn(), findTask, listTasks: vi.fn(), startTask: vi.fn(),
    };
    const pathname = `/api/tasks/task%20id/${command}`;
    const outgoing = response();

    expect(await handleAgentTaskRoutes(
      request(pathname, {}, "POST"), outgoing, new URL(`http://localhost${pathname}`), context,
    )).toBe(true);
    expect(findTask).toHaveBeenCalledWith("task id");
    expect(context[operationName]).toHaveBeenCalledWith("task id");
    expect(outgoing.writeHead).toHaveBeenCalledWith(202, {
      "Content-Type": "application/json; charset=utf-8",
    });
  });

  it("reads a decoded task and returns not found before dispatch", async () => {
    const outgoing = response();
    const context = {
      cancelTask: vi.fn(), createTask: vi.fn(), findTask: vi.fn(() => task),
      listTasks: vi.fn(), startTask: vi.fn(),
    };
    expect(await handleAgentTaskRoutes(
      request("/api/tasks/task%20id"), outgoing,
      new URL("http://localhost/api/tasks/task%20id"), context,
    )).toBe(true);
    expect(context.findTask).toHaveBeenCalledWith("task id");

    vi.mocked(context.findTask).mockReturnValue(undefined);
    const missing = response();
    expect(await handleAgentTaskRoutes(
      request("/api/tasks/missing/execute", {}, "POST"), missing,
      new URL("http://localhost/api/tasks/missing/execute"), context,
    )).toBe(true);
    expect(context.startTask).not.toHaveBeenCalled();
    expect(missing.end).toHaveBeenCalledWith(JSON.stringify({ error: "Task not found" }));
  });

  it("refuses unrelated paths and unsupported methods", async () => {
    const context = {
      cancelTask: vi.fn(), createTask: vi.fn(), findTask: vi.fn(), listTasks: vi.fn(), startTask: vi.fn(),
    };
    await expect(handleAgentTaskRoutes(
      request("/api/approvals"), response(), new URL("http://localhost/api/approvals"), context,
    )).resolves.toBe(false);
    await expect(handleAgentTaskRoutes(
      request("/api/tasks/task", {}, "DELETE"), response(),
      new URL("http://localhost/api/tasks/task"), context,
    )).resolves.toBe(false);
  });
});
