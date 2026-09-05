import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { FeatureWorkflowCommand } from "@hepha/shared";
import {
  resolveWorkflowCandidatePaths,
  resolveWorkflowSourcePath,
  WorkflowConflictError,
  WorkflowMissingError,
} from "../src/feature-workflow-spec.js";

function createMinimalWorkflowYaml(
  overrides: Partial<{ command: string; name: string; description: string; nodes: unknown[] }> = {},
): string {
  return [
    `name: ${overrides.name ?? "refine-feature"}`,
    overrides.command ? `command: ${overrides.command}` : "",
    overrides.description ? `description: ${overrides.description}` : "",
    "nodes:",
    "  - id: collect-context",
    "    kind: action",
    "    action: collect-context",
    "    status: Collecting context",
  ]
    .filter(Boolean)
    .join("\n");
}

function createFixtureDir(): string {
  return mkdtempSync(resolve(tmpdir(), "feat-025-resolver-"));
}

function cleanupFixtureDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

describe("FEAT-025 layout resolver", () => {
  describe("resolveWorkflowCandidatePaths", () => {
    it("builds candidate paths for all known layout roots", () => {
      const workspaceRoot = "/tmp/test-workspace";
      const command: FeatureWorkflowCommand = "refine-feature";
      const candidates = resolveWorkflowCandidatePaths(workspaceRoot, command);

      expect(candidates).toHaveLength(2);
      expect(candidates[0].root).toBe(".workflows");
      expect(candidates[0].path).toContain(".workflows/refine-feature.workflow.yaml");
      expect(candidates[1].root).toBe(".hepha/workflows");
      expect(candidates[1].path).toContain(".hepha/workflows/refine-feature.workflow.yaml");
    });

    it("uses the correct filename for each known command", () => {
      const workspaceRoot = "/tmp/test-workspace";
      const commands: FeatureWorkflowCommand[] = [
        "complete-feature",
        "continue-implementing",
        "deep-dive-epic",
        "deep-dive-feature",
        "design-feature",
        "refine-feature",
        "start-implementing",
      ];

      for (const command of commands) {
        const candidates = resolveWorkflowCandidatePaths(workspaceRoot, command);
        expect(candidates[0].path).toContain(`.workflows/${command}.workflow.yaml`);
        expect(candidates[1].path).toContain(`.hepha/workflows/${command}.workflow.yaml`);
      }
    });
  });

  describe("resolveWorkflowSourcePath - legacy-only", () => {
    it("resolves when only .workflows/ has the file", () => {
      const dir = createFixtureDir();
      try {
        mkdirSync(resolve(dir, ".workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".workflows/refine-feature.workflow.yaml"),
          createMinimalWorkflowYaml(),
        );

        const candidates = resolveWorkflowCandidatePaths(dir, "refine-feature");
        const sourcePath = resolveWorkflowSourcePath(
          candidates,
          "refine-feature",
          "refine-feature.workflow.yaml",
          (p) => ({ name: "refine-feature", nodes: [{ id: "collect-context", kind: "action" }] }),
        );

        expect(sourcePath).toBe(resolve(dir, ".workflows/refine-feature.workflow.yaml"));
      } finally {
        cleanupFixtureDir(dir);
      }
    });
  });

  describe("resolveWorkflowSourcePath - new-layout-only", () => {
    it("resolves when only .hepha/workflows/ has the file", () => {
      const dir = createFixtureDir();
      try {
        mkdirSync(resolve(dir, ".hepha/workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".hepha/workflows/refine-feature.workflow.yaml"),
          createMinimalWorkflowYaml(),
        );

        const candidates = resolveWorkflowCandidatePaths(dir, "refine-feature");
        const sourcePath = resolveWorkflowSourcePath(
          candidates,
          "refine-feature",
          "refine-feature.workflow.yaml",
          (p) => ({ name: "refine-feature", nodes: [{ id: "collect-context", kind: "action" }] }),
        );

        expect(sourcePath).toBe(resolve(dir, ".hepha/workflows/refine-feature.workflow.yaml"));
      } finally {
        cleanupFixtureDir(dir);
      }
    });
  });

  describe("resolveWorkflowSourcePath - equivalent dual", () => {
    it("resolves to legacy path when definitions are equivalent", () => {
      const dir = createFixtureDir();
      try {
        // Same content in both layouts
        const workflowContent = createMinimalWorkflowYaml();

        mkdirSync(resolve(dir, ".workflows"), { recursive: true });
        writeFileSync(resolve(dir, ".workflows/refine-feature.workflow.yaml"), workflowContent);

        mkdirSync(resolve(dir, ".hepha/workflows"), { recursive: true });
        writeFileSync(resolve(dir, ".hepha/workflows/refine-feature.workflow.yaml"), workflowContent);

        const candidates = resolveWorkflowCandidatePaths(dir, "refine-feature");
        const sourcePath = resolveWorkflowSourcePath(
          candidates,
          "refine-feature",
          "refine-feature.workflow.yaml",
          (p) => ({ name: "refine-feature", nodes: [{ id: "collect-context", kind: "action" }] }),
        );

        // Must return legacy path for equivalent definitions
        expect(sourcePath).toBe(resolve(dir, ".workflows/refine-feature.workflow.yaml"));
      } finally {
        cleanupFixtureDir(dir);
      }
    });

    it("resolves to legacy path even when files differ in whitespace-only ways", () => {
      const dir = createFixtureDir();
      try {
        const command: FeatureWorkflowCommand = "refine-feature";

        mkdirSync(resolve(dir, ".workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".workflows/refine-feature.workflow.yaml"),
          "name: refine-feature\nnodes:\n  - id: collect-context\n    kind: action\n    action: collect-context\n    status: Collecting context\n",
        );

        mkdirSync(resolve(dir, ".hepha/workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".hepha/workflows/refine-feature.workflow.yaml"),
          "name: refine-feature\nnodes:\n  - id: collect-context\n    kind: action\n    action: collect-context\n    status: Collecting context\n",
        );

        const candidates = resolveWorkflowCandidatePaths(dir, command);
        const sourcePath = resolveWorkflowSourcePath(
          candidates,
          command,
          "refine-feature.workflow.yaml",
          (_p) => ({ name: "refine-feature", nodes: [{ id: "collect-context", kind: "action" }] }),
        );

        expect(sourcePath).toBe(resolve(dir, ".workflows/refine-feature.workflow.yaml"));
      } finally {
        cleanupFixtureDir(dir);
      }
    });
  });

  describe("resolveWorkflowSourcePath - conflicting dual", () => {
    it("throws WorkflowConflictError when definitions diverge in name", () => {
      const dir = createFixtureDir();
      try {
        mkdirSync(resolve(dir, ".workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".workflows/refine-feature.workflow.yaml"),
          createMinimalWorkflowYaml({ name: "refine-feature" }),
        );

        mkdirSync(resolve(dir, ".hepha/workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".hepha/workflows/refine-feature.workflow.yaml"),
          createMinimalWorkflowYaml({ name: "refine-feature-v2" }),
        );

        const candidates = resolveWorkflowCandidatePaths(dir, "refine-feature");
        expect(() =>
          resolveWorkflowSourcePath(
            candidates,
            "refine-feature",
            "refine-feature.workflow.yaml",
            (p) => {
              // Return different content depending on path
              if (p.includes(".hepha/")) {
                return { name: "refine-feature-v2", nodes: [{ id: "collect-context", kind: "action" }] };
              }
              return { name: "refine-feature", nodes: [{ id: "collect-context", kind: "action" }] };
            },
          ),
        ).toThrow(WorkflowConflictError);
      } finally {
        cleanupFixtureDir(dir);
      }
    });

    it("throws WorkflowConflictError when definitions diverge in nodes", () => {
      const dir = createFixtureDir();
      try {
        mkdirSync(resolve(dir, ".workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".workflows/refine-feature.workflow.yaml"),
          createMinimalWorkflowYaml(),
        );

        mkdirSync(resolve(dir, ".hepha/workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".hepha/workflows/refine-feature.workflow.yaml"),
          createMinimalWorkflowYaml(),
        );

        const candidates = resolveWorkflowCandidatePaths(dir, "refine-feature");
        expect(() =>
          resolveWorkflowSourcePath(
            candidates,
            "refine-feature",
            "refine-feature.workflow.yaml",
            (p) => {
              if (p.includes(".hepha/")) {
                return {
                  name: "refine-feature",
                  nodes: [
                    { id: "collect-context", kind: "action" },
                    { id: "generate-artifacts", kind: "prompt" },
                  ],
                };
              }
              return {
                name: "refine-feature",
                nodes: [{ id: "collect-context", kind: "action" }],
              };
            },
          ),
        ).toThrow(WorkflowConflictError);
      } finally {
        cleanupFixtureDir(dir);
      }
    });

    it("WorkflowConflictError includes command, legacy path, and target path", () => {
      const dir = createFixtureDir();
      try {
        mkdirSync(resolve(dir, ".workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".workflows/refine-feature.workflow.yaml"),
          createMinimalWorkflowYaml({ name: "refine-feature" }),
        );

        mkdirSync(resolve(dir, ".hepha/workflows"), { recursive: true });
        writeFileSync(
          resolve(dir, ".hepha/workflows/refine-feature.workflow.yaml"),
          createMinimalWorkflowYaml({ name: "different-name" }),
        );

        const candidates = resolveWorkflowCandidatePaths(dir, "refine-feature");
        try {
          resolveWorkflowSourcePath(
            candidates,
            "refine-feature",
            "refine-feature.workflow.yaml",
            (p) => {
              if (p.includes(".hepha/")) {
                return { name: "different-name", nodes: [{ id: "collect-context", kind: "action" }] };
              }
              return { name: "refine-feature", nodes: [{ id: "collect-context", kind: "action" }] };
            },
          );
          expect.unreachable("Expected WorkflowConflictError");
        } catch (err) {
          expect(err).toBeInstanceOf(WorkflowConflictError);
          const conflict = err as WorkflowConflictError;
          expect(conflict.command).toBe("refine-feature");
          expect(conflict.legacyPath).toContain(".workflows/refine-feature.workflow.yaml");
          expect(conflict.targetPath).toContain(".hepha/workflows/refine-feature.workflow.yaml");
        }
      } finally {
        cleanupFixtureDir(dir);
      }
    });
  });

  describe("resolveWorkflowSourcePath - missing workflow", () => {
    it("throws WorkflowMissingError when no file exists in any layout", () => {
      const dir = createFixtureDir();
      try {
        mkdirSync(resolve(dir, ".workflows"), { recursive: true });
        mkdirSync(resolve(dir, ".hepha/workflows"), { recursive: true });
        // No files written

        const candidates = resolveWorkflowCandidatePaths(dir, "refine-feature");
        expect(() =>
          resolveWorkflowSourcePath(
            candidates,
            "refine-feature",
            "refine-feature.workflow.yaml",
            () => {
              throw new Error("should not be called");
            },
          ),
        ).toThrow(WorkflowMissingError);
      } finally {
        cleanupFixtureDir(dir);
      }
    });

    it("WorkflowMissingError includes command and tried paths", () => {
      const dir = createFixtureDir();
      try {
        mkdirSync(resolve(dir, ".workflows"), { recursive: true });
        mkdirSync(resolve(dir, ".hepha/workflows"), { recursive: true });

        const candidates = resolveWorkflowCandidatePaths(dir, "refine-feature");
        try {
          resolveWorkflowSourcePath(
            candidates,
            "refine-feature",
            "refine-feature.workflow.yaml",
            () => {
              throw new Error("should not be called");
            },
          );
          expect.unreachable("Expected WorkflowMissingError");
        } catch (err) {
          expect(err).toBeInstanceOf(WorkflowMissingError);
          const missing = err as WorkflowMissingError;
          expect(missing.command).toBe("refine-feature");
          expect(missing.triedPaths).toHaveLength(2);
          expect(missing.triedPaths[0]).toContain(".workflows/refine-feature.workflow.yaml");
          expect(missing.triedPaths[1]).toContain(".hepha/workflows/refine-feature.workflow.yaml");
        }
      } finally {
        cleanupFixtureDir(dir);
      }
    });
  });
});
