import type { AgentActionId } from "@hepha/shared";
import { isMap, parseDocument } from "yaml";

export type PortableAssetKind = "agent" | "command" | "skill" | "workflow" | "yaml";

export type PortableAssetDiagnosticCode =
  | "PORTABLE_ASSET_ACTION_CONFLICT"
  | "PORTABLE_ASSET_ACTION_INVALID"
  | "PORTABLE_ASSET_DUPLICATE_KEY"
  | "PORTABLE_ASSET_FRONTMATTER_INVALID"
  | "PORTABLE_ASSET_HOST_AUTHORITY_MISSING"
  | "PORTABLE_ASSET_ROUTING_DIRECTIVE_FORBIDDEN"
  | "PORTABLE_ASSET_ROUTING_FIELD_FORBIDDEN"
  | "PORTABLE_ASSET_YAML_INVALID";

export interface PortableAssetDiagnostic {
  readonly code: PortableAssetDiagnosticCode;
  readonly field: string;
}

export interface PortableAssetValidationOptions {
  /** Omitted permits optional registered metadata; null forbids action metadata; an ID requires an exact match. */
  readonly expectedAgentAction?: AgentActionId | null;
  readonly isRegisteredAction?: (action: AgentActionId) => boolean;
  readonly kind: PortableAssetKind;
  readonly requireDirectHostAuthority?: boolean;
}

export interface PortableAssetValidationResult {
  readonly agentAction: AgentActionId | null;
  readonly diagnostics: readonly PortableAssetDiagnostic[];
}

const prohibitedRoutingKeys = new Set([
  "authentication",
  "credential",
  "credentials",
  "effort",
  "fallbackmodel",
  "model",
  "modelclass",
  "modelid",
  "modelpolicy",
  "provider",
  "providerid",
  "route",
  "routing",
  "routingeffort",
]);
const directHostRequiredFragments = [
  "`direct_host`",
  "current Pi, Codex, or Claude Code session",
  "owns model selection",
  "Do not query Hepha routing policy",
  "does not fabricate an orchestrated receipt",
  "explicit Hepha launcher or dashboard dispatch",
] as const;

/** Validates one YAML or Markdown asset without reading routing policy or normalizing legacy fields. */
export function validatePortableAssetSource(
  source: string,
  options: PortableAssetValidationOptions,
): PortableAssetValidationResult {
  const diagnostics: PortableAssetDiagnostic[] = [];
  const parsed = options.kind === "command" || options.kind === "skill"
    ? parseMarkdownAsset(source, diagnostics)
    : parseYamlAsset(source, diagnostics);
  if (parsed === null) return { agentAction: null, diagnostics };

  inspectMetadata(parsed, diagnostics, options.kind);
  const agentAction = readAgentAction(parsed, diagnostics, options);

  if (options.kind === "command" || options.kind === "skill") {
    const body = markdownBody(source);
    if (containsRoutingDirective(body)) {
      diagnostics.push({ code: "PORTABLE_ASSET_ROUTING_DIRECTIVE_FORBIDDEN", field: "(body)" });
    }
    if (options.requireDirectHostAuthority) {
      const normalizedBody = body.replace(/\s+/gu, " ");
      for (const fragment of directHostRequiredFragments) {
        if (!normalizedBody.includes(fragment)) {
          diagnostics.push({ code: "PORTABLE_ASSET_HOST_AUTHORITY_MISSING", field: "(body)" });
          break;
        }
      }
    }
  }

  return { agentAction, diagnostics: uniqueDiagnostics(diagnostics) };
}

function parseMarkdownAsset(
  source: string,
  diagnostics: PortableAssetDiagnostic[],
): Record<string, unknown> | null {
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) return {};
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(source);
  if (!match) {
    diagnostics.push({ code: "PORTABLE_ASSET_FRONTMATTER_INVALID", field: "(frontmatter)" });
    return null;
  }
  return parseYamlRecord(match[1], diagnostics, "PORTABLE_ASSET_FRONTMATTER_INVALID");
}

