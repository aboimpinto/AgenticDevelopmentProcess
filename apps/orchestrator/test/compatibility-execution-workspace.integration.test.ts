import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCompatibilityExecutionWorkspace as resolveWorkspace } from "../src/workflows/recipes/compatibility-execution-workspace.js";
import { ImplementationWorkerApplication } from "../src/workflows/phases/implementation-worker-application.js";
import { DevCycleMcpCompatibilityApplication } from "../src/workflows/recipes/devcycle-mcp-compatibility-application.js";
import { createDevCycleMcpCompatibilityRequest } from "../src/workflows/recipes/devcycle-mcp-compatibility-request.js";
import { handoffPlan } from "./support/handoff-plan-fixture.js";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })));
function git(path: string, ...args: string[]) {
  return execFileSync("git", ["-C", path, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function init(path: string) {
  mkdirSync(path, { recursive: true });
  git(path, "init", "-b", "main");
  git(path, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "baseline");
}
function fixture() {
  const parent = mkdtempSync(join(tmpdir(), "hepha-workspace-")); directories.push(parent);
  init(parent);
  const rootPath = join(parent, "product"); init(rootPath);
  const memoryBankPath = join(parent, "MemoryBank"); mkdirSync(memoryBankPath);
  const feature = join(memoryBankPath, "Features", "03_IN_PROGRESS", "FEAT-801-sample"); mkdirSync(feature, { recursive: true });
  const worktree = join(parent, "worktrees", "feature space");
  git(rootPath, "worktree", "add", "-b", "feat/FEAT-801-sample", worktree);
  git(rootPath, "switch", "-c", "feat/FEAT-700-other");
  writeFileSync(join(parent, "unrelated.txt"), "another project's unfinished work");
  writeFileSync(join(worktree, "unfinished-test.txt"), "feature work retained");
  return { parent, feature, worktree, project: { id: "sample", name: "Sample", rootPath, memoryBankPath, createdAt: "", updatedAt: "" } };
}

describe("MCP feature workspace boundary", () => {
  it("launches one worker in the feature worktree while preserving the dirty external documentation owner", async () => {
    const f = fixture();
    const before = git(f.parent, "status", "--porcelain");
    const runPrompt = vi.fn(async (_prompt, _plan, options) => {
      expect(options.cwd).toBe(f.worktree);
      expect(git(options.cwd, "branch", "--show-current")).toBe("feat/FEAT-801-sample");
      return "Phase documentation updated; feature remains in progress.";
    });
    const worker = new ImplementationWorkerApplication({
      appendAudit: () => {}, appendProfile: s => s, assertRunActive: () => {}, buildSessionFile: () => "/tmp/synthetic-session.json",
      createId: () => "worker", formatFailure: ({ error }) => String(error), isCancelled: () => false,
      recordAgentRun: async () => {}, runPrompt, summarizeOutput: s => s,
      validateActionPlan: () => true, validateNodeSkill: () => ({ status: "valid" }),
    });
    const feature = { externalId: "FEAT-801", folderPath: f.feature, kind: "feature", stateFolder: "03_IN_PROGRESS", phases: [] } as any;
    const blocked = vi.fn();
    const failed = vi.fn();
    const application = new DevCycleMcpCompatibilityApplication({
      resolveExecutionWorkspace: resolveWorkspace,
      applyManualTestDeferrals: async () => 0, seedManualTestSkips: async () => 0,
      createCardKey: () => "card", createId: () => "run", metadata: { block: blocked, fail: failed, start: async () => {}, complete: async () => {} },
      notifyChanged: () => {}, resolvePlan: () => handoffPlan("selected"), resolveTarget: async () => ({ feature, project: f.project }),
      runWorker: input => worker.execute(input), scanProject: async () => [feature], summarizeOutput: s => s, summarizeProject: () => ({} as any),
      validateImplementationArtifacts: () => ({ valid: true, errors: [] }), validateRefinementArtifacts: () => ({ valid: true, errors: [] }),
      validateCompletedArtifacts: () => ({ valid: true, errors: [] }), reconcileImplementationState: () => {}, isWorkflowActive: async () => true,
    });
    await application.execute({ cardKey: "card", runId: "run", target: { feature, project: f.project },
      request: createDevCycleMcpCompatibilityRequest({ operation: "continueImplementing", autonomous: true, featureId: "FEAT-801", featurePath: f.feature }) });
    expect(failed).not.toHaveBeenCalled();
    expect(runPrompt).toHaveBeenCalledTimes(1);
    const prompt = runPrompt.mock.calls[0]![0];
    expect(prompt).toContain('"workflow_mode":"autonomous"');
    expect(prompt).toContain(f.feature);
    expect(prompt).toContain("do not stage, commit, push, stash, clean or require cleanliness there");
    expect(prompt).toContain("unresolved changes remain subject to the MCP code gate");
    expect(blocked).toHaveBeenCalledWith(expect.objectContaining({ summary: expect.stringContaining("IMPLEMENTATION_ACTION_INCOMPLETE") }));
    expect(git(f.parent, "status", "--porcelain")).toBe(before);
    expect(git(f.project.rootPath, "branch", "--show-current")).toBe("feat/FEAT-700-other");
    expect(readFileSync(join(f.worktree, "unfinished-test.txt"), "utf8")).toBe("feature work retained");
  });

  it("rejects ambiguous feature worktrees and does not match a longer feature ID", () => {
    const f = fixture();
    git(f.project.rootPath, "worktree", "add", "-b", "feat/FEAT-8010-other", join(f.parent, "long-id"));
    expect(resolveWorkspace({ project: f.project, featureId: "FEAT-801", operation: "continueImplementing" }).cwd).toBe(f.worktree);
    git(f.project.rootPath, "worktree", "add", "-b", "fix/FEAT-801-followup", join(f.parent, "duplicate"));
    expect(() => resolveWorkspace({ project: f.project, featureId: "FEAT-801", operation: "continueImplementing" })).toThrow("WORKSPACE_AMBIGUOUS");
  });

  it("rejects locked, missing, or unrelated continuation workspaces", () => {
    const f = fixture();
    git(f.project.rootPath, "worktree", "lock", f.worktree);
    expect(() => resolveWorkspace({ project: f.project, featureId: "FEAT-801", operation: "continueImplementing" })).toThrow("WORKSPACE_UNAVAILABLE");
    expect(() => resolveWorkspace({ project: f.project, featureId: "FEAT-802", operation: "continueImplementing" })).toThrow("WORKSPACE_MISSING");
    expect(() => resolveWorkspace({ project: f.project, featureId: "FEAT-802", operation: "startImplementing" })).toThrow("WORKSPACE_MISSING");
  });

  it("allows start from main without an existing worktree and keeps internal MemoryBank inside code scope", () => {
    const f = fixture();
    git(f.project.rootPath, "switch", "main");
    const memoryBankPath = join(f.project.rootPath, "MemoryBank"); mkdirSync(memoryBankPath);
    const scope = resolveWorkspace({ project: { ...f.project, memoryBankPath }, featureId: "FEAT-802", operation: "startImplementing" });
    expect(scope.cwd).toBe(f.project.rootPath);
    expect(scope.context).toContain("This is only the initialization base");
    expect(scope.context).toContain("Do not develop on main/master");
    expect(scope.context).not.toContain("outside this action's Git authority");
  });

  it("rejects a project folder that inherits the shared parent's repository", () => {
    const f = fixture();
    const rootPath = join(f.parent, "not-a-repository"); mkdirSync(rootPath);
    expect(() => resolveWorkspace({ project: { ...f.project, rootPath }, featureId: "FEAT-801", operation: "continueImplementing" })).toThrow("WORKSPACE_INVALID");
  });
});
