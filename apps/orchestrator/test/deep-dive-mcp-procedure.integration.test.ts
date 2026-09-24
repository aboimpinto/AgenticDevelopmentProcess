import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StoredDeepDiveSession } from "@hepha/db";
import type { DeepDiveQuestion, WorkItemCard } from "@hepha/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDevCycleDeepDiveRecipeClient } from "../src/runtime/devcycle-deep-dive-recipe-client.js";
import { DeepDiveQuestionPlanner } from "../src/application/deep-dive/deep-dive-question-planner.js";
import { DeepDiveFollowUpPlanner } from "../src/application/deep-dive/deep-dive-follow-up-planner.js";
import { DeepDiveChatResponder } from "../src/application/deep-dive/deep-dive-chat-responder.js";
import { DeepDiveDocumentUpdater } from "../src/application/deep-dive/deep-dive-document-updater.js";
import { createDeepDivePreparationSource } from "../src/application/deep-dive/deep-dive-preparation-source.js";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { applyDeepDiveEdits, deepDiveEditsProtocol } from "../src/exchanges/deep-dive-edits.js";
import { DeepDiveSourceDocumentRepository } from "../src/application/deep-dive/deep-dive-source-document-repository.js";

const recipes = JSON.parse(readFileSync(new URL("./fixtures/mcp-deep-dive-stage-responses.json", import.meta.url), "utf8"));
const source = "# Unique target source\nChoose an in-scope policy.";
const targetPath = "/memory/target.md";
const plan = handoffPlan("synthetic-model");
const options = ["First", "Second", "Third"].map((label, i) => ({ id: `o-${i}`, label, description: `${label} consequence` }));
const question = { id: "q-1", topic: "Boundary", prompt: "Which boundary?", options, recommendedOptionId: "o-0",
  selectedOptionId: "o-1", answerText: "Use the second boundary", chatMessages: [], status: "answered" } as DeepDiveQuestion;
const session = { id: "session", originalDocumentPath: targetPath, originalDocument: source, cardExternalId: "WORK-A",
  cardTitle: "Work", cardKind: "feature", questions: [question], focus: "Check recovery" } as StoredDeepDiveSession;
const preparationSource = createDeepDivePreparationSource([
  { fileName: "target.md", path: targetPath, label: "Target", markdown: source, updatedAt: "2031-01-01" },
  { fileName: "design.md", path: "/memory/design.md", label: "Design", markdown: "Distinct design evidence", updatedAt: "2031-01-01" },
]);
const editResult = JSON.stringify({ schemaVersion: "hepha-exchange/v1", kind: "deep-dive.edits",
  payload: { edits: [{ before: "Choose an in-scope policy.", after: "Use the second boundary." }] } });
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));

function client(mutate?: (recipe: any, wire: any) => void, isActive?: (runId: string) => Promise<boolean>) {
  const directory = mkdtempSync(join(tmpdir(), "hepha-deep-dive-client-")); roots.push(directory);
  const path = join(directory, "mcp.json");
  writeFileSync(path, JSON.stringify({ mcpServers: { "devcycle-mcp": { url: "http://localhost:8080/" } } }));
  const fetchRecipe = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    const recipe = structuredClone(recipes[request.params.arguments.stage]);
    const wire = { jsonrpc: "2.0", id: request.id, result: { structuredContent: recipe } };
    mutate?.(recipe, wire);
    return new Response(JSON.stringify(wire), { status: 200 });
  });
  return { prompt: createDevCycleDeepDiveRecipeClient(path, fetchRecipe as typeof fetch, isActive), fetchRecipe, configPath: path };
}

