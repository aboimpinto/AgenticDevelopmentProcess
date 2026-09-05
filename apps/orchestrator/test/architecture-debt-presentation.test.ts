// Behavior suite: architecture debt.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  projectArchitectureDebtRegister,
  renderArchitectureDebtMarkdown,
  type ArchitectureDebtRegisterProjection,
} from "../src/architecture-debt-presentation.js";

const hash = (character: string) => character.repeat(64);
const recordA = `ARCH-DEBT-${"a".repeat(32)}`;
const recordB = `ARCH-DEBT-${"b".repeat(32)}`;
const refusal = {
  kind: "refusal",
  code: "invalid_input",
  message: "Architecture-debt register is unavailable for safe presentation.",
};

function aggregate(recordId = recordA, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    recordId,
    projectId: "hepha",
    eventVersion: 0,
    state: "PENDING_TRIAGE",
    ownerId: "steward-067",
    rationale: "The historical boundary remains governed debt.",
    risk: "The boundary can drift until the named trigger is reviewed.",
    architecturalBoundary: "rule-scope:orchestrator",
    priority: "P2",
    prioritySource: "AUTO_PENDING_DEFAULT",
    futureTouchTrigger: {
      triggerId: "touch-observed-surface",
      name: "Touch observed surface",
      paths: ["apps/orchestrator/src/debt.ts"],
      symbols: ["evaluateDebt"],
      ruleTags: ["architecture-debt"],
    },
    discovery: {
      featureId: "feat-067",
      phaseNumber: 2,
      reviewGateId: "code-review",
      findingId: "finding-067",
      manifest: { artifactKind: "review_manifest", artifactId: "manifest-067", contentHash: hash("a"), relativePath: "artifacts/manifest-067.json" },
      observation: { artifactKind: "debt_observation", artifactId: "observation-067", contentHash: hash("b"), relativePath: "artifacts/observation-067.json" },
      currentFeatureImpact: "untouched_non_blocking",
    },
    rule: {
      ruleId: "architecture-debt",
      ruleVersion: "1",
      ruleHash: hash("c"),
      catalogHash: hash("d"),
      category: "architecture",
      sourceReference: ".hepha/architecture-rules.yaml",
    },
    locations: [
      { locationId: "location-b", relativePath: "apps/orchestrator/src/debt.ts", symbol: "evaluateDebt", ruleTags: ["architecture-debt"] },
      { locationId: "location-a", relativePath: "apps/orchestrator/src/adapter.ts", endpoint: "readDebt", ruleTags: [] },
    ],
    observationReferences: [{ artifactKind: "debt_observation", artifactId: "observation-067", contentHash: hash("b"), relativePath: "artifacts/observation-067.json" }],
    ...overrides,
  };
}

function source(records: readonly Record<string, unknown>[] = [aggregate()]): Record<string, unknown> {
  return { records };
}

function expectRefusal(input: unknown): void {
  expect(() => projectArchitectureDebtRegister(input)).not.toThrow();
  expect(() => renderArchitectureDebtMarkdown(input)).not.toThrow();
  expect(projectArchitectureDebtRegister(input)).toEqual(refusal);
  expect(renderArchitectureDebtMarkdown(input)).toEqual(refusal);
}

function projectedControl(): ArchitectureDebtRegisterProjection {
  const result = projectArchitectureDebtRegister(source());
  if (result.kind !== "projected") throw new Error("projection control must be valid");
  return result;
}

