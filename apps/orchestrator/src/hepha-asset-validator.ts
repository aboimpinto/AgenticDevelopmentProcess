import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { validatePortableAssetSource } from "./portable-asset-contract.js";

/**
 * Pure asset contract validation helpers for `.hepha` command templates,
 * agent definitions, context packs, and output schemas.
 *
 * Each helper returns an array of error strings. An empty array means the
 * asset satisfies the expected contract for its field type.
 *
 * All helpers operate on the resolved `.hepha` path relative to workspaceRoot.
 */

// ---------------------------------------------------------------------------
// Directory and extension map
// ---------------------------------------------------------------------------

interface AssetFieldContract {
  /** Expected directory prefix under `.hepha/`, e.g. `commands/`. */
  directoryPrefix: string;
  /** Expected file suffix, e.g. `.md`, `.agent.yaml`. */
  suffix: string;
}

const fieldContract: Record<string, AssetFieldContract> = {
  command: { directoryPrefix: "commands/", suffix: ".md" },
  agent: { directoryPrefix: "agents/", suffix: ".agent.yaml" },
  context: { directoryPrefix: "context/", suffix: ".context.yaml" },
  output_schema: { directoryPrefix: "schemas/", suffix: ".schema.json" },
};

// ---------------------------------------------------------------------------
// Resolve a `.hepha`-relative path to an absolute filesystem path.
// ---------------------------------------------------------------------------

function resolveHephaPath(workspaceRoot: string, ref: string): string {
  return resolve(workspaceRoot, ".hepha", ref);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// 1. Command template validation
// ---------------------------------------------------------------------------

/**
 * Validate a command template file.
 *
 * A valid command template is a Markdown file under `.hepha/commands/*.md`
 * with non-empty body after stripping optional YAML frontmatter.
 */
export function validateCommandTemplate(workspaceRoot: string, ref: string): string[] {
  const errors: string[] = [];
  const absPath = resolveHephaPath(workspaceRoot, ref);

  if (!existsSync(absPath)) {
    return [`File does not exist: ${absPath}`];
  }

  let content: string;

  try {
    content = readFileSync(absPath, "utf8");
  } catch {
    errors.push(`Cannot read file: ${absPath}`);
    return errors;
  }

  if (content.trim().length === 0) {
    errors.push(`Command template is empty: ${absPath}`);
    return errors;
  }

  const body = stripYamlFrontmatter(content);

  if (body.trim().length === 0) {
    errors.push(`Command template has empty body after frontmatter: ${absPath}`);
  }

  for (const diagnostic of validatePortableAssetSource(content, { kind: "command" }).diagnostics) {
    errors.push(`${diagnostic.code} at ${diagnostic.field}: ${absPath}`);
  }

  return errors;
}

/**
 * Strip optional YAML frontmatter from a Markdown string.
 * Returns the remainder after the closing `---`.
 */
function stripYamlFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---")) {
    return markdown;
  }

  // Match opening ---, content, closing --- (with optional leading whitespace/newline on last line)
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(markdown);

  if (!match) {
    return markdown;
  }

  return markdown.slice(match[0].length);
}

// ---------------------------------------------------------------------------
// 2. Agent definition validation
// ---------------------------------------------------------------------------

/**
 * Validate an agent definition file.
 *
 * A valid agent definition is a model-neutral YAML file under
 * `.hepha/agents/*.agent.yaml` with at least `name` and `responsibilities`
 * (string list). Model, provider, route, policy, fallback, and credential
 * metadata are rejected because the Agent Registry and resolver own them.
 */