describe("MCP owns hosted Deep-Dive procedures", () => {
  it.each(["opening", "follow_up", "clarify", "apply_answers"] as const)("uses only the returned %s procedure while preserving model routing and UI results", async stage => {
    expect(readFileSync(new URL("./deep-dive-mcp-procedure.feature", import.meta.url), "utf8")).toContain("Scenario: MCP owns every hosted interview stage");
    const { prompt: mcpPrompt, fetchRecipe } = client();
    const generated = { questions: [{ topic: "Boundary", prompt: "Which boundary?", recommendedOptionLabel: "Second", options: options.map(({ label, description }) => ({ label, description })) }] };
    const runPrompt = vi.fn(async () => stage === "apply_answers" ? editResult : stage === "clarify" ? "The second option scopes recovery." : JSON.stringify(generated));
    let result: unknown;
    if (stage === "opening") {
      const planner = new DeepDiveQuestionPlanner({ mcpPrompt, runPrompt, renderLessons: () => "Unique lesson", sessionDirectory: "/sessions", stallTimeoutMs: 1000 });
      result = await planner.create({ rootPath: "/project" } as never, { documentPath: targetPath, specMarkdown: source, externalId: "WORK-A", title: "Work", kind: "feature" } as WorkItemCard,
        { plan, preparationSource, focus: session.focus ?? undefined });
    } else if (stage === "follow_up") {
      result = await new DeepDiveFollowUpPlanner({ mcpPrompt, runPrompt, readPreparationSource: () => preparationSource, resolveModel: () => plan, stallTimeoutMs: 1000 }).create(session, question);
    } else if (stage === "clarify") {
      result = await new DeepDiveChatResponder({ mcpPrompt, runPrompt, readPreparationSource: () => preparationSource, resolveModel: () => plan }).createReply(session, question, "Explain the options");
    } else {
      result = await new DeepDiveDocumentUpdater({ mcpPrompt, runPrompt, maxModelRewriteCharacters: 1, sessionDirectory: "/sessions", timeoutMs: 1000 }).update(session, [question], { plan, preparationSource });
    }
    expect(fetchRecipe).toHaveBeenCalledOnce();
    const request = JSON.parse(String(fetchRecipe.mock.calls[0]![1]!.body));
    expect(request.params).toEqual({ name: "deep-dive", arguments: { file_path: targetPath, response_mode: "host_stage", stage } });
    expect(JSON.stringify(request)).not.toContain(source);
    expect(runPrompt).toHaveBeenCalledOnce();
    const [prompt, selectedPlan, settings] = runPrompt.mock.calls[0] as unknown as [string, unknown, { implementationProfile?: boolean } | undefined];
    expect(selectedPlan).toEqual(plan);
    expect(settings?.implementationProfile ?? false).toBe(false);
    const [procedure, rawData] = prompt.split("\n\nHost interview data (JSON):\n");
    expect(procedure).toBe(recipes[stage].instructions);
    const data = JSON.parse(rawData!);
    expect(data.target.markdown).toBe(source);
    expect(prompt.split("Unique target source")).toHaveLength(2);
    expect(data.preparationDocuments).toEqual([{ fileName: "design.md", label: "Design", markdown: "Distinct design evidence" }]);
    if (stage === "follow_up") expect(data.newestAnswerId).toBe(question.id);
    if (stage !== "opening") expect(data.questions[0].selectedOptionId).toBe("o-1");
    if (stage === "opening" || stage === "follow_up") expect(result).toMatchObject([{ topic: "Boundary", recommendedOptionId: "option-2-second" }]);
    else expect(result).toBe(stage === "clarify" ? "The second option scopes recovery." : "# Unique target source\nUse the second boundary.");
  });

  it.each(["version", "stage", "scope", "missing", "rpc", "target", "output"])("rejects a %s contract defect before model execution", async defect => {
    const { prompt: mcpPrompt } = client((recipe, wire) => {
      if (defect === "version") recipe.deep_dive_host_contract.version = "unknown/v2";
      if (defect === "stage") recipe.deep_dive_host_contract.stage = "clarify";
      if (defect === "scope") recipe.deep_dive_host_contract.mutation_scope = [targetPath];
      if (defect === "missing") delete recipe.instructions;
      if (defect === "rpc") wire.id = "wrong-request";
      if (defect === "target") recipe.deep_dive_host_contract.target_file = "/memory/sibling.md";
      if (defect === "output") recipe.deep_dive_host_contract.output = "clarification_text";
    });
    const runPrompt = vi.fn();
    const updater = new DeepDiveDocumentUpdater({ mcpPrompt, runPrompt, maxModelRewriteCharacters: 1, sessionDirectory: "/sessions", timeoutMs: 1000 });
    await expect(updater.update(session, [question], { plan })).rejects.toThrow("MCP_DEEP_DIVE_CONTRACT_INVALID");
    expect(runPrompt).not.toHaveBeenCalled();
  });

  it("rejects a missing target before fetching a recipe", async () => {
    const { prompt: mcpPrompt, fetchRecipe } = client();
    const planner = new DeepDiveFollowUpPlanner({ mcpPrompt, runPrompt: vi.fn(), resolveModel: () => plan, stallTimeoutMs: 1000 });
    await expect(planner.create({ ...session, originalDocumentPath: null }, question)).rejects.toThrow("MCP_DEEP_DIVE_TARGET_REQUIRED");
    expect(fetchRecipe).not.toHaveBeenCalled();
  });

  it.each(["not JSON", "{}", '{"questions":[{"topic":"Broken","options":[]}]}'])("does not interpret malformed follow-up output as closure: %s", async output => {
    const { prompt: mcpPrompt } = client();
    const planner = new DeepDiveFollowUpPlanner({ mcpPrompt, runPrompt: vi.fn(async () => output), resolveModel: () => plan, stallTimeoutMs: 1000 });
    await expect(planner.create(session, question)).rejects.toThrow("MCP_DEEP_DIVE_QUESTIONS_INVALID");
  });

  it("closes a branch only for an explicit valid empty question list", async () => {
    const { prompt: mcpPrompt } = client();
    const planner = new DeepDiveFollowUpPlanner({ mcpPrompt, runPrompt: vi.fn(async () => '{"questions":[]}'), resolveModel: () => plan, stallTimeoutMs: 1000 });
    expect(await planner.create(session, question)).toEqual([]);
  });

  it("rejects an empty target rewrite instead of returning content that would erase the source", async () => {
    const { prompt: mcpPrompt } = client();
    const updater = new DeepDiveDocumentUpdater({ mcpPrompt, runPrompt: vi.fn(async () => " \n"),
      maxModelRewriteCharacters: 1, sessionDirectory: "/sessions", timeoutMs: 1000 });
    await expect(updater.update(session, [question], { plan })).rejects.toThrow("MCP_DEEP_DIVE_EDITS_INVALID");
  });

  it("does not launch Pi after cancellation during recipe retrieval", async () => {
    const isActive = vi.fn(async () => false);
    const { prompt: mcpPrompt } = client(undefined, isActive);
    const runPrompt = vi.fn();
    const planner = new DeepDiveFollowUpPlanner({ mcpPrompt, runPrompt, resolveModel: () => plan, stallTimeoutMs: 1000 });
    await expect(planner.create(session, question)).rejects.toThrow("MCP_DEEP_DIVE_SESSION_INACTIVE");
    expect(isActive).toHaveBeenCalledExactlyOnceWith(session.id);
    expect(runPrompt).not.toHaveBeenCalled();
  });

  it("applies scoped edits to the current primary snapshot and preserves intervening content", async () => {
    const current = source + "\n\nA section added during the interview.\n";
    const fresh = createDeepDivePreparationSource(preparationSource.documents.map(document => document.path === targetPath ? { ...document, markdown: current } : document));
    const { prompt: mcpPrompt } = client();
    const runPrompt = vi.fn(async (_prompt: string) => editResult);
    const updater = new DeepDiveDocumentUpdater({ mcpPrompt, runPrompt, maxModelRewriteCharacters: 1, sessionDirectory: "/sessions", timeoutMs: 1000 });
    const updated = await updater.update(session, [question], { plan, preparationSource: fresh });
    expect(updated).toBe(current.replace("Choose an in-scope policy.", "Use the second boundary."));
    const data = JSON.parse(runPrompt.mock.calls[0]![0].split("Host interview data (JSON):\n")[1]!);
    expect(data.target.markdown).toBe(current);
    expect(data.preparationDocuments).toHaveLength(1);
    const schema = JSON.parse(recipes.apply_answers.instructions.split("Return JSON matching this schema:\n")[1]);
    expect(schema).toEqual(deepDiveEditsProtocol.schema);
  });

  it("includes earlier saved answers and design constraints in clarification", async () => {
    const earlier = { ...question, id: "prior", answerText: "Keep the earlier scope constraint" };
    const { prompt: mcpPrompt } = client();
    const runPrompt = vi.fn(async (_prompt: string) => "Advice");
    await new DeepDiveChatResponder({ mcpPrompt, runPrompt, readPreparationSource: () => preparationSource, resolveModel: () => plan })
      .createReply({ ...session, questions: [earlier, question] }, question, "Explain the choices");
    const data = JSON.parse(runPrompt.mock.calls[0]![0].split("Host interview data (JSON):\n")[1]!);
    expect(data.questions.map((item: DeepDiveQuestion) => item.id)).toEqual(["prior", question.id]);
    expect(data.questions[0].answerText).toBe(earlier.answerText);
    expect(data.activeQuestionId).toBe(question.id);
    expect(data.preparationDocuments[0].markdown).toBe("Distinct design evidence");
  });

  it.each(["partial_markdown", "truncated_json", "whole_document", "missing_anchor", "overlapping", "duplicate_anchor"])("rejects unusable edit output (%s)", defect => {
    let raw = editResult;
    let input = source;
    if (defect === "partial_markdown") raw = "# Partial target";
    if (defect === "truncated_json") raw = editResult.slice(0, -3);
    if (defect === "whole_document") raw = deepDiveEditsProtocol.encode({ edits: [{ before: source, after: "# Partial" }] });
    if (defect === "missing_anchor") raw = deepDiveEditsProtocol.encode({ edits: [{ before: "not in source", after: "Replacement" }] });
    if (defect === "overlapping") raw = deepDiveEditsProtocol.encode({ edits: [{ before: "Choose an in-scope policy.", after: "First" }, { before: "in-scope", after: "Second" }] });
    if (defect === "duplicate_anchor") input += "\nChoose an in-scope policy.";
    expect(() => applyDeepDiveEdits(raw, input)).toThrow(/MCP_DEEP_DIVE_/);
  });

  it("refuses to overwrite a target edited while the model was running", () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-deep-dive-write-")); roots.push(directory);
    const path = join(directory, "target.md");
    writeFileSync(path, "New user edit");
    expect(() => new DeepDiveSourceDocumentRepository().write(path, "Model result", "Earlier snapshot")).toThrow("DEEP_DIVE_SOURCE_CHANGED");
    expect(readFileSync(path, "utf8")).toBe("New user edit");
  });

  it.each([false, true])("stops oversized response reads and cancels the stream (length header=%s)", async header => {
    const { configPath } = client();
    let pulls = 0;
    const cancel = vi.fn();
    const fetchRecipe = vi.fn(async () => new Response(new ReadableStream({
      pull(controller) { pulls++; controller.enqueue(new Uint8Array(800_000)); }, cancel,
    }), { headers: header ? { "Content-Length": "3000000" } : {} }));
    const prompt = createDevCycleDeepDiveRecipeClient(configPath, fetchRecipe as typeof fetch);
    await expect(prompt({ stage: "opening", targetPath, context: {} })).rejects.toThrow("MCP_DEEP_DIVE_CONTRACT_INVALID");
    expect(cancel).toHaveBeenCalledOnce();
    expect(pulls).toBeLessThanOrEqual(4);
  });
});