describe("E013-AD-003: architecture-debt safe projection", () => {
  it("projects every allowlisted field once, deterministically, without raw evidence or authority", () => {
    const rawA = aggregate(recordA);
    const rawB = aggregate(recordB, { ownerId: "owner-067", rationale: "A second safe record." });
    const first = projectArchitectureDebtRegister(source([rawB, rawA]));
    const second = projectArchitectureDebtRegister(source([rawA, rawB]));
    expect(first).toEqual(second);
    expect(first).toMatchObject({ kind: "projected", authority: "presentation_only" });
    if (first.kind !== "projected") return;
    expect(first.records[0]).toMatchObject({ recordId: recordA, state: "PENDING_TRIAGE", eventVersion: 0, ownerId: "steward-067", priority: "P2", prioritySource: "AUTO_PENDING_DEFAULT", futureTouchDecisionSummaries: [] });

    expect(Object.keys(first.records[0] ?? {}).sort()).toEqual(["architecturalBoundary", "discovery", "eventVersion", "futureTouchDecisionSummaries", "futureTouchTrigger", "locations", "ownerId", "priority", "prioritySource", "rationale", "recordId", "risk", "rule", "state"].sort());
    expect(first.records[0]?.locations.map((location) => location.locationId)).toEqual(["location-a", "location-b"]);
    expect(JSON.stringify(first)).not.toContain("contentHash");
    expect(JSON.stringify(first)).not.toContain("artifactId");
    expect(JSON.stringify(first)).not.toContain("projectId");
    expect(JSON.stringify(first)).not.toContain("currentFeatureImpact");
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.records)).toBe(true);
    expect(Object.isFrozen(first.records[0])).toBe(true);
  });

  it("projects a later event that retains its append-only discovery reference", () => {
    const result = projectArchitectureDebtRegister(source([aggregate(recordA, { eventVersion: 1 })]));

    expect(result).toMatchObject({
      kind: "projected",
      records: [{ recordId: recordA, eventVersion: 1 }],
    });
  });

  it("renders only a successful projection in stable record and location order", () => {
    const result = projectArchitectureDebtRegister(source([aggregate(recordA), aggregate(recordB, { ownerId: "owner-067" })]));
    if (result.kind !== "projected") throw new Error("two-record projection control must be valid");
    const projected = { ...result, records: [...result.records].reverse().map((record) => ({ ...record, locations: [...record.locations].reverse() })) };
    const rendered = renderArchitectureDebtMarkdown(projected);
    expect(rendered).toMatchObject({ kind: "rendered", projection: projected });
    if (rendered.kind !== "rendered") return;

    expect(rendered.markdown).toContain("Presentation evidence only");
    expect(rendered.markdown).toContain("cannot create, triage, approve, close, supersede");
    expect(rendered.markdown).toContain(`### ${recordA}`);
    expect(rendered.markdown).toContain("**Owner:** steward-067");
    expect(rendered.markdown).toContain("**Priority:** P2 (AUTO_PENDING_DEFAULT)");
    expect(rendered.markdown).toContain("**Rule:** architecture-debt / 1 / architecture / .hepha/architecture-rules.yaml");
    expect(rendered.markdown).toContain("**Discovery:** feat-067 / Phase 2 / code-review / finding-067");
    expect(rendered.markdown.indexOf(`### ${recordA}`)).toBeLessThan(rendered.markdown.indexOf(`### ${recordB}`));
    expect(rendered.markdown.indexOf("location-a")).toBeLessThan(rendered.markdown.indexOf("location-b"));
    expect(rendered.markdown).not.toContain(hash("b"));
    expect(rendered.markdown).not.toContain("artifacts/observation-067.json");
    expect(rendered.markdown).not.toContain("currentFeatureImpact");
  });

  it("fails closed for null, primitive, malformed nested members, identity/version mismatch, and hostile values", () => {
    const valid = aggregate();
    const malformed: readonly unknown[] = [
      undefined,
      null,
      "not-a-register",
      [],
      {},
      { records: null },
      { records: [null] },
      source([{ ...valid, locations: [{}] }]),
      source([{ ...valid, observationReferences: [] }]),
      source([{ ...valid, discovery: { ...(valid.discovery as Record<string, unknown>), observation: { ...((valid.discovery as Record<string, unknown>).observation as Record<string, unknown>), artifactId: "foreign-observation" } } }]),
      source([{ ...valid, locations: [{ ...(valid.locations as Record<string, unknown>[])[0]!, relativePath: "/absolute/debt.ts" }, (valid.locations as Record<string, unknown>[])[1]! ] }]),
      source([{ ...valid, rationale: "secret=must-not-leak" }]),
      source([{ ...valid, futureTouchTrigger: { ...(valid.futureTouchTrigger as Record<string, unknown>), name: "hostile\u0007trigger" } }]),
      source([{ ...valid, action: "CLOSE" }]),
      { records: [valid], authority: { actorId: "caller" } },
    ];
    for (const input of malformed) {
      expectRefusal(input);
      expect(JSON.stringify(projectArchitectureDebtRegister(input))).not.toContain("must-not-leak");
    }
  });

  it("refuses raw aggregates and malformed projection values at the Markdown-only boundary", () => {
    expect(renderArchitectureDebtMarkdown(source())).toEqual(refusal);
    const valid = projectedControl();
    expect(renderArchitectureDebtMarkdown({ ...valid, authority: "state_authority" })).toEqual(refusal);
    expect(renderArchitectureDebtMarkdown({ ...valid, records: [{ ...valid.records[0]!, futureTouchDecisionSummaries: ["unpersisted"] }] })).toEqual(refusal);
    expect(renderArchitectureDebtMarkdown({ ...valid, records: [{ ...valid.records[0]!, locations: [{ ...valid.records[0]!.locations[0]!, relativePath: "C:/absolute.ts" }] }] })).toEqual(refusal);
  });

  it("refuses hostile HTML and active Markdown URI input through both public boundaries", () => {
    const valid = aggregate();
    const hostileAggregates = [
      { ownerId: "<img src=x onerror=alert(1)>" },
      { rationale: "[run]( JaVaScRiPt:alert(1))" },
      { risk: "![payload](data:text/html,boom)" },
      { futureTouchTrigger: { ...(valid.futureTouchTrigger as Record<string, unknown>), symbols: ["<vbscript:msgbox(1)>" ] } },
      { locations: [{ ...(valid.locations as Record<string, unknown>[])[0]!, relativePath: "apps/[run](vbscript:msgbox).ts" }, (valid.locations as Record<string, unknown>[])[1]! ] },
      { locations: [{ ...(valid.locations as Record<string, unknown>[])[0]!, endpoint: "![run](javascript:alert(1))" }, (valid.locations as Record<string, unknown>[])[1]! ] },
      { discovery: { ...(valid.discovery as Record<string, unknown>), findingId: "<!-- hostile comment -->" } },
    ];
    for (const overrides of hostileAggregates) expect(projectArchitectureDebtRegister(source([aggregate(recordA, overrides)]))).toEqual(refusal);

    const projection = projectedControl();
    const hostileProjections = [
      { ...projection.records[0]!, ownerId: "<script>alert(1)</script>" },
      { ...projection.records[0]!, rationale: "[run](data:text/html,boom)" },
      { ...projection.records[0]!, locations: [{ ...projection.records[0]!.locations[0]!, symbol: "<javascript:alert(1)>" }, projection.records[0]!.locations[1]! ] },
      { ...projection.records[0]!, locations: [{ ...projection.records[0]!.locations[0]!, endpoint: "![run](vbscript:msgbox)" }, projection.records[0]!.locations[1]! ] },
    ];
    for (const record of hostileProjections) expect(renderArchitectureDebtMarkdown({ ...projection, records: [record] })).toEqual(refusal);
  });

  it("encodes benign literal Markdown and HTML delimiters without altering the structured projection", () => {
    const literal = "literal & < 3 > 2 [brackets] (parens) `code` *em* _under_ # hash ! bang \\ pipe | ~";
    const valid = aggregate(recordA, {
      rationale: literal,
      futureTouchTrigger: { ...(aggregate().futureTouchTrigger as Record<string, unknown>), symbols: [literal] },
      locations: [{ ...(aggregate().locations as Record<string, unknown>[])[0]!, symbol: literal }, (aggregate().locations as Record<string, unknown>[])[1]! ],
    });
    const projection = projectArchitectureDebtRegister(source([valid]));
    expect(projection).toMatchObject({ kind: "projected" });
    if (projection.kind !== "projected") return;
    expect(projection.records[0]!.rationale).toBe(literal);
    const rendered = renderArchitectureDebtMarkdown(projection);
    expect(rendered).toMatchObject({ kind: "rendered" });
    if (rendered.kind !== "rendered") return;
    expect(rendered.markdown).toContain("literal &amp; &lt; 3 &gt; 2 \\[brackets\\] \\(parens\\) \\`code\\` \\*em\\* \\_under\\_ \\# hash \\! bang \\\\ pipe \\| \\~");
    expect(rendered.markdown).not.toContain(`| ${literal} |`);
  });

  it("enforces the renderer state-link matrix for valid and impossible projections", () => {
    const projection = projectedControl();
    const base = projection.records[0]!;
    const validRecords = [
      { ...base, state: "MERGED" as const, duplicateOfRecordId: recordB },
      { ...base, state: "SUPERSEDED" as const, supersededByRecordId: recordB },
      ...(["PENDING_TRIAGE", "CONFIRMED", "DEFERRED", "ACCEPTED_RISK", "PLANNED", "CLOSED", "REJECTED"] as const).map((state) => ({ ...base, state })),
    ];
    for (const record of validRecords) expect(renderArchitectureDebtMarkdown({ ...projection, records: [record] }).kind).toBe("rendered");

    const invalidRecords = [
      { ...base, state: "MERGED" as const },
      { ...base, state: "SUPERSEDED" as const },
      { ...base, state: "MERGED" as const, supersededByRecordId: recordB },
      { ...base, state: "SUPERSEDED" as const, duplicateOfRecordId: recordB },
      { ...base, state: "CONFIRMED" as const, duplicateOfRecordId: recordB },
      { ...base, state: "CONFIRMED" as const, supersededByRecordId: recordB },
      { ...base, state: "MERGED" as const, duplicateOfRecordId: recordB, supersededByRecordId: recordA },
      { ...base, state: "MERGED" as const, duplicateOfRecordId: recordA },
    ];
    for (const record of invalidRecords) expect(renderArchitectureDebtMarkdown({ ...projection, records: [record] })).toEqual(refusal);
  });

  it("uses code-unit ordering identically in en-US and sv-SE locale processes", () => {
    const unicodeAggregate = aggregate(recordA, {
      locations: [
        { locationId: "locale-a", relativePath: "src/ä.ts", ruleTags: [] },
        { locationId: "locale-z", relativePath: "src/z.ts", ruleTags: [] },
      ],
    });
    const script = `import { projectArchitectureDebtRegister, renderArchitectureDebtMarkdown } from "./apps/orchestrator/src/architecture-debt-presentation.ts";
const result = projectArchitectureDebtRegister(JSON.parse(process.env.ARCH_DEBT_PROBE));
if (result.kind !== "projected") throw new Error("projection refusal");
const rendered = renderArchitectureDebtMarkdown(result);
if (rendered.kind !== "rendered") throw new Error("render refusal");
process.stdout.write(JSON.stringify({ locations: result.records[0].locations.map((location) => location.relativePath), markdown: rendered.markdown }));`;
    const probe = (locale: string): string => {
      const tsxLoader = fileURLToPath(new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url));
      const child = spawnSync(process.execPath, ["--import", tsxLoader, "--input-type=module", "--eval", script], {
        cwd: process.cwd(),
        env: { ...process.env, LANG: locale, LC_ALL: locale, ARCH_DEBT_PROBE: JSON.stringify(source([unicodeAggregate])) },
        encoding: "utf8",
      });
      expect(child.status, child.stderr).toBe(0);
      return child.stdout;
    };
    const enUs = probe("en_US.UTF-8");
    const svSe = probe("sv_SE.UTF-8");
    expect(enUs).toBe(svSe);
    expect(JSON.parse(enUs).locations).toEqual(["src/z.ts", "src/ä.ts"]);
  });

  it("has no Markdown reader, store import, filesystem, authority, action, or locale fallback path", () => {
    const sourcePath = fileURLToPath(new URL("../src/architecture-debt-presentation.ts", import.meta.url));
    const implementation = readFileSync(sourcePath, "utf8");
    expect(implementation).not.toMatch(/ArchitectureDebtSqliteStore|ReviewGovernanceSqliteStore/);
    expect(implementation).not.toMatch(/node:(?:fs|path|sqlite)/);
    expect(implementation).not.toMatch(/readFile|writeFile|parseMarkdown|marked|remark/);
    expect(implementation).not.toMatch(/commitArchitectureDebtOperation|evaluateArchitectureDebtTriage|evaluateFutureTouch/);
    expect(implementation).not.toMatch(/localeCompare|Intl\.Collator|process\.env\.(?:LANG|LC_ALL)|\.normalize\(/);
  });
});
