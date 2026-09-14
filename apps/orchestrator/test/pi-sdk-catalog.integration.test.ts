import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodePiCatalogProcess } from "../src/model-catalog/pi-catalog-process.js";
import { PiModelCatalogScanner } from "../src/model-catalog/pi-model-catalog-scanner.js";
import type { CatalogModelRecord, HandoffPlanV1 } from "@hepha/shared";
import { createReadinessPromptRunners } from "../src/runtime/pi/readiness-prompt-session.js";
import { contextCompactionLevel, progressiveContextBudget } from "../src/runtime/pi/progressive-context-policy.js";
import { proposeCoverageReconciliation } from "../src/manual-test-verification/coverage-reconciliation-prompt.js";
import type { ManualTestDeliveryModel } from "../src/manual-test-verification/delivery-model.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(body: string) {
  const root = mkdtempSync(join(tmpdir(), "hepha-sdk-catalog-")); roots.push(root);
  mkdirSync(join(root, "dist", "bundle"), { recursive: true });
  mkdirSync(join(root, "dist", "core"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@earendil-works/pi-coding-agent", type: "module" }));
  writeFileSync(join(root, "dist", "index.js"), "throw new Error('Optional experimental server dependency unavailable');");
  writeFileSync(join(root, "dist", "core", "model-runtime.js"), body);
  writeFileSync(join(root, "dist", "bundle", "cli.js"), "throw new Error('Do not parse the rounded CLI table');");
  symlinkSync(join(root, "dist", "bundle", "cli.js"), join(root, "pi"));
  return new NodePiCatalogProcess(join(root, "pi"));
}

it("MC-04: readiness reads effective SDK capacity without rescanning or mutating the display catalogue", async () => {
  const process = fixture(`export class ModelRuntime {
    static async create(options) {
      if (options.allowModelNetwork !== false) throw new Error("No network calls allowed");
      return { getAvailable: async () => [{ provider: "openai-codex", id: "gpt-5",
        contextWindow: 1000000, maxTokens: 128000, reasoning: true }] };
    }
  }`);
  const plan = { steps: [{ kind: "primary", route: { connectionId: "local", modelId: "gpt-5" } }] } as HandoffPlanV1;
  const cached = { identity: { modelId: "gpt-5" }, contextWindowTokens: 200000,
    maxOutputTokens: 128000, capabilities: { reasoning: true } } as CatalogModelRecord;
  const calls: string[] = [];
  const session = await createReadinessPromptRunners(() => ({ resolvePlan: () => plan }),
    { listModelsForConnection: () => [cached] }, async prompt => { calls.push(prompt); return JSON.stringify({ links: [],
      unresolved: [{ sourceId: "AC-REUSE", reason: "Execution evidence is unavailable." }] }); },
    () => "openai-codex", process).createReadinessPromptSession();
  expect(contextCompactionLevel(160000, progressiveContextBudget(session.model))).toBe("none");
  expect(session.model.contextWindow).toBe(1000000);
  expect(cached.contextWindowTokens).toBe(200000);
  expect(calls).toEqual([]);
  const documents = "Keep this source statement intact. ".repeat(16000);
  const model = { manifestEntries: [{ sourceId: "AC-REUSE", criterionPreview: "Persist a setting" }],
    coverageMap: [{ sourceId: "AC-REUSE", coverageStatus: "uncovered" }], tests: [], automatedEvidence: [] } as unknown as ManualTestDeliveryModel;
  const activity: unknown[] = [];
  await proposeCoverageReconciliation(model, session.runPrompt, documents, undefined,
    { model: session.model, counter: session.counter, onCompaction: event => activity.push(event) });
  expect(calls).toHaveLength(1);
  expect(calls[0]).toContain(documents);
  expect(activity).toEqual([]); // Actual assessment pipeline, not only threshold arithmetic.
});

it("MC-01: reads exact configured SDK capacities through the installed executable and scopes provider identity", async () => {
  const process = fixture(`export class ModelRuntime {
    static async create(options) {
      if (options.allowModelNetwork !== false) throw new Error("Network discovery forbidden");
      return { getAvailable: async () => [
        { provider: "subscription", id: "synthetic-wide", contextWindow: 1050000, maxTokens: 128000, reasoning: true,
          input: ["text", "image"], apiKey: "must-not-leak" },
        { provider: "other", id: "synthetic-wide", contextWindow: 272000, maxTokens: 128000 }
      ] };
    }
  }`);
  const result = await process.listModels({ timeoutMs: 5000, maxStdoutBytes: 10000 });
  expect(JSON.stringify(result)).not.toContain("must-not-leak");
  await expect(new PiModelCatalogScanner(process).scan({ providerIds: ["subscription"] })).resolves.toEqual({
    kind: "success", payload: { models: [{ modelId: "synthetic-wide", contextWindowTokens: 1_050_000,
      maxOutputTokens: 128_000, inputModalities: ["image", "text"], capabilities: { api: true, reasoning: true, tools: true } }] }
  });
});

it.each([
  ["throw new Error('private-auth-detail')", "non_zero"],
  ["export class ModelRuntime { static async create() { await new Promise(() => {}); } }", "non_zero"],
  ["setInterval(() => {}, 1000); export class ModelRuntime { static async create() { await new Promise(() => {}); } }", "timeout"],
  ["console.log('x'.repeat(10001));", "spawn_failed"],
] as const)("MC-02: SDK failure is bounded and sanitized (%s)", async (source, kind) => {
  const result = await fixture(source).listModels({ timeoutMs: 1000, maxStdoutBytes: 10000 });
  expect(result.kind).toBe(kind);
  expect(JSON.stringify(result)).not.toContain("private-auth-detail");
});
