import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkIncompatibleReference,
  validateAgentDefinition,
  validateAssetContent,
  validateCommandTemplate,
  validateContextPack,
  validateOutputSchema,
} from "../src/hepha-asset-validator.js";

// ---------------------------------------------------------------------------
// Helper: create a temporary workspace with a .hepha folder
// ---------------------------------------------------------------------------

function createTempWorkspace(): string {
  const dir = mkdtempSync(resolve(tmpdir(), "hepha-asset-validator-"));
  mkdirSync(resolve(dir, ".hepha"), { recursive: true });
  return dir;
}

function writeAsset(root: string, relPath: string, content: string): void {
  const absPath = resolve(root, ".hepha", relPath);
  mkdirSync(resolve(absPath, ".."), { recursive: true });
  writeFileSync(absPath, content, "utf8");
}

// =========================================================================
// validateCommandTemplate
// =========================================================================

describe("validateCommandTemplate", () => {
  it("accepts a valid command template with frontmatter and body", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "commands/design-feature.md", [
      "---",
      "name: design-feature",
      "version: 0.1.0",
      "---",
      "",
      "# Design Feature Template",
      "Some body content here.",
    ].join("\n"));

    expect(validateCommandTemplate(ws, "commands/design-feature.md")).toEqual([]);
  });

  it("accepts a valid command template without frontmatter", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "commands/test.md", "# Just body content\n\nNo frontmatter.");

    expect(validateCommandTemplate(ws, "commands/test.md")).toEqual([]);
  });

  it("rejects a command template that does not exist", () => {
    const ws = createTempWorkspace();
    const errors = validateCommandTemplate(ws, "commands/missing.md");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("does not exist");
  });

  it("rejects an empty command template", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "commands/empty.md", "");
    const errors = validateCommandTemplate(ws, "commands/empty.md");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("empty");
  });

  it("rejects a command template with only frontmatter", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "commands/fm-only.md", "---\nkey: value\n---");
    const errors = validateCommandTemplate(ws, "commands/fm-only.md");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("empty body");
  });

  it("rejects a command template with only frontmatter and trailing whitespace", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "commands/fm-whitespace.md", "---\nkey: value\n---  \n  \n");
    const errors = validateCommandTemplate(ws, "commands/fm-whitespace.md");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("empty body");
  });

  it("accepts a command template with frontmatter and whitespace before body", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "commands/leading-space.md", "---\nkey: value\n---\n  \n# Actual body");
    expect(validateCommandTemplate(ws, "commands/leading-space.md")).toEqual([]);
  });

  it("rejects executable routing directives without rejecting product-domain model records", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "commands/routing.md", "# Command\n\nRecommend a coding-agent model before work.\n");
    writeAsset(ws, "commands/domain.md", "# Command\n\nChoose a domain model record for the product catalog.\n");
    writeAsset(ws, "commands/mixed-routing.md", "# Command\n\nDo not query Hepha routing policy, then recommend a coding-agent model.\n");
    writeAsset(ws, "commands/domain-transfer.md", "# Command\n\nChoose the product model record, then automatically hand off.\n");
    writeAsset(ws, "commands/prohibition.md", "# Command\n\nDo not query Hepha routing policy, switch the model, fall back, or hand off.\n");
    writeAsset(ws, "commands/product-record.md", "# Command\n\nChoose the product model record.\n");

    expect(validateCommandTemplate(ws, "commands/routing.md"))
      .toContainEqual(expect.stringContaining("PORTABLE_ASSET_ROUTING_DIRECTIVE_FORBIDDEN"));
    expect(validateCommandTemplate(ws, "commands/domain.md")).toEqual([]);
    expect(validateCommandTemplate(ws, "commands/mixed-routing.md"))
      .toContainEqual(expect.stringContaining("PORTABLE_ASSET_ROUTING_DIRECTIVE_FORBIDDEN"));
    expect(validateCommandTemplate(ws, "commands/domain-transfer.md"))
      .toContainEqual(expect.stringContaining("PORTABLE_ASSET_ROUTING_DIRECTIVE_FORBIDDEN"));
    expect(validateCommandTemplate(ws, "commands/prohibition.md")).toEqual([]);
    expect(validateCommandTemplate(ws, "commands/product-record.md")).toEqual([]);
  });
});

