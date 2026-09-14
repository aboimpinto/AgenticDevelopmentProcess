import { expect, it, vi } from "vitest";
import { ASSESSMENT_PROMPT_LIMIT } from "../src/manual-test-verification/coverage-response-correction.js";
import { routeVerificationActions } from "../src/manual-test-verification/verification-action-routing.js";
const catalog = { fingerprint: "configuration", diagnostics: [], targets: [{ id: "target-existing", command: "npm run verify:browser", testPaths: ["features/checkout"], configurationFiles: ["package.json", "qa.config.ts"] }] };
const unresolved = [
  { sourceId: "AC-A", reason: "Matching server tests passed; existing browser execution still requires a controlled fixture." },
  { sourceId: "AC-B", reason: "The same browser run is unavailable.", execution: { command: "npm run verify:browser", testPaths: ["features/wrong"], prerequisite: "Provide the fixture" } },
];
it("routes a large character payload that fits the selected model's token capacity, including correction", async () => {
  const source = "Scope and fixture prerequisite remain binding. ".repeat(6000);
  const prompts: string[] = [];
  const result = await routeVerificationActions(unresolved, catalog, async prompt => {
    prompts.push(prompt);
    return JSON.stringify({ requirements: unresolved.map(x => ({ sourceId: x.sourceId, kind: "execution", targetId: prompts.length === 1 ? "invalid" : "target-existing" })) });
  }, undefined, [], source, undefined, {
    model: { contextWindow: 1_000_000, maxTokens: 16000, reasoning: true },
    counter: { encoding: "synthetic-token-counter", count: text => Math.ceil(text.length / 4) },
  });
  expect(prompts).toHaveLength(2);
  expect(prompts[0]!.length).toBeGreaterThan(178200);
  expect(prompts[0]).toContain(source);
  expect(result.every(x => x.execution?.targetId === "target-existing")).toBe(true);
});

it("groups repeated reference mappings without losing distinct explanations or human outcomes", async () => {
  const link = { sourceId: "AC-A", kind: "manual" as const, evidenceId: "operator", stepNumbers: [1], explanation: "Visible control was checked." };
  const context = { currentPackId: "current", manualResults: [{ testId: "operator", reviewed: true, result: "pass", recordedAt: "now", resultId: "result", reviewId: "review" }],
    partialLinks: [...Array.from({ length: 150 }, () => ({ ...link })), { ...link, explanation: "Browser execution is still required; native inspection does not replace it." }] };
  await routeVerificationActions(unresolved, catalog, async prompt => {
    const value = JSON.parse(prompt.split("\n").find(line => line.startsWith("Authoritative current verification context: "))!.split(": ").slice(1).join(": "));
    expect(value.partialLinks).toHaveLength(1);
    expect(value.partialLinks[0].explanations).toEqual([link.explanation, context.partialLinks.at(-1)!.explanation]);
    expect(value.manualResults).toEqual(context.manualResults);
    return JSON.stringify({ requirements: unresolved.map(x => ({ sourceId: x.sourceId, kind: "investigation" })) });
  }, undefined, [], "", context);
  expect(context.partialLinks).toHaveLength(151); // Projection never rewrites durable evidence or approvals.
});
it("MCOV-05 carries authoritative manual outcomes and partial proof across routing despite older phase prose", async () => {
  const context = { currentPackId: "current-pack", manualResults: [{ testId: "operator", reviewed: true, result: "pass", recordedAt: "2026-01-01T00:00:00Z", resultId: "result", reviewId: "review" }],
    partialLinks: [{ sourceId: "AC-A", kind: "manual", evidenceId: "operator", stepNumbers: [1], explanation: "Physical check passed; browser still lacks a report." }] };
  const result = await routeVerificationActions(unresolved, catalog, async prompt => {
    expect(prompt).toContain('"currentPackId":"current-pack"');
    expect(prompt).toContain('"result":"pass"');
    expect(prompt).toContain('"partialLinks"');
    expect(prompt).toContain("Historical phase prose cannot revoke these outcomes");
    return JSON.stringify({ requirements: unresolved.map(x => ({ sourceId: x.sourceId, kind: "execution", targetId: "target-existing" })) });
  }, undefined, [], "Historical operator qualification: PENDING", context as never);
  expect(result.map(x => x.reason)).toEqual(unresolved.map(x => x.reason));
});
it("does not downgrade an evidenced implementation diagnosis to execution just because a configured suite exists", async () => {
  const diagnosis = { kind: "implementation_missing", explanation: "The scenario delegates indexing to a fixture, but its documented control is absent after inspecting the shared hooks.", references: ["tests/shared-hooks.ts:20", "verification.md:12"], nextAction: "Implement the missing fixture control within the owning phase; preserve the shared authentication helper." };
  const run = vi.fn(async () => JSON.stringify({ requirements: [{ sourceId: "AC-A", kind: "execution", targetId: "target-existing" }] }));
  const result = await routeVerificationActions([{ sourceId: "AC-A", reason: diagnosis.explanation, diagnosis }], catalog, run);
  expect(result[0]?.execution).toBeUndefined();
  expect(result[0]?.diagnosis).toEqual(diagnosis);
  expect(result[0]?.investigation).not.toBe(true);
  expect(run).not.toHaveBeenCalled();
});
it("binds both requirements to one configured target without accepting model-authored command or paths", async () => {
  const result = await routeVerificationActions(unresolved, catalog, async prompt => {
    expect(prompt.length).toBeLessThan(ASSESSMENT_PROMPT_LIMIT); expect(prompt).not.toContain("features/wrong");
    return JSON.stringify({ requirements: unresolved.map(x => ({ sourceId: x.sourceId, targetId: "target-existing", kind: "execution", prerequisite: "Provide the controlled fixture" })) });
  });
  expect(result.map(x => x.execution)).toEqual(unresolved.map((_, i) => expect.objectContaining({ targetId: "target-existing", configurationFingerprint: "configuration", command: "npm run verify:browser", testPaths: ["features/checkout"], prerequisite: i ? "Provide the fixture\n\nProvide the controlled fixture" : "Provide the controlled fixture" })));
  expect(result.map(x => x.reason)).toEqual(unresolved.map(x => x.reason));
});
it("requests a correction for invented targets rather than trusting a plausible command", async () => {
  const run = vi.fn(async () => JSON.stringify({ requirements: unresolved.map(x => ({ sourceId: x.sourceId, kind: "execution", targetId: "invented" })) }));
  await expect(routeVerificationActions(unresolved, catalog, run)).rejects.toThrow("targetId");
  expect(run).toHaveBeenCalledTimes(3);
});
it("requires complete classification and uses investigation for unknown setup, never an inferred implementation task", async () => {
  const routed = await routeVerificationActions(unresolved, catalog, async () => JSON.stringify({ requirements: unresolved.map(x => ({ sourceId: x.sourceId, kind: "investigation" })) }));
  expect(routed.every(x => x.investigation && !x.execution)).toBe(true);
  await expect(routeVerificationActions(unresolved, catalog, async () => JSON.stringify({ requirements: [{ sourceId: "AC-A", kind: "investigation" }] }))).rejects.toThrow("every unresolved criterion");
});
