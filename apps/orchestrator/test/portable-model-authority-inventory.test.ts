import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validatePortableAssetSource } from "../src/portable-asset-contract.js";
import { validatePortableModelAuthorityInventory } from "../src/portable-model-authority-inventory.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const expectedLaunches = [
  "complete-feature:finalize-feature:complete-feature",
  "deep-dive-epic:generate-questions:deep-dive",
  "deep-dive-epic:update-document:deep-dive",
  "deep-dive-feature:generate-questions:deep-dive",
  "deep-dive-feature:update-document:deep-dive",
  "design-feature:generate-design-artifacts:design-feature",
  "refine-feature:generate-artifacts:refine-feature",
  "start-implementing:post-process:start-feature",
];

describe("portable model-authority production inventory", () => {
  it("validates every configured production asset and all eight registered launch actions", () => {
    const result = validatePortableModelAuthorityInventory({ workspaceRoot });

    expect(result.diagnostics).toEqual([]);
    expect(result.selectedAssetCount).toBe(53);
    expect(result.assetPaths).toHaveLength(53);
    expect(result.launchNodeActions.map(({ workflow, nodeId, action }) =>
      `${workflow}:${nodeId}:${action}`)).toEqual(expectedLaunches);
    expect(result.assetPaths).toContain(".hepha/commands/start-feature-postprocess.md");
    expect(result.assetPaths).toContain("pi-packages/pi-skill-hepha-continue-implementation/skills/start-feature/SKILL.md");
  });

  it("uses calibrated positive, negative, and domain-semantic controls", () => {
    const directHostBody = `
## Model Authority

This procedure is model-neutral. Direct execution uses \`direct_host\` in the
current Pi, Codex, or Claude Code session, which owns model selection. Do not
query Hepha routing policy. Direct execution does not fabricate an orchestrated
receipt. Only an explicit Hepha launcher or dashboard dispatch creates a worker.
`;
    const valid = validatePortableAssetSource(
      `---\nname: start-feature\nagent_action: start-feature\n---\n${directHostBody}\nReview product model and provider requirements.\n`,
      { expectedAgentAction: "start-feature", kind: "skill", requireDirectHostAuthority: true },
    );
    const routingField = validatePortableAssetSource(
      "---\nname: start-feature\nagent_action: start-feature\nmodel: audit-pro\neffort: high\n---\nBody.\n",
      { expectedAgentAction: "start-feature", kind: "skill" },
    );
    const actionConflict = validatePortableAssetSource(
      "---\nname: start-feature\nagent_action: deep-dive\n---\nBody.\n",
      { expectedAgentAction: "start-feature", kind: "skill" },
    );
    const duplicate = validatePortableAssetSource(
      "---\nname: start-feature\nagent_action: start-feature\nagent_action: deep-dive\n---\nBody.\n",
      { expectedAgentAction: "start-feature", kind: "skill" },
    );
    const directive = validatePortableAssetSource(
      "---\nname: start-feature\nagent_action: start-feature\n---\nSwitch to model audit-pro before work.\n",
      { expectedAgentAction: "start-feature", kind: "skill" },
    );

    expect(valid.diagnostics).toEqual([]);
    expect(routingField.diagnostics.filter((entry) =>
      entry.code === "PORTABLE_ASSET_ROUTING_FIELD_FORBIDDEN")).toHaveLength(2);
    expect(actionConflict.diagnostics.map((entry) => entry.code)).toContain("PORTABLE_ASSET_ACTION_CONFLICT");
    expect(duplicate.diagnostics.map((entry) => entry.code)).toContain("PORTABLE_ASSET_DUPLICATE_KEY");
    expect(directive.diagnostics.map((entry) => entry.code)).toContain("PORTABLE_ASSET_ROUTING_DIRECTIVE_FORBIDDEN");
  });

  it("rejects the complete executable routing-directive matrix clause by clause", () => {
    const forbiddenBodies = [
      "Select the coding-agent model audit-pro.",
      "Choose provider provider-a for this run.",
      "Set the model class to pro.",
      "Change the model ID before work.",
      "Switch to model audit-pro.",
      "Override the routing effort to high.",
      "Recommend a coding-agent model for this procedure.",
      "Validate the model before starting.",
      "Fall back to model safe-default.",
      "Fall back to the Global Default.",
      "Request a model switch before work.",
      "Route this worker to provider provider-a.",
      "Run /model audit-pro before work.",
      "Match Hepha routing policy before continuing.",
      "Compare the current model with Hepha policy.",
      "Consult the model policy and choose the routed model.",
      "Automatically hand off to another worker.",
      "Transfer to another session automatically.",
      "If there is a route mismatch, transfer to another session.",
      "Do not query Hepha routing policy; however, select model audit-pro.",
    ];

    for (const body of forbiddenBodies) {
      const result = validatePortableAssetSource(`# Procedure\n\n${body}\n`, { kind: "skill" });
      expect(result.diagnostics, body).toContainEqual({
        code: "PORTABLE_ASSET_ROUTING_DIRECTIVE_FORBIDDEN",
        field: "(body)",
      });
    }
  });

  it("accepts direct-host prohibitions and product-domain model/provider records", () => {
    const bodies = [
      "Do not query Hepha routing policy, switch models, fall back, or hand off automatically.",
      "Choose a domain model record and update its validation status.",
      "Select the provider metadata record used by the product catalog.",
      "Discuss product model and provider requirements with the operator.",
    ];

    for (const body of bodies) {
      expect(validatePortableAssetSource(`# Procedure\n\n${body}\n`, { kind: "skill" }).diagnostics, body).toEqual([]);
    }
  });

  it("enforces absent, required, and explicitly action-free skill expectations", () => {
    const noAction = "---\nname: portable\n---\nBody.\n";
    const startAction = "---\nname: portable\nagent_action: start-feature\n---\nBody.\n";
    const unknownAction = "---\nname: portable\nagent_action: unknown-action\n---\nBody.\n";
    const registered = (action: string) => action === "start-feature";

    expect(validatePortableAssetSource(noAction, { kind: "skill" }).diagnostics).toEqual([]);
    expect(validatePortableAssetSource(startAction, {
      isRegisteredAction: registered,
      kind: "skill",
    }).diagnostics).toEqual([]);
    expect(validatePortableAssetSource(unknownAction, {
      isRegisteredAction: registered,
      kind: "skill",
    }).diagnostics.map(({ code }) => code)).toContain("PORTABLE_ASSET_ACTION_INVALID");
    expect(validatePortableAssetSource(noAction, {
      expectedAgentAction: "start-feature",
      kind: "skill",
    }).diagnostics.map(({ code }) => code)).toContain("PORTABLE_ASSET_ACTION_CONFLICT");
    expect(validatePortableAssetSource(startAction, {
      expectedAgentAction: "start-feature",
      kind: "skill",
    }).diagnostics).toEqual([]);
    expect(validatePortableAssetSource(startAction, {
      expectedAgentAction: null,
      kind: "skill",
    }).diagnostics.map(({ code }) => code)).toContain("PORTABLE_ASSET_ACTION_CONFLICT");

    const rejectedRequiredSources = [
      "---\nname: portable\nagent_action: null\n---\nBody.\n",
      "---\nname: portable\nagent_action: Start Feature\n---\nBody.\n",
      unknownAction,
      "---\nname: portable\nagent_action: deep-dive\n---\nBody.\n",
      "---\nname: portable\nmetadata:\n  agent_action: start-feature\n---\nBody.\n",
      "---\nname: portable\nagentAction: start-feature\n---\nBody.\n",
    ];
    for (const source of rejectedRequiredSources) {
      expect(validatePortableAssetSource(source, {
        expectedAgentAction: "start-feature",
        isRegisteredAction: registered,
        kind: "skill",
      }).diagnostics.length, source).toBeGreaterThan(0);
    }
  });

  it.each(["Pi", "Codex", "Claude Code"])(
    "keeps the same Start Feature procedure model-neutral in %s direct-host mode",
    (host) => {
      const source = `---
name: start-feature
agent_action: start-feature
---
# Start Feature

## Model Authority

This procedure is model-neutral. A ${host} direct run uses \`direct_host\` in the
current Pi, Codex, or Claude Code session, which owns model selection. Do not
query Hepha routing policy. Direct execution does not fabricate an orchestrated
receipt. Only an explicit Hepha launcher or dashboard dispatch creates a worker.
`;
      const result = validatePortableAssetSource(source, {
        expectedAgentAction: "start-feature",
        kind: "skill",
        requireDirectHostAuthority: true,
      });

      expect(result.agentAction).toBe("start-feature");
      expect(result.diagnostics).toEqual([]);
    },
  );

  it.each([
    ["command", ".hepha/commands/stale-command.md", "# Stale command\n"],
    ["agent", ".hepha/agents/stale-agent.agent.yaml", "name: stale-agent\nresponsibilities:\n  - stale\n"],
    ["project skill", ".hepha/skills/stale-skill.md", "---\nname: stale-skill\n---\nBody.\n"],
    ["package skill", "pi-packages/stale-package/skills/stale-skill/SKILL.md", "---\nname: stale-skill\n---\nBody.\n"],
  ])("rejects an unlisted %s instead of ignoring it", (_label, relativePath, source) => {
    const root = clonePortableInventoryWorkspace();
    const path = resolve(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);

    const result = validatePortableModelAuthorityInventory({ workspaceRoot: root });

    expect(result.assetPaths).toContain(relativePath);
    expect(result.diagnostics).toContainEqual({
      code: "PORTABLE_ASSET_UNLISTED",
      field: "(file)",
      path: relativePath,
    });
  });

  it("rejects a missing required manifest-owned asset", () => {
    const root = clonePortableInventoryWorkspace();
    rmSync(resolve(root, ".hepha/commands/design-feature.md"));

    const result = validatePortableModelAuthorityInventory({ workspaceRoot: root });

    expect(result.diagnostics).toContainEqual({
      code: "PORTABLE_ASSET_MISSING",
      field: "(file)",
      path: ".hepha/commands/design-feature.md",
    });
  });

  it("rejects absent, malformed, and unreadable authoritative inventories", () => {
    const absentRoot = mkdtempSync(resolve(tmpdir(), "hepha-portable-inventory-"));
    const malformedRoot = mkdtempSync(resolve(tmpdir(), "hepha-portable-inventory-"));
    const unreadableRoot = mkdtempSync(resolve(tmpdir(), "hepha-portable-inventory-"));
    mkdirSync(resolve(malformedRoot, "docs/architecture"), { recursive: true });
    mkdirSync(resolve(unreadableRoot, "docs/architecture/project-hepha-asset-inventory.json"), { recursive: true });
    writeFileSync(resolve(malformedRoot, "docs/architecture/project-hepha-asset-inventory.json"), "{not-json");

    for (const root of [absentRoot, malformedRoot, unreadableRoot]) {
      expect(validatePortableModelAuthorityInventory({ workspaceRoot: root }).diagnostics)
        .toContainEqual(expect.objectContaining({ code: "PORTABLE_ASSET_INVALID", field: "(inventory)" }));
    }
  });

  it("applies directive classification through complete inventory admission", () => {
    const root = clonePortableInventoryWorkspace();
    const path = resolve(root, ".hepha/commands/stale-routing.md");
    writeFileSync(path, "# Command\n\nDo not query policy; however, recommend a coding-agent model.\n");

    const result = validatePortableModelAuthorityInventory({ workspaceRoot: root });

    expect(result.diagnostics).toContainEqual({
      code: "PORTABLE_ASSET_ROUTING_DIRECTIVE_FORBIDDEN",
      field: "(body)",
      path: ".hepha/commands/stale-routing.md",
    });

    const listedCommandPath = resolve(root, ".hepha/commands/design-feature.md");
    const originalCommand = readFileSync(listedCommandPath, "utf8");
    for (const directive of [
      "Do not query Hepha routing policy, then recommend a coding-agent model.",
      "Choose the product model record, then automatically hand off.",
    ]) {
      writeFileSync(listedCommandPath, `${originalCommand}\n${directive}\n`);
      expect(validatePortableModelAuthorityInventory({ workspaceRoot: root }).diagnostics, directive)
        .toContainEqual(expect.objectContaining({
          code: "PORTABLE_ASSET_ROUTING_DIRECTIVE_FORBIDDEN",
          path: ".hepha/commands/design-feature.md",
        }));
    }
    for (const safeInstruction of [
      "Do not query Hepha routing policy, switch the model, fall back, or hand off.",
      "Choose the product model record.",
    ]) {
      writeFileSync(listedCommandPath, `${originalCommand}\n${safeInstruction}\n`);
      expect(validatePortableModelAuthorityInventory({ workspaceRoot: root }).diagnostics
        .filter(({ path: diagnosticPath }) => diagnosticPath === ".hepha/commands/design-feature.md"), safeInstruction)
        .toEqual([]);
    }
  });

  it.each([
    ["managed", ".hepha/commands/__fixtures__/legacy-routing.md", "---\nmodel_policy: review.high\n---\n# Legacy\n\nRun /model audit-pro before work.\n"],
    ["package", "pi-packages/fixture-package/skills/__fixtures__/legacy-routing/SKILL.md", "---\nname: legacy-routing\nmodel: audit-pro\n---\n# Legacy\n\nSwitch to model audit-pro before work.\n"],
  ])("validates and excludes an allowlisted prohibited %s fixture", (_kind, relativePath, source) => {
    const root = clonePortableInventoryWorkspace();
    const path = resolve(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);

    const result = validatePortableModelAuthorityInventory({
      negativeFixturePaths: [relativePath],
      workspaceRoot: root,
    });

    expect(result.assetPaths).not.toContain(relativePath);
    expect(result.selectedAssetCount).toBe(53);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "PORTABLE_ASSET_ROUTING_FIELD_FORBIDDEN",
      path: relativePath,
    }));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "PORTABLE_ASSET_ROUTING_DIRECTIVE_FORBIDDEN",
      path: relativePath,
    }));
  });

  it.each([
    ["managed", ".hepha/commands/__fixtures__/clean.md", "# Current command\n\nInspect the product catalog.\n"],
    ["package", "pi-packages/fixture-package/skills/__fixtures__/clean/SKILL.md", "---\nname: current-skill\n---\n# Current skill\n\nInspect the product catalog.\n"],
  ])("rejects a clean allowlisted %s fixture instead of trusting its path", (_kind, relativePath, source) => {
    const root = clonePortableInventoryWorkspace();
    const path = resolve(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);

    const result = validatePortableModelAuthorityInventory({
      negativeFixturePaths: [relativePath],
      workspaceRoot: root,
    });

    expect(result.assetPaths).not.toContain(relativePath);
    expect(result.diagnostics).toContainEqual({
      code: "PORTABLE_ASSET_NEGATIVE_FIXTURE_ACCEPTED",
      field: "(negative-fixture)",
      path: relativePath,
    });
  });

  it("rejects a configured negative fixture that is absent or not a managed asset", () => {
    const root = clonePortableInventoryWorkspace();
    const absent = ".hepha/commands/__fixtures__/absent.md";
    const unmanaged = "outside/__fixtures__/legacy.md";
    mkdirSync(dirname(resolve(root, unmanaged)), { recursive: true });
    writeFileSync(resolve(root, unmanaged), "# Legacy\n\nSwitch to model audit-pro.\n");

    const result = validatePortableModelAuthorityInventory({
      negativeFixturePaths: [absent, unmanaged],
      workspaceRoot: root,
    });

    expect(result.diagnostics).toContainEqual({
      code: "PORTABLE_ASSET_MISSING",
      field: "(negative-fixture)",
      path: absent,
    });
    expect(result.diagnostics).toContainEqual({
      code: "PORTABLE_ASSET_INVALID",
      field: "(negative-fixture)",
      path: unmanaged,
    });
  });

  it("accepts equivalent dual workflow layouts and rejects a divergent action", () => {
    const root = clonePortableInventoryWorkspace();
    cpSync(resolve(root, ".workflows"), resolve(root, ".hepha/workflows"), { recursive: true });
    const equivalent = validatePortableModelAuthorityInventory({ workspaceRoot: root });
    expect(equivalent.diagnostics).toEqual([]);
    expect(equivalent.selectedAssetCount).toBe(60);

    const copiedWorkflow = resolve(root, ".hepha/workflows/complete-feature.workflow.yaml");
    writeFileSync(copiedWorkflow, readFileSync(copiedWorkflow, "utf8")
      .replace("agent_action: complete-feature", "agent_action: code-review"));
    const divergent = validatePortableModelAuthorityInventory({ workspaceRoot: root });
    expect(divergent.diagnostics.map(({ code }) => code)).toContain("PORTABLE_ASSET_WORKFLOW_DIVERGENCE");
  });

  it("accepts optional registered action metadata for a configured skill without an expectation", () => {
    const root = clonePortableInventoryWorkspace();
    const path = resolve(root, "configured/optional/SKILL.md");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "---\nname: optional\nagent_action: start-feature\n---\nBody.\n");

    const result = validatePortableModelAuthorityInventory({
      configuredSkillPaths: [{ path }],
      workspaceRoot: root,
    });

    expect(result.diagnostics.filter((diagnostic) => diagnostic.path === "configured/optional/SKILL.md"))
      .toEqual([]);
  });

  it("rejects an action declaration in an explicitly action-free configured skill", () => {
    const root = clonePortableInventoryWorkspace();
    const path = resolve(root, "configured/serialized-build/SKILL.md");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "---\nname: serialized-build-commands\nagent_action: start-feature\n---\nBody.\n");

    const result = validatePortableModelAuthorityInventory({
      configuredSkillPaths: [{ expectedAgentAction: null, path }],
      workspaceRoot: root,
    });

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "PORTABLE_ASSET_ACTION_CONFLICT",
      path: "configured/serialized-build/SKILL.md",
    }));
  });

  it("fails a zero-selected or missing managed inventory instead of passing vacuously", () => {
    const root = mkdtempSync(resolve(tmpdir(), "hepha-portable-inventory-"));
    mkdirSync(resolve(root, "docs/architecture"), { recursive: true });
    writeFileSync(resolve(root, "docs/architecture/project-hepha-asset-inventory.json"),
      JSON.stringify({ managedAssetGroups: [], projectOwnedAssets: [] }));

    const result = validatePortableModelAuthorityInventory({ workspaceRoot: root });

    expect(result.selectedAssetCount).toBe(0);
    expect(result.diagnostics.map((entry) => entry.code)).toContain("PORTABLE_ASSET_INVENTORY_EMPTY");
  });
});

function clonePortableInventoryWorkspace(): string {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-portable-inventory-"));
  const paths = [
    "docs/architecture/project-hepha-asset-inventory.json",
    ".hepha/README.md",
    ".hepha/agents",
    ".hepha/commands",
    ".hepha/context",
    ".hepha/safety",
    ".hepha/schemas",
    ".hepha/skills",
    ".workflows",
    "pi-packages",
  ];
  for (const relativePath of paths) {
    const source = resolve(workspaceRoot, relativePath);
    const destination = resolve(root, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, { recursive: true });
  }
  return root;
}
