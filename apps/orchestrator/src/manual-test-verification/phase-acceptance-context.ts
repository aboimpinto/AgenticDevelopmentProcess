import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { basename, dirname, extname, relative, resolve } from "node:path";
import { loadPhaseGateRecord } from "../exchanges/phase-gates-repository.js";
import type { PhaseGateRecord } from "../exchanges/phase-gates.js";
import { sha256, within, type FreshCheck } from "./fresh-verification-evidence.js";

export type AssertionSource = { path: string; resolvedPath?: string; sha256?: string; content?: string; status?: string; reason?: string };
export interface AcceptanceContext {
  recordPath: string; flags?: PhaseGateRecord["flags"]; criteria?: PhaseGateRecord["criteria"]; coverage?: PhaseGateRecord["coverage"];
  checks?: { id: string; command: string; cwd: string; gate?: string; outcome?: string; reason?: string }[];
  sources?: AssertionSource[]; note?: string; diagnostic?: string;
}

/** Existing logical mappings and actual assertion sources, never new verdicts or executions. */
export function readPhaseAcceptanceContext(folder: string, projectRoot: string, inspectedChecks: readonly FreshCheck[] = [], admittedRoots: readonly string[] = []): AcceptanceContext[] {
  const root = realpathSync(projectRoot), documents: string[] = [];
  const roots = [...new Set([root, ...admittedRoots.map(path => realpathSync(path))])];
  const allowed = (path: string) => roots.some(base => within(base, path));
  function visit(directory: string, depth: number) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory() && depth < 3 && !/^(manual-test-verification|verification|archive|node_modules|code-reviews)$/i.test(entry.name)) visit(path, depth + 1);
      if (entry.isFile() && entry.name.endsWith(".md.gates.json")) documents.push(path.slice(0, -".gates.json".length));
    }
  }
  visit(folder, 0);
  let remaining = 400_000;
  const cache = new Map<string, AssertionSource>();
  function source(path: string, bases: string[]): AssertionSource {
    for (const base of bases) {
      const candidate = resolve(base, path);
      if (!allowed(candidate) || relative(roots.find(base => within(base, candidate))!, candidate).split(/[\\/]/).some(part => part.startsWith("."))) continue;
      try {
        const real = realpathSync(candidate), stat = lstatSync(real);
        if (!allowed(real)) continue;
        if (stat.isDirectory()) return { path, status: "directory-selection", reason: "The configured check selects a directory. Use its current-source inspection summary and follow its exact assertion references; a directory is not missing implementation." };
        if (!stat.isFile()) continue;
        if (cache.has(real)) return { ...cache.get(real)!, path };
        if (stat.size > remaining) return { path, status: "unavailable", reason: "Source exceeds remaining context budget; inspect its referenced assertions before inferring missing tests." };
        const content = readFileSync(real, "utf8");
        if (content.includes("\0")) continue;
        remaining -= stat.size;
        const result = { path, resolvedPath: relative(root, real), sha256: sha256(content), content };
        cache.set(real, result); return result;
      } catch { /* Missing references are context limitations, not missing implementation verdicts. */ }
    }
    return { path, status: "unavailable", reason: "Referenced assertion source is missing or outside the project; resolve the reference before judging coverage." };
  }
  const phases: AcceptanceContext[] = documents.map(document => {
    const recordPath = relative(folder, `${document}.gates.json`);
    if (lstatSync(`${document}.gates.json`).size > 2_000_000) return { recordPath, diagnostic: "Phase assessment unavailable: oversized record." };
    const decoded = loadPhaseGateRecord(document);
    if (!decoded?.valid || decoded.value.payload.phaseId !== basename(document)) return { recordPath, diagnostic: "Phase assessment unavailable: invalid record or identity." };
    const { flags, criteria, coverage, checks } = decoded.value.payload;
    const sources = [...new Set(coverage.criteria.flatMap(c => c.testPaths))].map(path => {
      const referencedChecks = coverage.criteria.filter(c => c.testPaths.includes(path)).flatMap(c => c.checkIds);
      return source(path, [...checks.filter(c => referencedChecks.includes(c.id)).map(c => resolve(root, c.cwd)), root]);
    });
    return { recordPath, flags, criteria, coverage, sources,
      checks: checks.map(({ id, gate, command, cwd, outcome }) => ({ id, gate, command, cwd, outcome })),
      note: "Prior logical assessment with current source contents. Reassess required behavior collectively; the recorded sufficient outcome is not automatic approval or proof of current execution. No numeric coverage report is required." };
  });
  for (const check of inspectedChecks.filter(check => !check.kind || check.kind === "test")) {
    phases.push({ recordPath: `current-inspection:${check.id}`, checks: [{ id: check.id, cwd: check.cwd, command: check.command, reason: check.reason }],
      sources: check.testPaths.flatMap(path => {
        const bases = [resolve(root, check.cwd), root];
        const initial = source(path, bases);
        if (initial.status !== "directory-selection") return [initial];
        const directory = bases.map(base => resolve(base, path)).find(p => allowed(p) && (() => { try { return lstatSync(p).isDirectory(); } catch { return false; } })());
        if (!directory) return [initial];
        const files: string[] = [];
        const collect = (dir: string, depth: number) => {
          for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            if (files.length >= 30 || entry.isSymbolicLink() || /^(node_modules|target|bin|obj|\.)/.test(entry.name)) continue;
            const file = resolve(dir, entry.name);
            if (entry.isDirectory() && depth < 4) collect(file, depth + 1);
            else if (entry.isFile() && /(?:test|spec|steps|fixture|helper|\.feature$)/i.test(entry.name) && /\.(?:tsx?|jsx?|cs|rs|py|go|java|feature)$/.test(entry.name)) files.push(file);
          }
        };
        collect(directory, 0);
        return [initial, ...files.map(file => source(file, bases))];
      }),
      note: "Current verification inspection and referenced test bodies, available even without structured phase gate records. Reconcile the inspected assertions and limitations with required behavior; this context is not a test result or approval." });
  }
  for (const phase of phases) {
    const sources = phase.sources ?? [];
    const seen = new Set(sources.map(s => s.resolvedPath));
    for (let index = 0; index < sources.length && index < 60; index++) {
      const item = sources[index];
      if (!item?.content || !item.resolvedPath) continue;
      const base = dirname(resolve(root, item.resolvedPath));
      const refs = [...item.content.matchAll(/(?:from\s*|require\s*\(|import\s*\()["'](\.[^"']+)["']/g)].map(m => m[1]!);
      // Gherkin delegates assertions to step definitions; include nearby binding
      // implementations independent of framework/project identity.
      if (extname(item.resolvedPath) === ".feature") {
        for (const entry of readdirSync(base, { withFileTypes: true })) {
          if (entry.isFile() && /(?:step|binding)/i.test(entry.name)) refs.push(`./${entry.name}`);
          if (entry.isDirectory() && /^(?:steps|step_definitions|bindings)$/i.test(entry.name)) {
            for (const child of readdirSync(resolve(base, entry.name), { withFileTypes: true }))
              if (child.isFile()) refs.push(`./${entry.name}/${child.name}`);
          }
        }
      }
      for (const ref of refs.slice(0, 30)) {
        const candidates = [ref, ...[".ts", ".tsx", ".js", "/index.ts", "/index.js"].map(ext => ref.replace(/\.js$/, "") + ext)];
        const helper = candidates.map(path => source(path, [base])).find(s => s.content !== undefined);
        if (helper && !seen.has(helper.resolvedPath)) { seen.add(helper.resolvedPath); sources.push(helper); }
      }
    }
  }
  return phases;
}

/** Put source bodies through existing lossless source paging, not the identity-only budget. */
export function phaseAcceptancePromptContext(context: AcceptanceContext[]) {
  const bodies = new Map<string, string>();
  const assessments = context.map(phase => ({ ...phase, ...(phase.sources ? { sources: phase.sources.map(source => {
    if (source.content === undefined) return source;
    const { content, ...reference } = source;
    bodies.set(`${source.resolvedPath}:${source.sha256}`, `# Current assertion source: ${source.resolvedPath}\nSHA-256: ${source.sha256}\n${content}`);
    return reference;
  }) } : {}) }));
  return { assessments, sourceDocuments: [...bodies.values()].join("\n\n") };
}

/** Retrieve cited missing context only inside already admitted source roots. */
export function readAcceptanceReferences(references: readonly string[], projectRoot: string, admittedRoots: readonly string[] = []) {
  const roots = [...new Set([projectRoot, ...admittedRoots])].map(p => realpathSync(p));
  const documents: string[] = []; let bytes = 0;
  for (const ref of [...new Set(references)].slice(0, 30)) {
    // These suffixes select a location within a file, not another filename.
    // Read the complete source so neighboring assertions and qualifications
    // remain available. Root/realpath checks below still apply to every alias.
    const path = ref.trim().replace(/^`(.*)`$/, "$1").replace(/#.*$/, "")
      .replace(/:\d+(?::\d+)?(?:-\d+(?::\d+)?)?$/, "")
      .replace(/(\.md):\s+.+$/i, "$1");
    for (const base of roots) {
      try {
        const file = realpathSync(resolve(base, path));
        if (!roots.some(root => within(root, file)) || relative(roots.find(root => within(root, file))!, file).split(/[\\/]/).some(p => p.startsWith("."))) continue;
        const stat = lstatSync(file);
        if (!stat.isFile() || stat.size + bytes > 200_000) continue;
        const content = readFileSync(file, "utf8"); if (content.includes("\0")) continue;
        documents.push(`# Retrieved assertion source: ${relative(roots[0]!, file)}\nSHA-256: ${sha256(content)}\n${content}`); bytes += stat.size; break;
      } catch { /* Preserve a concrete evidence_pending finding on unavailable context. */ }
    }
  }
  return documents.join("\n\n");
}
