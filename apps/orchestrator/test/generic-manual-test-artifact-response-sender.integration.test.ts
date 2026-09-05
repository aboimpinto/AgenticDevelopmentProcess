import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ManualTestArtifactResponseSender } from "../src/transport/http/manual-test-artifact-response-sender.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-manual-test-artifact-response-sender.feature", import.meta.url)), "utf8");
const senderSource = readFileSync(fileURLToPath(new URL("../src/transport/http/manual-test-artifact-response-sender.ts", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");

describe("generic manual-test artifact response Gherkin integration", () => {
  it("specifies safe delivery behavior without fixed workflow identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("owns file delivery and the uniform not-found response", () => {
    expect(ManualTestArtifactResponseSender).toBeTypeOf("function");
    expect(senderSource).toContain('"Cache-Control": "no-store"');
    expect(senderSource).toContain('"X-Content-Type-Options": "nosniff"');
    expect(senderSource.match(/sendJson\(response, 404/g)).toHaveLength(2);
  });

  it("is delegated from manual-test routes instead of implemented in the root", () => {
    expect(orchestratorSource).toContain("manualTestArtifactResponseSender.send(response, input)");
    expect(orchestratorSource).not.toContain("function sendManualTestArtifact");
  });
});