function parseYamlAsset(
  source: string,
  diagnostics: PortableAssetDiagnostic[],
): Record<string, unknown> | null {
  return parseYamlRecord(source, diagnostics, "PORTABLE_ASSET_YAML_INVALID");
}

function parseYamlRecord(
  source: string,
  diagnostics: PortableAssetDiagnostic[],
  invalidCode: Extract<PortableAssetDiagnosticCode, "PORTABLE_ASSET_FRONTMATTER_INVALID" | "PORTABLE_ASSET_YAML_INVALID">,
): Record<string, unknown> | null {
  let document: ReturnType<typeof parseDocument>;
  try {
    document = parseDocument(source, { uniqueKeys: true });
  } catch {
    diagnostics.push({ code: invalidCode, field: "(yaml)" });
    return null;
  }
  if (document.errors.some((error) => error.code === "DUPLICATE_KEY")) {
    diagnostics.push({ code: "PORTABLE_ASSET_DUPLICATE_KEY", field: "(yaml)" });
    return null;
  }
  if (document.errors.length > 0 || !isMap(document.contents)) {
    diagnostics.push({ code: invalidCode, field: "(yaml)" });
    return null;
  }
  try {
    const value = document.toJS();
    return isRecord(value) ? value : null;
  } catch {
    diagnostics.push({ code: invalidCode, field: "(yaml)" });
    return null;
  }
}

function inspectMetadata(
  value: Record<string, unknown>,
  diagnostics: PortableAssetDiagnostic[],
  kind: PortableAssetKind,
  path = "",
): void {
  for (const [key, nested] of Object.entries(value)) {
    const field = path ? `${path}.${key}` : key;
    const normalizedKey = key.toLowerCase().replaceAll("-", "").replaceAll("_", "");
    if (prohibitedRoutingKeys.has(normalizedKey)) {
      diagnostics.push({ code: "PORTABLE_ASSET_ROUTING_FIELD_FORBIDDEN", field });
    }
    if (kind !== "workflow" && ((key === "agent_action" && path) || key === "agentAction")) {
      diagnostics.push({ code: "PORTABLE_ASSET_ACTION_INVALID", field });
    }
    if (Array.isArray(nested)) {
      nested.forEach((entry, index) => {
        if (isRecord(entry)) inspectMetadata(entry, diagnostics, kind, `${field}[${index}]`);
      });
    } else if (isRecord(nested)) {
      inspectMetadata(nested, diagnostics, kind, field);
    }
  }
}

function readAgentAction(
  value: Record<string, unknown>,
  diagnostics: PortableAssetDiagnostic[],
  options: PortableAssetValidationOptions,
): AgentActionId | null {
  const rawAction = value.agent_action;
  if (rawAction !== undefined && options.kind !== "command" && options.kind !== "skill") {
    diagnostics.push({ code: "PORTABLE_ASSET_ACTION_INVALID", field: "agent_action" });
    return null;
  }
  if (options.expectedAgentAction === null) {
    if (rawAction !== undefined) {
      diagnostics.push({ code: "PORTABLE_ASSET_ACTION_CONFLICT", field: "agent_action" });
    }
    return null;
  }
  if (rawAction === undefined) {
    if (options.expectedAgentAction !== undefined) {
      diagnostics.push({ code: "PORTABLE_ASSET_ACTION_CONFLICT", field: "agent_action" });
    }
    return null;
  }
  if (!isAgentActionId(rawAction)) {
    diagnostics.push({ code: "PORTABLE_ASSET_ACTION_INVALID", field: "agent_action" });
    return null;
  }
  if (options.isRegisteredAction && !options.isRegisteredAction(rawAction)) {
    diagnostics.push({ code: "PORTABLE_ASSET_ACTION_INVALID", field: "agent_action" });
  }
  if (options.expectedAgentAction !== undefined && rawAction !== options.expectedAgentAction) {
    diagnostics.push({ code: "PORTABLE_ASSET_ACTION_CONFLICT", field: "agent_action" });
  }
  return rawAction;
}

function markdownBody(source: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u.exec(source);
  return match ? source.slice(match[0].length) : source;
}