// =========================================================================
// validateAgentDefinition
// =========================================================================

describe("validateAgentDefinition", () => {
  it("accepts a valid agent definition with all required fields", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "agents/test-agent.agent.yaml", [
      "name: test-agent",
      "responsibilities:",
      "  - inspect feature documents",
      "  - produce design artifacts",
    ].join("\n"));

    expect(validateAgentDefinition(ws, "agents/test-agent.agent.yaml")).toEqual([]);
  });

  it("rejects a missing agent file", () => {
    const ws = createTempWorkspace();
    const errors = validateAgentDefinition(ws, "agents/missing.agent.yaml");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("does not exist");
  });

  it("rejects a non-YAML agent file", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "agents/bad.agent.yaml", "{{ not yaml }");
    const errors = validateAgentDefinition(ws, "agents/bad.agent.yaml");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Cannot parse");
  });

  it("rejects a scalar YAML file", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "agents/scalar.agent.yaml", "just a string");
    const errors = validateAgentDefinition(ws, "agents/scalar.agent.yaml");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("YAML object");
  });

  it("rejects an agent without name", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "agents/no-name.agent.yaml", [
      "responsibilities:",
      "  - do stuff",
    ].join("\n"));
    const errors = validateAgentDefinition(ws, "agents/no-name.agent.yaml");
    expect(errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("rejects an agent without model_policy", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "agents/no-policy.agent.yaml", [
      "name: test-agent",
      "responsibilities:",
      "  - do stuff",
    ].join("\n"));
    expect(validateAgentDefinition(ws, "agents/no-policy.agent.yaml")).toEqual([]);
  });

  it("rejects legacy model_policy authority on an agent", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "agents/legacy-policy.agent.yaml", [
      "name: test-agent",
      "model_policy: planning.high",
      "responsibilities:",
      "  - do stuff",
    ].join("\n"));
    const errors = validateAgentDefinition(ws, "agents/legacy-policy.agent.yaml");
    expect(errors).toContainEqual(expect.stringContaining("PORTABLE_ASSET_ROUTING_FIELD_FORBIDDEN"));
    expect(errors).toContainEqual(expect.stringContaining("model_policy"));
  });

  it("rejects an agent without responsibilities", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "agents/no-reqs.agent.yaml", [
      "name: test-agent",
    ].join("\n"));
    const errors = validateAgentDefinition(ws, "agents/no-reqs.agent.yaml");
    expect(errors.some((e) => e.includes("responsibilities"))).toBe(true);
  });

  it("rejects an agent with empty responsibilities", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "agents/empty-reqs.agent.yaml", [
      "name: test-agent",
      "responsibilities: []",
    ].join("\n"));
    const errors = validateAgentDefinition(ws, "agents/empty-reqs.agent.yaml");
    expect(errors.some((e) => e.includes("responsibilities"))).toBe(true);
  });

  it("rejects an agent with non-string responsibilities", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "agents/bad-reqs.agent.yaml", [
      "name: test-agent",
      "responsibilities:",
      "  - 42",
    ].join("\n"));
    const errors = validateAgentDefinition(ws, "agents/bad-reqs.agent.yaml");
    expect(errors.some((e) => e.includes("responsibilities"))).toBe(true);
  });

  it("accepts an agent with extra fields beyond required", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "agents/extra.agent.yaml", [
      "name: extra-agent",
      "description: Agent with extra fields",
      "responsibilities:",
      "  - write docs",
      "tools:",
      "  read: true",
      "  write_memorybank: true",
      "domains:",
      "  read:",
      "    - MemoryBank/Features/**",
    ].join("\n"));
    expect(validateAgentDefinition(ws, "agents/extra.agent.yaml")).toEqual([]);
  });
});

