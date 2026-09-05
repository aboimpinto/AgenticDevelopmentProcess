import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProviderConnectionRecord } from "@hepha/shared";
import {
  piProviderIdsForEndpoint,
  readPiAuthenticatedProviderIds,
  readPiInstallationDefault,
  runtimeProviderIdForConnection,
} from "../src/runtime/pi/pi-installation-default.js";

function connection(
  connectionId: string,
  endpointUrl: string,
  lifecycleState: ProviderConnectionRecord["lifecycleState"] = "active",
): ProviderConnectionRecord {
  return {
    connectionId: connectionId as ProviderConnectionRecord["connectionId"],
    kind: "pi_session",
    label: "Operator-defined label",
    provider: { kind: "pi_session" },
    endpointUrl,
    endpointLocal: false,
    lifecycleState,
    secretRef: null,
    secretVersion: null,
    createdAt: "2026-07-23T08:00:00.000Z",
    updatedAt: "2026-07-23T08:00:00.000Z",
  };
}

describe("Pi installation default", () => {
  it("binds the explicit Pi provider/model to exactly one active code-owned endpoint", () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-pi-default-"));
    try {
      writeFileSync(join(directory, "settings.json"), JSON.stringify({
        defaultProvider: "openai-codex",
        defaultModel: "gpt-5.6-sol",
        unrelatedSecretLikeSetting: "not-read-by-the-adapter",
      }));
      const result = readPiInstallationDefault(
        { PI_CODING_AGENT_DIR: directory },
        {
          listConnections: () => [
            connection("deepseek", "https://api.deepseek.com"),
            connection("openai", "https://api.openai.com/v1"),
          ],
        },
      );

      expect(result).toEqual({
        providerId: "openai-codex",
        route: { connectionId: "openai", modelId: "gpt-5.6-sol" },
      });
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("returns no bootstrap for an absent, ambiguous, inactive, or unrecognized installation route", () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-pi-default-"));
    try {
      writeFileSync(join(directory, "settings.json"), JSON.stringify({
        defaultProvider: "openai-codex",
        defaultModel: "gpt-5.6-sol",
      }));
      expect(readPiInstallationDefault(
        { PI_CODING_AGENT_DIR: directory },
        { listConnections: () => [] },
      )).toBeNull();
      expect(readPiInstallationDefault(
        { PI_CODING_AGENT_DIR: directory },
        { listConnections: () => [
          connection("one", "https://api.openai.com/v1"),
          connection("two", "https://api.openai.com/v1"),
        ] },
      )).toBeNull();
      expect(readPiInstallationDefault(
        { PI_CODING_AGENT_DIR: directory },
        { listConnections: () => [connection("inactive", "https://api.openai.com/v1", "revoked")] },
      )).toBeNull();
      expect(readPiInstallationDefault(
        { PI_CODING_AGENT_DIR: directory },
        { listConnections: () => [connection("unknown", "https://provider.example/v1")] },
      )).toBeNull();
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("uses provider metadata rather than mutable labels", () => {
    expect(piProviderIdsForEndpoint("https://api.openai.com/v1")).toEqual(["openai", "openai-codex"]);
    expect(piProviderIdsForEndpoint("https://api.deepseek.com")).toEqual(["deepseek"]);
    expect(piProviderIdsForEndpoint("https://provider.example/v1")).toEqual([]);
  });

  it("resolves a unique DeepSeek Pi-session endpoint even when OpenAI is the installation default", () => {
    const deepseek = connection("deepseek-session", "https://api.deepseek.com");
    const openai = connection("openai-session", "https://api.openai.com/v1");
    const installationDefault = {
      providerId: "openai-codex",
      route: { connectionId: openai.connectionId, modelId: "gpt-5.6-sol" },
    };

    expect(runtimeProviderIdForConnection(deepseek, installationDefault)).toBe("deepseek");
    expect(runtimeProviderIdForConnection(openai, installationDefault)).toBe("openai-codex");
  });

  it("resolves an ambiguous endpoint from one authenticated Pi provider identity", () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-pi-auth-"));
    try {
      writeFileSync(join(directory, "auth.json"), JSON.stringify({
        "openai-codex": { type: "oauth", access: "must-not-be-returned" },
        deepseek: { type: "api_key", key: "must-not-be-returned" },
      }));
      const providerIds = readPiAuthenticatedProviderIds({ PI_CODING_AGENT_DIR: directory });

      expect(providerIds).toEqual(["deepseek", "openai-codex"]);
      expect(runtimeProviderIdForConnection(
        connection("secondary-openai", "https://api.openai.com/v1"),
        null,
        providerIds,
      )).toBe("openai-codex");
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("fails closed for multiple authenticated candidates or unknown Pi-session endpoints", () => {
    expect(runtimeProviderIdForConnection(
      connection("secondary-openai", "https://api.openai.com/v1"),
      null,
      ["openai", "openai-codex"],
    )).toBeNull();
    expect(runtimeProviderIdForConnection(
      connection("unknown", "https://provider.example/v1"),
      null,
      ["openai-codex"],
    )).toBeNull();
  });
});
