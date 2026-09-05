import { describe, expect, it } from "vitest";
import { PiModelCatalogScanner } from "../src/model-catalog/pi-model-catalog-scanner.js";
import type { PiCatalogProcess, PiCatalogProcessResult } from "../src/model-catalog/catalog-ports.js";

class FakePiProcess implements PiCatalogProcess {
  calls: Array<{ timeoutMs: number; maxStdoutBytes: number }> = [];
  constructor(private readonly result: PiCatalogProcessResult) {}

  async listModels(input: { readonly timeoutMs: number; readonly maxStdoutBytes: number }): Promise<PiCatalogProcessResult> {
    this.calls.push(input);
    return this.result;
  }
}

describe("PiModelCatalogScanner", () => {
  it("passes bounded fake Pi output to the shared normalizer boundary", async () => {
    const process = new FakePiProcess({ kind: "success", stdout: JSON.stringify({ models: [{ modelId: "pi-test" }] }) });
    const scanner = new PiModelCatalogScanner(process);

    await expect(scanner.scan()).resolves.toEqual({
      kind: "success",
      payload: { models: [{ modelId: "pi-test" }] },
    });
    expect(process.calls).toEqual([{ timeoutMs: 10_000, maxStdoutBytes: 1_048_576 }]);
  });

  it("parses Pi's supported table output and filters it by explicit provider identity", async () => {
    const process = new FakePiProcess({
      kind: "success",
      stdout: [
        "provider      model              context  max-out  thinking  images",
        "deepseek      deepseek-v4-pro    1M       384K     yes       no",
        "openai-codex  gpt-5.6-sol        272K     128K     yes       yes",
        "",
      ].join("\n"),
    });
    const scanner = new PiModelCatalogScanner(process);

    await expect(scanner.scan({ providerIds: ["openai", "openai-codex"] })).resolves.toEqual({
      kind: "success",
      payload: {
        models: [{
          modelId: "gpt-5.6-sol",
          contextWindowTokens: 272_000,
          maxOutputTokens: 128_000,
          inputModalities: ["image", "text"],
          capabilities: { api: true, reasoning: true, tools: true },
        }],
      },
    });
  });

  it.each([
    [{ kind: "non_zero", exitCode: 2 } as const, "process_failed"],
    [{ kind: "spawn_failed" } as const, "process_failed"],
    [{ kind: "timeout" } as const, "timeout"],
    [{ kind: "success", stdout: "not-json" } as const, "malformed_response"],
  ])("classifies Pi %o without retaining stdout", async (result, outcome) => {
    const scanner = new PiModelCatalogScanner(new FakePiProcess(result));
    await expect(scanner.scan()).resolves.toEqual({ kind: "failure", outcome, httpStatusCode: null });
  });
});