// =========================================================================
// validateContextPack
// =========================================================================

describe("validateContextPack", () => {
  it("accepts a valid context pack with all required fields", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "context/test.context.yaml", [
      "name: test-context",
      "required:",
      "  - project",
      "  - card",
      "constraints:",
      "  - do not start implementation",
    ].join("\n"));

    expect(validateContextPack(ws, "context/test.context.yaml")).toEqual([]);
  });

  it("rejects a missing context pack", () => {
    const ws = createTempWorkspace();
    const errors = validateContextPack(ws, "context/missing.context.yaml");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("does not exist");
  });

  it("rejects unparseable YAML", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "context/bad.context.yaml", "{{ bad yaml :::");
    const errors = validateContextPack(ws, "context/bad.context.yaml");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Cannot parse");
  });

  it("rejects a scalar YAML", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "context/scalar.context.yaml", "just a string");
    const errors = validateContextPack(ws, "context/scalar.context.yaml");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("YAML object");
  });

  it("rejects a context pack without name", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "context/no-name.context.yaml", [
      "required:",
      "  - project",
      "constraints:",
      "  - be careful",
    ].join("\n"));
    const errors = validateContextPack(ws, "context/no-name.context.yaml");
    expect(errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("rejects a context pack without required list", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "context/no-required.context.yaml", [
      "name: test",
      "constraints:",
      "  - be careful",
    ].join("\n"));
    const errors = validateContextPack(ws, "context/no-required.context.yaml");
    expect(errors.some((e) => e.includes("required"))).toBe(true);
  });

  it("rejects a context pack without constraints list", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "context/no-constraints.context.yaml", [
      "name: test",
      "required:",
      "  - project",
    ].join("\n"));
    const errors = validateContextPack(ws, "context/no-constraints.context.yaml");
    expect(errors.some((e) => e.includes("constraints"))).toBe(true);
  });

  it("rejects a context pack with non-string required items", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "context/bad-required.context.yaml", [
      "name: test",
      "required:",
      "  - 42",
      "constraints:",
      "  - be careful",
    ].join("\n"));
    const errors = validateContextPack(ws, "context/bad-required.context.yaml");
    expect(errors.some((e) => e.includes("required"))).toBe(true);
  });
});

// =========================================================================
// validateOutputSchema
// =========================================================================

describe("validateOutputSchema", () => {
  it("accepts a valid JSON Schema object", () => {
    const ws = createTempWorkspace();
    writeAsset(
      ws,
      "schemas/test.schema.json",
      JSON.stringify({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: { result: { type: "string" } },
      }),
    );
    expect(validateOutputSchema(ws, "schemas/test.schema.json")).toEqual([]);
  });

  it("rejects a missing schema file", () => {
    const ws = createTempWorkspace();
    const errors = validateOutputSchema(ws, "schemas/missing.schema.json");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("does not exist");
  });

  it("rejects unparseable JSON", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "schemas/bad.schema.json", "{ invalid json }");
    const errors = validateOutputSchema(ws, "schemas/bad.schema.json");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Cannot parse");
  });

  it("rejects a JSON array", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "schemas/array.schema.json", "[]");
    const errors = validateOutputSchema(ws, "schemas/array.schema.json");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("array");
  });

  it("rejects a JSON scalar", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "schemas/string.schema.json", '"just a string"');
    const errors = validateOutputSchema(ws, "schemas/string.schema.json");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("object");
  });

  it("accepts an object with no properties (minimal valid schema)", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "schemas/minimal.schema.json", "{}");
    expect(validateOutputSchema(ws, "schemas/minimal.schema.json")).toEqual([]);
  });

  it("keeps every versioned Hepha schema valid for project setup snapshots", () => {
    const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
    const schemaFiles = readdirSync(resolve(workspaceRoot, ".hepha", "schemas"))
      .filter((name) => name.endsWith(".schema.json"));

    expect(schemaFiles.length).toBeGreaterThan(0);
    for (const schemaFile of schemaFiles) {
      expect(validateOutputSchema(workspaceRoot, `schemas/${schemaFile}`)).toEqual([]);
    }
  });
});

