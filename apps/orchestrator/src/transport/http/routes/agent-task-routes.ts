import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  AgentTask,
  CreateAgentTaskInput,
  TaskListResponse,
  TaskResponse,
} from "@hepha/shared";
import { readJson } from "../read-json.js";
import { sendJson } from "../send-json.js";

export interface AgentTaskRoutesContext {
  cancelTask(taskId: string): void;
  createTask(input: CreateAgentTaskInput): AgentTask;
  findTask(taskId: string): AgentTask | undefined;
  listTasks(): AgentTask[];
  startTask(taskId: string): void;
}

export async function handleAgentTaskRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: AgentTaskRoutesContext,
): Promise<boolean> {
  if (request.method === "GET" && url.pathname === "/api/tasks") {
    sendJson<TaskListResponse>(response, 200, { tasks: context.listTasks() });
    return true;
  }
  if (request.method === "POST" && url.pathname === "/api/tasks") {
    const task = context.createTask(await readJson<CreateAgentTaskInput>(request));
    sendJson<TaskResponse>(response, 201, { task });
    return true;
  }

  const commandMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/(execute|cancel)$/);
  if (request.method === "POST" && commandMatch?.[1]) {
    const taskId = decodeURIComponent(commandMatch[1]);
    if (!context.findTask(taskId)) {
      sendJson(response, 404, { error: "Task not found" });
      return true;
    }
    if (commandMatch[2] === "execute") context.startTask(taskId);
    else context.cancelTask(taskId);
    sendJson<TaskResponse>(response, 202, { task: context.findTask(taskId)! });
    return true;
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (request.method === "GET" && taskMatch?.[1]) {
    const task = context.findTask(decodeURIComponent(taskMatch[1]));
    if (!task) {
      sendJson(response, 404, { error: "Task not found" });
      return true;
    }
    sendJson<TaskResponse>(response, 200, { task });
    return true;
  }

  return false;
}