function containsRoutingDirective(body: string): boolean {
  return routingDirectiveClauses(body).some((clause) => {
    if (!clause || isNegatedDirectiveClause(clause)) return false;
    if (hasHostSwitchDirective(clause) || hasPolicyAccessDirective(clause) || hasTransferDirective(clause)) {
      return true;
    }

    const domainOperation = matchDomainRecordInstruction(clause);
    if (domainOperation) {
      const remainingText = clause.slice(domainOperation[0].length).trim();
      return remainingText.length > 0 && hasRoutingChoiceDirective(remainingText);
    }
    return hasRoutingChoiceDirective(clause);
  });
}

function routingDirectiveClauses(body: string): string[] {
  return body
    .replace(/\r\n/gu, "\n")
    .replace(/\n(?=\s*(?:[-*+]|\d+[.)])\s+)/gu, ". ")
    .replace(/\n{2,}/gu, ". ")
    .replace(/\n/gu, " ")
    .split(/(?:[.!?;]\s+|\s*[,]\s*(?:and\s+)?then\s+|\s+\b(?:and\s+then|but|however|instead)\b\s+)/giu)
    .map((clause) => clause.replace(/^[\s>*#`\-+\d.)]+/gu, "").replace(/\s+/gu, " ").trim().toLowerCase())
    .filter(Boolean);
}

function isNegatedDirectiveClause(clause: string): boolean {
  return /^(?:please\s+)?(?:do not|does not|must not|never|cannot|can't|forbid|forbidden|omit|omits|no\s+(?:automatic\s+)?(?:model|provider|route|routing|handoff|transfer))\b/u.test(clause);
}

function matchDomainRecordInstruction(clause: string): RegExpMatchArray | null {
  return clause.match(/^(?:select|choose|set|change|validate|read|check|compare)\s+(?:(?:a|the)\s+)?(?:(?:product|domain)\s+)?(?:model|provider)\s+(?:records?|entities|metadata(?:\s+records?)?|catalog(?:ue)?(?:\s+records?)?|data|details?)(?=\b|\s)/u);
}

function hasHostSwitchDirective(clause: string): boolean {
  return /(^|\s)\/(?:model|provider)\b/u.test(clause);
}

function hasRoutingChoiceDirective(clause: string): boolean {
  return /\b(?:select|choose|set|change|switch|override|recommend|validate)\b.{0,72}\b(?:coding-agent\s+)?(?:models?|providers?|model class|model id|routes?|routing effort)\b/u.test(clause)
    || /\b(?:request|route)\b.{0,72}\b(?:models?|providers?)(?:\s+switch)?\b/u.test(clause)
    || /\b(?:fall back|fallback)\b.{0,72}\b(?:models?|providers?|routes?|routing policy|global default)\b/u.test(clause);
}

function hasPolicyAccessDirective(clause: string): boolean {
  return /\b(?:query|consult|read|check|compare|match)\b.{0,72}\b(?:hepha\s+)?(?:routing|model)\s+policy\b/u.test(clause)
    || /\b(?:query|consult|read|check|compare|match)\b.{0,72}\b(?:route|model)\b.{0,72}\b(?:hepha\s+)?policy\b/u.test(clause);
}

function hasTransferDirective(clause: string): boolean {
  return /\b(?:automatic(?:ally)?\s+)?(?:handoff|hand off|transfer)\b.{0,72}\b(?:route|model)\s*(?:-|\s)?mismatch\b/u.test(clause)
    || /\b(?:route|model)\s*(?:-|\s)?mismatch\b.{0,72}\b(?:automatic(?:ally)?\s+)?(?:handoff|hand off|transfer)\b/u.test(clause)
    || /\bautomatic(?:ally)?\b.{0,48}\b(?:handoff|hand off|transfer)\b/u.test(clause)
    || /\b(?:handoff|hand off|transfer)\b.{0,32}\bautomatically\b/u.test(clause);
}

function uniqueDiagnostics(diagnostics: readonly PortableAssetDiagnostic[]): PortableAssetDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.code}:${diagnostic.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isAgentActionId(value: unknown): value is AgentActionId {
  return typeof value === "string" && value.trim() === value && value.length <= 128
    && /^[a-z][a-z0-9-]*$/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
