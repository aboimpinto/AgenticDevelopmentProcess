import { existsSync, readFileSync, lstatSync, realpathSync } from "node:fs";
import { relative, resolve } from "node:path";
import { parseFreshVerificationPlan } from "./fresh-verification-plan.js";
import { sha256 } from "./fresh-verification-evidence.js";
import type { VerificationTargetCatalog } from "./configured-verification-targets.js";

const catalogueCache = new Map<string, { key: string; value: VerificationTargetCatalog }>();

/** Read the existing host-published project inventory before legacy runner
 * discovery. Selection comes from the feature's configuration, not its stack. */
export function featureVerificationTargets(root: string, folder: string): VerificationTargetCatalog | null {
  const path = resolve(folder, "FeatureDescription.md");
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8");
  const block = text.match(/<!-- hepha:verification-inventory:start -->([\s\S]*?)<!-- hepha:verification-inventory:end -->/)?.[1];
  if (!block) return null;
  try {
    const raw = JSON.parse(block.match(/```json\s*([\s\S]*?)```/)?.[1] ?? "");
    if (raw.schema !== "project-verification-inventory/v1") throw new Error("Unknown feature inventory schema");
    const checks = raw.checks.map((c: { cwd: string }) => ({ ...c, cwd: resolve(folder, c.cwd) }));
    const configurationHashes = checks.flatMap((c: { cwd: string; configurationFiles: string[] }) => c.configurationFiles.map(file => {
      const path = resolve(c.cwd, file), stat = lstatSync(path);
      if (!stat.isFile() || stat.size > 2_000_000) throw new Error("Invalid configuration reference");
      return [realpathSync(path), sha256(readFileSync(path))];
    }));
    const cacheKey = sha256(JSON.stringify([root, block, configurationHashes]));
    const cached = catalogueCache.get(path);
    // Target identity depends on configuration, not test outcomes or changing
    // test bodies. Execution still validates source snapshots and native reports.
    if (cached?.key === cacheKey) return cached.value;
    const plan = parseFreshVerificationPlan(JSON.stringify({ checks, phases: raw.phases }), raw.phases.map((p: { phaseNumber: number }) => p.phaseNumber));
    const targets = plan.checks.filter(c => !c.kind || c.kind === "test").map(c => {
      const cwd = resolve(c.cwd);
      const command = cwd === resolve(root) ? c.command : `cd '${cwd.replaceAll("'", "'\\''")}' && ${c.command}`;
      const target = { command, testPaths: c.testPaths.map(p => relative(root, resolve(cwd, p))), configurationFiles: c.configurationFiles.map(p => relative(root, resolve(cwd, p))) };
      return { ...target, id: `target-${sha256(JSON.stringify(target)).slice(0, 24)}` };
    });
    const value = { targets, diagnostics: [], fingerprint: sha256(JSON.stringify(["feature-targets/v1", plan, configurationHashes])) };
    if (catalogueCache.size >= 64) catalogueCache.delete(catalogueCache.keys().next().value!);
    catalogueCache.set(path, { key: cacheKey, value });
    return value;
  } catch {
    const diagnostics = ["The feature verification inventory no longer matches its current configuration. Refresh inspection to reconcile the same accepted targets before execution."];
    return { targets: [], diagnostics, fingerprint: sha256(JSON.stringify([block, diagnostics])) };
  }
}
