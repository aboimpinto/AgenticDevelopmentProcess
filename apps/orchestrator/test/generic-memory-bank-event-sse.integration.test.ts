import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getMemoryBankPollingIntervalMs,
  MemoryBankEventSseService,
  shouldPollMemoryBankEvents,
} from "../src/transport/sse/memory-bank-event-sse-service.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-memory-bank-event-sse.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const infrastructureSource = readFileSync(fileURLToPath(new URL("../src/bootstrap/workflow-infrastructure-applications.ts", import.meta.url)), "utf8");

describe("generic MemoryBank event SSE Gherkin integration", () => {
  it("specifies notification, filesystem, and fallback behavior without work-item identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds the HTTP route and project notifications to the extracted service", () => {
    expect(MemoryBankEventSseService).toBeTypeOf("function");
    expect(infrastructureSource).toContain("new MemoryBankEventSseService");
    expect(orchestratorSource).toContain("memoryBankEventSseService.stream");
    expect(infrastructureSource).toContain("memoryBankEventSseService.notify");
    expect(orchestratorSource).not.toContain("function streamProjectMemoryBankEvents");
    expect(orchestratorSource).not.toContain("function getMemoryBankFingerprint");
  });

  it("keeps fallback policy in the generic service", () => {
    expect(shouldPollMemoryBankEvents({ HEPHA_MEMORYBANK_USE_POLLING: "1" })).toBe(true);
    expect(getMemoryBankPollingIntervalMs({ HEPHA_MEMORYBANK_POLL_INTERVAL_MS: "500" })).toBe(500);
  });
});