export function validateAgentDefinition(workspaceRoot: string, ref: string): string[] {
  const errors: string[] = [];
  const absPath = resolveHephaPath(workspaceRoot, ref);

  if (!existsSync(absPath)) {
    return [`File does not exist: ${absPath}`];
  }

  let parsed: unknown;

  try {
    parsed = parseYaml(readFileSync(absPath, "utf8"));
  } catch {
    errors.push(`Cannot parse agent definition as YAML: ${absPath}`);
    return errors;
  }

  if (!isRecord(parsed)) {
    errors.push(`Agent definition must be a YAML object: ${absPath}`);
    return errors;
  }

  // name: required non-empty string
  if (typeof parsed.name !== "string" || !parsed.name.trim()) {
    errors.push(`Agent definition missing required string field "name": ${absPath}`);
  }

  // responsibilities: required non-empty array of strings
  if (!Array.isArray(parsed.responsibilities) || parsed.responsibilities.length === 0) {
    errors.push(`Agent definition missing required non-empty array field "responsibilities": ${absPath}`);
  } else if (parsed.responsibilities.some((r: unknown) => typeof r !== "string")) {
    errors.push(`Agent definition "responsibilities" must be an array of strings: ${absPath}`);
  }

  for (const diagnostic of validatePortableAssetSource(readFileSync(absPath, "utf8"), { kind: "agent" }).diagnostics) {
    errors.push(`${diagnostic.code} at ${diagnostic.field}: ${absPath}`);
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 3. Context pack validation
// ---------------------------------------------------------------------------

/**
 * Validate a context pack file.
 *
 * A valid context pack is a YAML file under `.hepha/context/*.context.yaml`
 * with at least `name` (string), `required` (string list), and `constraints`
 * (string list).
 */
export function validateContextPack(workspaceRoot: string, ref: string): string[] {
  const errors: string[] = [];
  const absPath = resolveHephaPath(workspaceRoot, ref);

  if (!existsSync(absPath)) {
    return [`File does not exist: ${absPath}`];
  }

  let parsed: unknown;

  try {
    parsed = parseYaml(readFileSync(absPath, "utf8"));
  } catch {
    errors.push(`Cannot parse context pack as YAML: ${absPath}`);
    return errors;
  }

  if (!isRecord(parsed)) {
    errors.push(`Context pack must be a YAML object: ${absPath}`);
    return errors;
  }

  // name: required non-empty string
  if (typeof parsed.name !== "string" || !parsed.name.trim()) {
    errors.push(`Context pack missing required string field "name": ${absPath}`);
  }

  // required: required array of strings
  if (!Array.isArray(parsed.required)) {
    errors.push(`Context pack missing required array field "required": ${absPath}`);
  } else if (parsed.required.some((r: unknown) => typeof r !== "string")) {
    errors.push(`Context pack "required" must be an array of strings: ${absPath}`);
  }

  // constraints: required array of strings
  if (!Array.isArray(parsed.constraints)) {
    errors.push(`Context pack missing required array field "constraints": ${absPath}`);
  } else if (parsed.constraints.some((c: unknown) => typeof c !== "string")) {
    errors.push(`Context pack "constraints" must be an array of strings: ${absPath}`);
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 4. Output schema validation
// ---------------------------------------------------------------------------

/**
 * Validate an output schema file.
 *
 * A valid output schema is a parseable JSON file under `.hepha/schemas/*.schema.json`
 * whose top-level value is an object (not array, not scalar).
 */
export function validateOutputSchema(workspaceRoot: string, ref: string): string[] {
  const errors: string[] = [];
  const absPath = resolveHephaPath(workspaceRoot, ref);

  if (!existsSync(absPath)) {
    return [`File does not exist: ${absPath}`];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(absPath, "utf8"));
  } catch {
    errors.push(`Cannot parse output schema as JSON: ${absPath}`);
    return errors;
  }

  if (!isRecord(parsed)) {
    errors.push(`Output schema must be a JSON object, got ${typeof parsed === "object" ? "array" : typeof parsed}: ${absPath}`);
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 5. Incompatible reference validation
// ---------------------------------------------------------------------------

/**
 * Check that a workflow asset reference uses the expected directory and
 * file extension for its field.
 *
 * Returns an error string if the reference is incompatible, or `null` if it
 * is compatible.
 */
export function checkIncompatibleReference(ref: string, field: string): string | null {
  const contract = fieldContract[field];

  if (!contract) {
    return `Unknown asset field "${field}": expected one of ${Object.keys(fieldContract).join(", ")}`;
  }

  if (!ref.startsWith(contract.directoryPrefix)) {
    return `Reference "${ref}" for field "${field}" should start with "${contract.directoryPrefix}"`;
  }

  if (!ref.endsWith(contract.suffix)) {
    return `Reference "${ref}" for field "${field}" should end with "${contract.suffix}"`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// 6. Dispatcher: validate an asset's content based on its field
// ---------------------------------------------------------------------------

/**
 * Validate the content of a `.hepha` asset based on its field type.
 *
 * The `ref` is the path relative to `.hepha` (e.g. `commands/design-feature.md`).
 * Returns an array of error strings (empty = valid).
 */
export function validateAssetContent(workspaceRoot: string, ref: string, field: string): string[] {
  switch (field) {
    case "command":
      return validateCommandTemplate(workspaceRoot, ref);
    case "agent":
      return validateAgentDefinition(workspaceRoot, ref);
    case "context":
      return validateContextPack(workspaceRoot, ref);
    case "output_schema":
      return validateOutputSchema(workspaceRoot, ref);
    default:
      return [`Unknown asset field "${field}"`];
  }
}
