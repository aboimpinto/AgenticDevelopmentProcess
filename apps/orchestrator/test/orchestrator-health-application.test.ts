import { describe, expect, it, vi } from "vitest";
import { buildOrchestratorHealth } from "../src/application/health/orchestrator-health-application.js";

describe("orchestrator health application", () => {
  it("projects runtime capability and resolved Pi diagnostics", () => {
    const result = buildOrchestratorHealth({
      authFileExists: vi.fn(() => true),
      createPiEnvironment: () => ({ DEEPSEEK_API_KEY: "secret", HEPHA_DATABASE_PATH: "/db" }),
      metadataDatabasePath: "/db",
      metadataStore: "sqlite",
      port: 4317,
      renderPiInvocation: () => "pi --mode json",
      resolveAuthFile: () => "/auth.json",
      resolvePi: () => ({ diagnostics: ["resolved"], invocation: { command: "pi" } }),
      sessionDir: "/sessions",
      workspaceRoot: "/workspace",
    });

    expect(result).toEqual({
      env: { DEEPSEEK_API_KEY: true, HEPHA_DATABASE_PATH: true, OPENAI_API_KEY: false, PI_CHATGPT_AUTH: true },
      metadataDatabasePath: "/db",
      metadataStore: "sqlite",
      ok: true,
      piCommand: "pi --mode json",
      piCommandDiagnostics: ["resolved"],
      piCommandStatus: "available",
      port: 4317,
      sessionDir: "/sessions",
      workspaceRoot: "/workspace",
    });
  });

  it("reports a missing Pi invocation without rendering it", () => {
    const renderPiInvocation = vi.fn();
    const result = buildOrchestratorHealth({
      authFileExists: () => false,
      createPiEnvironment: () => ({}),
      metadataDatabasePath: null,
      metadataStore: "disabled",
      port: 1,
      renderPiInvocation,
      resolveAuthFile: () => "/auth.json",
      resolvePi: () => ({ diagnostics: ["missing"], invocation: null }),
      sessionDir: "/sessions",
      workspaceRoot: "/workspace",
    });

    expect(result.piCommand).toBeNull();
    expect(result.piCommandStatus).toBe("missing");
    expect(renderPiInvocation).not.toHaveBeenCalled();
  });
});
