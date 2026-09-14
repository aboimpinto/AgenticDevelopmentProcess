import { globSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { verificationCheckSourceRoots } from "./verification-source-roots.js";
import type { FreshPlan } from "./fresh-verification-evidence.js";
import { within } from "./fresh-verification-evidence.js";
import { modelJsonPayload } from "../runtime/model-json-payload.js";

export class VerificationPlanError extends Error {
  constructor(message: string, readonly kind: "format" | "semantic" = "semantic", readonly candidate?: unknown) { super(message); }
}
const text = (v: unknown, max = 4000): v is string => typeof v === "string" && !!v.trim() && v.length <= max && !v.includes("\0");
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 200 && v.every(x => text(x));
/** Typed validation errors may be corrected; budget, cancellation and runtime errors may not. */
export function parseFreshVerificationPlan(output: string, phaseNumbers: number[]): FreshPlan {
  let plan: FreshPlan;
  try { plan = modelJsonPayload(output) as FreshPlan; }
  catch (error) { throw new VerificationPlanError(`${(error as Error).message} No tests were dispatched.`, "format"); }
  if (!plan || !Array.isArray(plan.checks) || plan.checks.length > 100 || !Array.isArray(plan.phases)) throw new VerificationPlanError("Invalid feature verification plan: checks/phases arrays required.", "semantic", plan);
  const issues: string[] = [], ids = new Set<string>(), executions = new Map<string, string>();
  const declaredIds = new Set(plan.checks.filter(c => text(c?.id, 120)).map(c => c.id));
  for (const [index, c] of plan.checks.entries()) {
    const label = text(c?.id, 120) ? c.id : `check[${index}]`;
    try {
      if (!c || !text(c.id, 120) || !/^[\w.-]+$/.test(c.id) || !text(c.cwd) || !isAbsolute(c.cwd) || !text(c.command, 10000) || !text(c.reason)
        || !strings(c.configurationFiles) || !c.configurationFiles.length) throw new Error("needs identity, configured cwd/command, configuration files and scope justification");
      if (c.dependsOn !== undefined && (!strings(c.dependsOn) || c.dependsOn.some(id => id === c.id || !declaredIds.has(id)))) throw new Error("dependsOn must reference other selected check IDs");
      c.kind ??= "test"; // Existing stored test-only plans remain readable.
      if (!["test", "static", "preparation", "discovery"].includes(c.kind)) throw new Error("kind must be test, static, preparation or discovery");
      if (!strings(c.testPaths) || (c.kind === "test" && !c.testPaths.length)) throw new Error("test execution needs nonempty testPaths; classify lint/build/setup/discovery separately using kind");
      if (c.gates !== undefined && (!Array.isArray(c.gates) || c.gates.some(g => !["tests", "gherkin_e2e"].includes(g)) || (c.kind !== "test" && c.gates.length))) throw new Error("only actual tests may satisfy automated gates; no human/code-review gates");
      if (c.kind === "test" && /(?:^|\s)--(?:list(?:Tests)?|list-tests|collect-only|no-build)(?:\s|=|$)/i.test(c.command)) throw new Error("discovery or unproven prebuilt binaries cannot supply fresh source verification");
      c.cwd = realpathSync(c.cwd);
      const repositories = verificationCheckSourceRoots(c);
      const execution = JSON.stringify([c.cwd, c.command.trim()]);
      if (ids.has(c.id)) throw new Error("Duplicate verification check ID; use unique check IDs and shared phase references");
      const priorExecution = executions.get(execution);
      if (priorExecution) throw new Error(`Duplicate verification execution between ${priorExecution} and ${c.id}; share one check across phase obligations`);
      ids.add(c.id); executions.set(execution, c.id);
      if (c.kind === "test" && c.suiteKey !== undefined) {
        if (!text(c.suiteKey, 200)) throw new Error("suiteKey must identify the configured runner/environment profile");
        if (c.testPaths.some(p => {
          // Check the static prefix before globbing, rather than enumerate a
          // parent workspace and discard unbound matches afterwards.
          const parts = p.split(/[\\/]/), wildcard = parts.findIndex(part => /[*?\[\]{}()!]/.test(part));
          const prefix = wildcard < 0 ? p : parts.slice(0, wildcard).join("/") || ".";
          return isAbsolute(p) || !repositories.some(root => within(root, resolve(c.cwd, prefix)));
        })) throw new Error("testPaths must be repository-relative configured selections inside repositories bound by configurationFiles; preserve the delegated runner reference when its tests live outside cwd");
        const files = new Set<string>();
        const pending = globSync(c.testPaths, { cwd: c.cwd, exclude: ["**/node_modules/**", "**/.git/**"] }).map(f => resolve(c.cwd, f));
        const visited = new Set<string>();
        for (const full of pending) {
          if (visited.has(full)) continue;
          visited.add(full);
          if (visited.size > 20000) throw new Error("test selection exceeds bounded scope enumeration");
          const actual = realpathSync(full);
          if (!repositories.some(root => within(root, full) && within(root, actual))) throw new Error(`testPaths source escapes its bound repository: ${full}`);
          if (lstatSync(actual).isDirectory()) {
            let entries: string[];
            try {
              entries = execFileSync("git", ["-C", actual, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "."],
                { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10000, maxBuffer: 2_000_000 }).split("\0").filter(Boolean);
            } catch {
              entries = globSync("*", { cwd: actual, exclude: ["node_modules", ".git"] });
            }
            pending.push(...entries.map(f => resolve(actual, f)));
            continue;
          }
          if (!lstatSync(actual).isFile()) continue;
          files.add(actual); if (files.size > 20000) throw new Error("test selection exceeds bounded scope enumeration");
        }
        if (!files.size) throw new Error(`testPaths have no current source matches relative to cwd ${JSON.stringify(c.cwd)}; update the FeatureDescription.md inventory and configured test locations when tests are renamed or replaced`);
        // Source ownership is not execution identity. Filtered scenarios, namespaces,
        // assemblies and configurations may legitimately share files and suiteKey.
        // Only identical cwd/command executions are deterministically duplicates;
        // the inspector evaluates delegated selections, retaining every assertion.
      }
    } catch (e) { issues.push(`${label}: ${(e as Error).message}`); }
  }
  const seen = new Set<number>(), selected = new Set<string>();
  for (const p of plan.phases) {
    if (!p || !phaseNumbers.includes(p.phaseNumber) || seen.has(p.phaseNumber) || !Array.isArray(p.checkIds) || new Set(p.checkIds).size !== p.checkIds.length
      || p.checkIds.some(id => !declaredIds.has(id)) || (!p.checkIds.length && !text(p.noAutomationReason))) { issues.push(`phase ${p?.phaseNumber}: unique configured check references or noAutomationReason required (check ID order does not matter)`); continue; }
    seen.add(p.phaseNumber); p.checkIds.forEach(id => selected.add(id));
  }
  if (seen.size !== new Set(phaseNumbers).size || selected.size !== declaredIds.size) issues.push("Verification scope omitted a phase or contains an unrelated unassigned check.");
  if (issues.length) throw new VerificationPlanError(issues.slice(0, 20).join("\n"), "semantic", plan);
  const ordered: FreshPlan["checks"] = [], visiting = new Set<string>(), done = new Set<string>();
  const visit = (check: FreshPlan["checks"][number]) => {
    if (done.has(check.id)) return;
    if (visiting.has(check.id)) throw new VerificationPlanError("Verification prerequisites contain a cycle", "semantic", plan);
    visiting.add(check.id);
    for (const id of check.dependsOn ?? []) visit(plan.checks.find(c => c.id === id)!);
    visiting.delete(check.id); done.add(check.id); ordered.push(check);
  };
  plan.checks.forEach(visit);
  return { ...plan, checks: ordered };
}
