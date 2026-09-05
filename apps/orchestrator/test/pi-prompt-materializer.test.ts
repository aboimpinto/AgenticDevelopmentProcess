import { describe, expect, it, vi } from "vitest";
import {
  shouldUsePiPromptFile,
  writePiPromptFileArgument,
  type PiPromptMaterializerHost,
} from "../src/runtime/pi/pi-prompt-materializer.js";

describe("Pi prompt materializer", () => {
  it("keeps short ordinary prompts inline", () => {
    expect(shouldUsePiPromptFile("short prompt", {})).toBe(false);
  });

  it("materializes every implementation prompt and any oversized prompt", () => {
    expect(shouldUsePiPromptFile("short", { implementationProfile: true })).toBe(true);
    expect(shouldUsePiPromptFile("x".repeat(8000), {})).toBe(false);
    expect(shouldUsePiPromptFile("x".repeat(8001), {})).toBe(true);
  });

  it("writes a stable workflow-prefixed prompt path and returns the Pi file argument", () => {
    const writeFile = vi.fn();
    const host: PiPromptMaterializerHost = {
      now: () => new Date("2026-07-21T10:20:30.456Z"),
      randomId: () => "unique",
      writeFile,
    };

    const argument = writePiPromptFileArgument(
      "prompt body",
      { workflowRunId: "workflow-generic" },
      "/sessions",
      host,
    );

    expect(argument).toBe("@/sessions/workflow-generic-2026-07-21T10-20-30-456Z-unique-prompt.md");
    expect(writeFile).toHaveBeenCalledWith(argument.slice(1), "prompt body");
  });

  it("omits the workflow prefix when no run identity is supplied", () => {
    const host: PiPromptMaterializerHost = {
      now: () => new Date("2026-07-21T00:00:00.000Z"),
      randomId: () => "id",
      writeFile: () => undefined,
    };

    expect(writePiPromptFileArgument("prompt", {}, "/sessions", host))
      .toBe("@/sessions/2026-07-21T00-00-00-000Z-id-prompt.md");
  });
});
