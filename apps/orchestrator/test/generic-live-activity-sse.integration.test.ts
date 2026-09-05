import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LiveActivitySseService } from "../src/transport/sse/live-activity-sse-service.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-live-activity-sse.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const infrastructureSource = readFileSync(fileURLToPath(new URL("../src/bootstrap/workflow-infrastructure-applications.ts", import.meta.url)), "utf8");

describe("generic live activity SSE Gherkin integration", () => {
  it("specifies broadcast and replay behavior without work-item identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds the HTTP route and project notifications to the extracted service", () => {
    expect(LiveActivitySseService).toBeTypeOf("function");
    expect(infrastructureSource).toContain("new LiveActivitySseService");
    expect(orchestratorSource).toContain("liveActivitySseService.stream");
    expect(infrastructureSource).toContain("liveActivitySseService.notify");
    expect(infrastructureSource).toContain("liveActivitySseService.broadcast");
    expect(orchestratorSource).not.toContain("function streamLiveActivity");
    expect(orchestratorSource).not.toContain("function replayPhaseLifecycleEvents");
  });
});
