import type { StoredDeepDiveSession } from "@hepha/db";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RefineFeatureExecutionApplication } from "../src/application/features/refine-feature-execution-application.js";
import { DeepDiveSessionApplication } from "../src/application/deep-dive/deep-dive-session-application.js";
import { RefinementDeepDiveHandoffApplication } from "../src/application/deep-dive/refinement-deep-dive-handoff-application.js";
import { parseRefineFeatureWorkerResult } from "../src/application/features/refine-feature-worker-result.js";
import { RefinedFeatureReadinessApplication } from "../src/application/features/refined-feature-readiness-application.js";
import { RefinementArtifactProgressReporter } from "../src/application/features/refinement-artifact-progress.js";
import { createPiOneShotPromptRunner } from "../src/runtime/pi/pi-one-shot-runner.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-refine-feature-execution-application.feature", import.meta.url)), "utf8");
const executionSource = readFileSync(fileURLToPath(new URL("../src/application/features/refine-feature-execution-application.ts", import.meta.url)), "utf8");
const readinessSource = readFileSync(fileURLToPath(new URL("../src/application/features/refined-feature-readiness-application.ts", import.meta.url)), "utf8");
const preparationCompositionSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/feature-preparation-applications.ts", import.meta.url)),
  "utf8",
);

describe("generic Refine Feature execution Gherkin integration", () => {
  it("specifies refinement and readiness behavior without fixed workflow identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(14);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("owns ordered execution, validation, receipt authorization, and durable recovery", () => {
    expect(RefineFeatureExecutionApplication).toBeTypeOf("function");
    expect(executionSource).toContain('"collect-context"');
    expect(executionSource).toContain('"generate-artifacts"');
    expect(executionSource).toContain('"evaluate-result"');
    expect(executionSource).toContain('"promote-ready"');
    expect(executionSource).toContain("this.assertArtifacts");
    expect(executionSource).toContain("this.assertReceipt");
    expect(executionSource).toContain("this.recordRecovered");
    expect(executionSource).toContain('status: "blocked"');
    expect(executionSource).toContain('"workflow.blocked"');
  });

  it("binds productive liveness, durable progress, and resumable interruption to production owners", () => {
    expect(createPiOneShotPromptRunner).toBeTypeOf("function");
    expect(RefinementArtifactProgressReporter).toBeTypeOf("function");
    expect(feature).toContain("former total-duration boundary passes");
    expect(feature).toContain("persists the current phase ordinal and total count");
    expect(feature).toContain("preserves the primary stall cause");
    expect(feature).toContain("runtime work state is not none");
    expect(feature).toContain("architecture-debt query selectors are canonicalized");
    expect(feature).toContain("recovered completion without regenerating valid phases");
    expect(executionSource).toContain("RefinementArtifactProgressReporter");
    expect(executionSource).toContain("describeRefinementInterruption");
  });

  it("binds the declared blocker route to the structured parser and interactive Deep-Dive handoff", () => {
    expect(parseRefineFeatureWorkerResult).toBeTypeOf("function");
    expect(RefinementDeepDiveHandoffApplication).toBeTypeOf("function");
    expect(feature).toContain("free-text chat message");
    expect(feature).toContain("no fixed retry or round limit");
    expect(feature).toContain("BLOCKED rather than FAILED");
  });

  it("preserves free-text steering and permits another refinement-generated question round", async () => {
    const sessions: StoredDeepDiveSession[] = [];
    const store = {
      enabled: true,
      createDeepDiveSession: async (session: StoredDeepDiveSession) => {
        sessions.push(session);
        return session;
      },
      findOpenDeepDiveSession: async () => sessions.find((session) => session.status === "question_round") ?? null,
      getDeepDiveSession: async (id: string) => sessions.find((session) => session.id === id) ?? null,
      updateDeepDiveSession: async (next: StoredDeepDiveSession) => {
        sessions[sessions.findIndex((session) => session.id === next.id)] = next;
        return next;
      },
    };
    let id = 0;
    const handoff = new RefinementDeepDiveHandoffApplication({
      clock: () => "2030-01-01T00:00:00.000Z",
      createId: () => `round-${++id}`,
      hashText: () => "source-hash",
      store,
    });
    const question = parseRefineFeatureWorkerResult(JSON.stringify({
      outcome: "NEEDS_DEEP_DIVE",
      reason: "A user decision remains.",
      questions: [{
        topic: "Boundary",
        prompt: "Choose the boundary.",
        recommendedOptionLabel: "A",
        options: [
          { label: "A", description: "Choose A." },
          { label: "B", description: "Choose B." },
          { label: "Defer", description: "Decide later." },
        ],
      }],
    }));
    if (question.kind !== "needs_deep_dive") throw new Error("Expected a Deep-Dive result.");
    const input = {
      cardKey: "feature:work-any",
      feature: {
        documentPath: "/memory/FeatureDescription.md", documentUpdatedAt: "now", externalId: "WORK-ANY",
        folderName: "work-any", id: "card-any", kind: "feature" as const, specMarkdown: "# Work", title: "Work",
      },
      project: { id: "project-any" } as never,
      questions: question.questions,
    };
    const first = await handoff.create(input);
    const chat = new DeepDiveSessionApplication({
      clock: () => "2030-01-01T00:01:00.000Z",
      createChatReply: async () => "The boundary controls ownership.",
      createId: () => `message-${++id}`,
      notifyChanged: () => undefined,
      planFollowUp: async () => [],
      recordAnswersReady: async () => undefined,
      store,
    });

    const steered = await chat.chat(first.id, "q-1", { message: "Explain the impact." });
    expect(steered.questions[0]?.chatMessages.map((message) => [message.role, message.content])).toEqual([
      ["user", "Explain the impact."],
      ["assistant", "The boundary controls ownership."],
    ]);

    sessions[0] = { ...sessions[0]!, completedAt: "later", status: "completed" };
    const second = await handoff.create(input);
    expect(second.id).not.toBe(first.id);
    expect(sessions).toHaveLength(2);
  });

  it("owns the architecture-debt gate before exact refined-source confirmation", () => {
    const confirmation = readinessSource.slice(readinessSource.indexOf("async confirm"), readinessSource.indexOf("async assertArchitectureDebtReady"));
    expect(RefinedFeatureReadinessApplication).toBeTypeOf("function");
    expect(readinessSource).toContain("evaluateFeatureDebtReadiness");
    expect(readinessSource).toContain("resolveArchitectureDebtPrerequisiteStates");
    expect(confirmation.indexOf("await this.assertArchitectureDebtReady")).toBeLessThan(confirmation.indexOf("confirmReadinessSource"));
  });

  it("leaves the composition root with delegation instead of implementation", () => {
    expect(preparationCompositionSource).toContain("refineFeatureExecutionApplication.execute(input)");
    expect(preparationCompositionSource).not.toContain("function executeRefineFeatureRun");
    expect(preparationCompositionSource).not.toContain("function recordRefineCompletionWhenArtifactsRecovered");
    expect(preparationCompositionSource).not.toContain("function confirmRefinedFeatureReadinessSource");
  });
});
