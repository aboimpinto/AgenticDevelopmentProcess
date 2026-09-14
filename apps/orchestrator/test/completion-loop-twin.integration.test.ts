import { describe, expect, it } from "vitest";
import { completionLoopFixture, completionScenarios } from "./support/completion-loop-fixture.js";
import { ASSESSMENT_PROMPT_LIMIT } from "../src/manual-test-verification/coverage-response-correction.js";

describe("Completion recovery — server twins of browser Gherkin journeys", () => {
  for (const scenario of completionScenarios) it(`${scenario.id}: ${scenario.title}`, async () => {
    const executionMode = ["discovery-only", "configured-execution"].includes(scenario.mode);
    const f = await completionLoopFixture(scenario.mode, scenario.id === "CR-04" ? 41 : 23);
    const endpoint = `/api/projects/${f.project.id}/completion-readiness`, input = { cardId: f.feature.id };
    const refresh = async () => { const r = await f.post(endpoint, input); expect(r.status).toBe(200); return r.body; };

    const repair = async (current: any, confirmExecutionPrerequisites?: boolean) => f.post("/api/phase-quality/resolve", { projectId: f.project.id, cardId: f.feature.id, phaseNumber: f.feature.phases[0]!.number, gate: "completion_recovery", action: "repair", note: "", confirmExecutionPrerequisites, expectedUpdatedAt: current.items[0].phases[0].updatedAt });
    try {
      const original = await f.metrics();
      if (["refresh-execution", "repair-no-execution", "large-routing"].includes(scenario.mode)) {
        const response = await f.post(endpoint, { ...input, reassess: true });
        expect(response.status).toBe(200);
        expect((await repair(response.body, true)).status).toBe(200);
        await expect.poll(async () => (await f.metrics()).workerCalls, { timeout: 15000 }).toBe(scenario.mode === "repair-no-execution" ? 3 : 1);
        await expect.poll(async () => (await f.metrics()).busy).toBe(false);
        await refresh(); // Background assessment cannot dispatch another worker.
        const after = await f.metrics();
        expect(after.workerCalls).toBe(scenario.mode === "repair-no-execution" ? 3 : 1);
        expect(after.workerPrompts[0]).toContain("verification.execution.receipt");
        expect(after.workerPrompts[0]).toContain("at most one focused correction attempt");
        expect(after.ready).toBe(scenario.mode !== "repair-no-execution");
        if (scenario.mode !== "repair-no-execution") {
          if (scenario.mode === "large-routing") expect(after.routingPromptLengths[0]).toBeGreaterThan(178200);
          expect(after.record!.unresolved).toEqual([]);
          expect(after.record!.assessedLinks!.some(link => link.sourceId === "AC-02")).toBe(true);
          expect((await refresh()).assessment.ready).toBe(true);
        } else {
          expect(after.record!.unresolved.length).toBeGreaterThan(0);
          expect(after.metadata?.workflowStatus).toBe("failed");
          expect(after.metadata?.workflowCurrentStep).toBe("Repair remains unresolved after verification");
        }
        expect(after.results).toEqual(original.results); expect(after.pack).toEqual(original.pack);
        expect(after.lifecycle).toBe("03_IN_PROGRESS"); expect(after.unexpected).toEqual([]);
        return;
      }
      if (["configured-execution", "large-context"].includes(scenario.mode)) {
        const release = f.holdAssessment();
        const background = f.post(endpoint, input);
        try {
          await expect.poll(async () => (await f.metrics()).busy).toBe(true);
          if (scenario.mode === "large-context") await expect.poll(async () => {
            const current = await (await fetch(`${f.url}/api/projects/${f.project.id}/work-items`)).json();
            return current.items[0].completionRecovery.contextCompaction?.state;
          }).toBe("running");
          expect((await f.post(endpoint, input)).status).toBe(400);
          expect((await f.post(endpoint, { ...input, confirmProposalId: "stale", confirm: true })).status).toBe(400);
          expect((await f.post(endpoint, { ...input, coveragePhaseNumber: 23 })).status).toBe(400);
          expect((await repair({ items: [f.feature] })).status).toBe(400);
          expect((await f.metrics()).results).toEqual(original.results);
        } finally { release(); await background; }
      }
      let state = await refresh();
      if (scenario.mode === "reassessment") {
        state = await refresh();
        const approved = (await f.metrics()).record!.assessedLinks!;
        expect((await refresh()).message).toContain("Existing assessment reused");
        expect((await f.metrics()).modelCalls).toBe(1);
        for (let count = 2; count <= 3; count++) {
          const result = await f.post(endpoint, { ...input, reassess: true });
          expect(result.status).toBe(200); state = result.body;
          expect((await f.metrics()).modelCalls).toBe(count);
          expect((await f.metrics()).record!.assessedLinks!).toEqual(expect.arrayContaining(approved));
        }
        expect(state.assessment.ready).toBe(true);
        expect((await refresh()).assessment.ready).toBe(true);
        const final = await f.metrics();
        expect(final.workerCalls).toBe(0); expect(final.lifecycle).toBe("03_IN_PROGRESS");
        expect(final.results).toEqual(original.results); expect(final.pack).toEqual(original.pack);
        expect(final.unexpected).toEqual([]);
        return;
      }
      if (scenario.mode === "mixed-evidence") {
        expect((await f.metrics()).record!.assessedLinks!.filter((link: any) => link.sourceId === "AC-02").map((link: any) => link.kind).sort()).toEqual(["automated"]);
        expect(state.assessment.phaseGaps.length === 0).toBe(true);
        expect((await f.metrics()).workerCalls).toBe(0);
      }
      if (scenario.mode === "configured-execution") {
        const before = await f.metrics(), proposal = state.assessment.proposal;
        await f.post("/api/test/legacy-execution-plan", {});
        state = await refresh();
        const after = await f.metrics();
        expect(after.assessmentPromptLengths).toEqual(before.assessmentPromptLengths);
        expect(state.assessment.proposal).toEqual(proposal);
        const repairs = state.assessment.phaseGaps.filter((g: any) => g.kind !== "coverage_confirmation");
        expect(repairs).toHaveLength(1); expect(repairs[0].kind).toBe("execution_evidence");
        expect(repairs[0].sourceIds).toEqual(["AC-02", "AC-04"]);
        expect(repairs[0].executions).toHaveLength(1);
        expect(repairs[0].executions[0].testPaths).toEqual(["features/checkout"]);
        expect(after.workerCalls).toBe(0);
      }
      if (scenario.mode === "large-context") {
        expect(state.assessment.contextCompaction.state).toBe("completed");
        expect(state.assessment.contextCompaction.afterTokens).toBeLessThan(state.assessment.contextCompaction.beforeTokens);
        const metrics = await f.metrics();
        expect(metrics.inspectedIdentities).toBe(0); // lossless compaction avoids raw identity retrieval
        expect(metrics.sourcePages).toBeGreaterThan(1);
        expect(metrics.assessedIdentityCounts).toEqual([1601]);
        expect(metrics.assessedSourceClauses[0]).toContain("Separate executed layers may jointly prove the contract.");
        expect(metrics.assessedSourceClauses[0]).toContain("Browser discovery is not execution.");
        expect(metrics.assessmentPromptLengths).toHaveLength(1);
        expect(metrics.assessmentPromptLengths.every(length => length <= ASSESSMENT_PROMPT_LIMIT)).toBe(true);
      }
      if (scenario.mode === "schema-correction") {
        expect(state.assessment.blockers.some((b: any) => b.id === "assessment-incomplete")).toBe(false);
        expect((await f.metrics()).modelCalls).toBe(2);
      }
      if (scenario.mode === "schema-exhaustion") {
        expect(state.assessment.blockers[0].message).toContain("feature.acceptance.assessment");
        expect(state.assessment.phaseGaps).toEqual([]);
        expect((await f.metrics()).modelCalls).toBe(3);
        expect((await f.metrics()).workerCalls).toBe(0);
        state = await refresh();
        expect((await f.metrics()).modelCalls).toBe(4);
      }
      if (scenario.mode === "discovery-only") {
        const existingLinks = (await f.metrics()).record!.assessedLinks!;
        await f.post("/api/test/legacy-routing", {});
        state = await refresh();
        expect((await f.metrics()).record!.assessedLinks!).toEqual(existingLinks);
        expect(state.assessment.phaseGaps.some((g: any) => g.kind === "execution_evidence"), JSON.stringify(state.assessment)).toBe(true);
      }
      if (scenario.mode === "assessment-error") {
        expect(state.assessment.blockers.some((b: any) => b.id === "assessment-incomplete")).toBe(true);
        expect(state.assessment.phaseGaps).toEqual([]); state = await refresh();
      }
      if (scenario.mode === "review-only") {
        expect(state.assessment.phaseGaps.every((g: any) => g.kind === "coverage_confirmation")).toBe(true);
        expect((await repair(state)).status).toBe(400);
        const before = await f.metrics(); const repeated = await refresh();
        expect(repeated.assessment.ready).toBe(true);
        expect(repeated.assessment.proposal).toBeUndefined();
        expect((await f.metrics()).modelCalls).toBe(before.modelCalls);
      }
      state = await refresh();
      if (scenario.mode === "diagnosis-repair") {
        expect((await f.metrics()).record?.partialLinks).toHaveLength(1);
        expect(state.assessment.phaseGaps[0]?.kind, JSON.stringify(state.assessment)).toBe("execution_evidence");
        expect((await repair(state)).status).toBe(200);
        await expect.poll(async () => !(await f.metrics()).busy, { timeout: 15000 }).toBe(true);
        state = await refresh();
        expect(state.assessment.ready).toBe(true);
        expect((await f.metrics()).workerCalls).toBe(2);
        const repaired = await f.metrics();
        expect(repaired.workerPrompts[0]).toContain("Execution-only recovery");
        expect(repaired.workerPrompts[1]).not.toContain("Execution-only recovery:");
        expect(repaired.workerPrompts[1]).toContain("preserve authentication delegation");
        expect(repaired.record?.assessedLinks.filter(link => link.sourceId === "AC-02")).toHaveLength(2);
        expect(repaired.record?.partialLinks).toEqual([]);
        state = await refresh();
      }
      if (scenario.mode === "changed-report") {
        expect(state.assessment.ready).toBe(true);
        await f.post("/api/test/tamper", {}); state = await refresh();
      }
      if (["repair", "changed-report"].includes(scenario.mode) || executionMode) {
        expect(state.assessment.ready).toBe(false);
        const gaps = state.assessment.phaseGaps.filter((g: any) => g.kind !== "coverage_confirmation");
        expect(gaps.map((g: any) => g.sourceIds)).toEqual([scenario.mode === "configured-execution" ? ["AC-02", "AC-04"] : ["AC-02"]]);
        if (executionMode) {
          expect(gaps[0].kind).toBe("execution_evidence");
          expect(state.assessment.blockers[0].actionLabel).toBe("Run Phase 23 existing verification");
          expect((await repair(state)).status).toBe(400);
          expect((await f.metrics()).workerCalls).toBe(0);
          // A false setup acknowledgement cannot create a pass. Failed preflight returns to the same actionable prerequisite.
          expect((await repair(state, true)).status).toBe(200);
          await expect.poll(async () => !(await f.metrics()).busy, { timeout: 15000 }).toBe(true);
          const blocked = await f.metrics();
          expect(blocked.ready).toBe(false); expect(blocked.record?.proposal).toBeUndefined();
          expect(blocked.record?.assessedLinks.map(link => link.sourceId)).toEqual(["AC-01", "AC-03"]);
          expect((await repair(await refresh())).status).toBe(400);
          await f.post("/api/test/environment-ready", {});
          state = await refresh();
        }
        expect((await repair(state, executionMode ? true : undefined)).status).toBe(200);
        await expect.poll(async () => { const m = await f.metrics(); return !m.busy && m.ready; }).toBe(true);
        const repaired = await f.metrics();
        expect(repaired.workerCalls).toBe(executionMode ? 4 : 1);
        expect(repaired.workerPrompts[0]).toContain("AC-02");
        expect(repaired.record!.assessedLinks!.some(l => l.sourceId === "AC-01")).toBe(true);
        if (executionMode) {
          expect(repaired.workerPrompts[0]).toContain("Execution-only recovery");
          expect(repaired.workerPrompts[0]).not.toContain("Add meaningful missing");
          expect(repaired.workerPrompts[0]).not.toContain("implement and run only genuinely missing tests");
        }
        expect(repaired.record!.assessedLinks!.some(l => l.sourceId === "AC-01")).toBe(true);
        expect(repaired.record!.assessedLinks!.map(l => l.sourceId)).toEqual(scenario.mode === "configured-execution" ? ["AC-01", "AC-02", "AC-03", "AC-04"] : ["AC-01", "AC-02", "AC-03"]);
        state = await refresh();
      }
      expect(state.assessment.ready).toBe(true); expect(state.assessment.phaseGaps).toEqual([]);
      const final = await f.metrics();
      expect(final.ready).toBe(true); expect(final.lifecycle).toBe("03_IN_PROGRESS");
      expect(final.results).toEqual(original.results); expect(final.pack).toEqual(original.pack);
      expect(original.metadata?.userCodeReviewCompletedAt).toBeTruthy();
      expect(final.metadata?.userCodeReviewCompletedAt).toBe(original.metadata?.userCodeReviewCompletedAt);
      expect(final.phaseDocument).not.toContain("Completion readiness quality gaps");
      expect(final.unexpected).toEqual([]);
      expect(final.workerCalls).toBe(executionMode ? 4 : scenario.mode === "diagnosis-repair" ? 2 : ["repair", "changed-report"].includes(scenario.mode) ? 1 : 0);
      if (scenario.mode === "mixed-evidence") await f.post("/api/test/stale-assessment", {});
      const calls = final.modelCalls; expect((await refresh()).assessment.ready).toBe(true); expect((await f.metrics()).modelCalls).toBe(calls);
      if (scenario.mode === "mixed-evidence") expect((await f.metrics()).record?.assessedLinks).toEqual(final.record?.assessedLinks);
    } finally { await f.close(); }
  }, 15_000);
});
