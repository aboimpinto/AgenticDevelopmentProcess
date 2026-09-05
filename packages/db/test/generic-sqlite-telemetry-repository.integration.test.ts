import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createCardMetadataStore, type AgentInvocationRecord } from "../src/index.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(
  resolve(testRoot, "generic-sqlite-telemetry-repository.feature"),
  "utf8",
);
const facade = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const repository = readFileSync(
  resolve(testRoot, "../src/sqlite/repositories/sqlite-telemetry-repository.ts"),
  "utf8",
);

describe("generic SQLite telemetry repository Gherkin integration", () => {
  it("specifies four identity-blind telemetry persistence paths", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("persists and updates an invocation through the production facade", async () => {
    const store = createCardMetadataStore({ HEPHA_DATABASE_PATH: ":memory:" });
    const running: AgentInvocationRecord = {
      cardKey: "work-item/example",
      id: "invocation-a",
      projectId: "project-a",
      startedAt: "2026-07-21T10:00:00.000Z",
      status: "running",
      workflowRunId: "workflow-a",
    };

    try {
      await store.recordAgentInvocation(running);
      await store.recordAgentInvocation({
        ...running,
        completedAt: "2026-07-21T10:01:00.000Z",
        durationMs: 60_000,
        status: "completed",
      });
      await expect(
        store.queryAgentInvocations({ projectId: running.projectId }),
      ).resolves.toEqual([
        expect.objectContaining({
          durationMs: 60_000,
          id: running.id,
          status: "completed",
        }),
      ]);

      expect(facade).toContain("new SqliteTelemetryRepository(this.query)");
      expect(facade).toContain("return this.telemetry.recordAgentInvocation(record)");
      expect(repository).toContain("export class SqliteTelemetryRepository");
      expect(facade).not.toContain("insert into hepha_agent_invocations");
      expect(facade).not.toContain("insert into hepha_normalized_events");
    } finally {
      await store.close();
    }
  });
});