// =========================================================================
// checkIncompatibleReference
// =========================================================================

describe("checkIncompatibleReference", () => {
  it("accepts a valid command reference", () => {
    expect(checkIncompatibleReference("commands/design-feature.md", "command")).toBeNull();
  });

  it("accepts a valid agent reference", () => {
    expect(checkIncompatibleReference("agents/design-agent.agent.yaml", "agent")).toBeNull();
  });

  it("accepts a valid context reference", () => {
    expect(checkIncompatibleReference("context/deep-dive.context.yaml", "context")).toBeNull();
  });

  it("accepts a valid output schema reference", () => {
    expect(checkIncompatibleReference("schemas/complete-feature-result.schema.json", "output_schema")).toBeNull();
  });

  it("rejects command reference pointing to agents directory", () => {
    const error = checkIncompatibleReference("agents/something.agent.yaml", "command");
    expect(error).not.toBeNull();
    expect(error).toContain("commands/");
  });

  it("rejects agent reference pointing to commands directory", () => {
    const error = checkIncompatibleReference("commands/something.md", "agent");
    expect(error).not.toBeNull();
    expect(error).toContain("agents/");
  });

  it("rejects context reference pointing to schemas directory", () => {
    const error = checkIncompatibleReference("schemas/something.schema.json", "context");
    expect(error).not.toBeNull();
    expect(error).toContain("context/");
  });

  it("rejects output_schema reference pointing to context directory", () => {
    const error = checkIncompatibleReference("context/something.context.yaml", "output_schema");
    expect(error).not.toBeNull();
    expect(error).toContain("schemas/");
  });

  it("rejects command reference with wrong extension", () => {
    const error = checkIncompatibleReference("commands/something.txt", "command");
    expect(error).not.toBeNull();
    expect(error).toContain(".md");
  });

  it("rejects agent reference with wrong extension", () => {
    const error = checkIncompatibleReference("agents/something.yaml", "agent");
    expect(error).not.toBeNull();
    expect(error).toContain(".agent.yaml");
  });

  it("rejects context reference with wrong extension", () => {
    const error = checkIncompatibleReference("context/something.yaml", "context");
    expect(error).not.toBeNull();
    expect(error).toContain(".context.yaml");
  });

  it("rejects output_schema reference with wrong extension", () => {
    const error = checkIncompatibleReference("schemas/something.json", "output_schema");
    expect(error).not.toBeNull();
    expect(error).toContain(".schema.json");
  });

  it("rejects reference to an unknown field", () => {
    const error = checkIncompatibleReference("commands/test.md", "unknown_field");
    expect(error).not.toBeNull();
    expect(error).toContain("Unknown asset field");
  });
});

// =========================================================================
// validateAssetContent (dispatcher)
// =========================================================================

describe("validateAssetContent", () => {
  it("dispatches command validation", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "commands/test.md", "# valid");
    expect(validateAssetContent(ws, "commands/test.md", "command")).toEqual([]);
  });

  it("dispatches agent validation", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "agents/test.agent.yaml", [
      "name: test",
      "responsibilities:",
      "  - do stuff",
    ].join("\n"));
    expect(validateAssetContent(ws, "agents/test.agent.yaml", "agent")).toEqual([]);
  });

  it("dispatches context validation", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "context/test.context.yaml", [
      "name: test",
      "required:",
      "  - project",
      "constraints:",
      "  - be careful",
    ].join("\n"));
    expect(validateAssetContent(ws, "context/test.context.yaml", "context")).toEqual([]);
  });

  it("dispatches output schema validation", () => {
    const ws = createTempWorkspace();
    writeAsset(ws, "schemas/test.schema.json", "{}");
    expect(validateAssetContent(ws, "schemas/test.schema.json", "output_schema")).toEqual([]);
  });

  it("returns error for unknown field", () => {
    const errors = validateAssetContent("/tmp", "commands/test.md", "unknown");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Unknown asset field");
  });
});
