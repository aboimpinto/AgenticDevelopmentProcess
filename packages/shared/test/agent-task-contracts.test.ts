import { describe, expect, expectTypeOf, it } from "vitest";
import type { AgentTask as PublicAgentTask, TaskResponse } from "../src/index.js";
import type { AgentTask as BoundedAgentTask } from "../src/agent-tasks/contracts.js";

describe("agent task contracts", () => {
  it("preserves the public barrel shape through the bounded contract", () => {
    const task = {
      age: "now",
      agent: "implementation",
      columnId: "execute",
      createdAt: 1,
      eventCount: 1,
      events: [{ detail: "started", id: "event", time: "now", title: "Started", tone: "live", type: "status" }],
      id: "task",
      latestActivity: "now",
      model: "configured-model",
      prompt: "Perform bounded work",
      runId: "run",
      state: "Execute",
      status: "running",
      title: "Bounded task",
    } satisfies BoundedAgentTask;
    const response: TaskResponse = { task };

    expectTypeOf<BoundedAgentTask>().toEqualTypeOf<PublicAgentTask>();
    expect(response.task.events[0]?.tone).toBe("live");
  });
});
