import { bindVerificationOutputDirectory } from "./verification-output-directory.js";
import { verificationInventoryCommands } from "./verification-inventory-contract.js";
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { parseFreshVerificationPlan, VerificationPlanError } from "./fresh-verification-plan.js";
import type { FreshPlan } from "./fresh-verification-evidence.js";

export interface VerificationCommandCorrection {
  checkId: string; before: string; after: string; configurationFile: string; reason: string;
}

/** Resolve a configured tool's missing manifest location before handing off any
 * execution. Never infer a correction from a worker's receipt or old results. */
export function resolveVerificationCommands(candidate: FreshPlan, phases: number[], directory?: string) {
  const plan = parseFreshVerificationPlan(JSON.stringify(candidate), phases);
  const corrections: VerificationCommandCorrection[] = [];
  for (const check of plan.checks) {
    if (directory) {
      const bound = bindVerificationOutputDirectory(check.command, directory);
      if (bound !== check.command) {
        corrections.push({ checkId: check.id, before: check.command, after: bound,
          configurationFile: check.configurationFiles[0]!, reason: "Bind HEPHA's reserved output-directory placeholder to the host-owned current run directory." });
        check.command = bound;
      }
    }
    // Built-in manifest-consuming Cargo commands only, not aliases, shell
    // wrappers or custom subcommands. Preserve all existing options verbatim.
    const prefix = check.command.match(/^(\s*cargo(?:[\t ]+\+[\w.-]+)?[\t ]+(?:metadata|fmt|clippy|test|build|check))(?=[\t ]|$)/);
    if (!prefix || /(?:^|\s)--manifest-path(?:[\s=]|$)/.test(check.command) || discoversManifest(check.cwd)) continue;
    const files = [...new Map(check.configurationFiles.filter(file => basename(file) === "Cargo.toml")
      .map(file => [realpathSync(resolve(check.cwd, file)), file])).values()];
    if (!files.length) continue; // No configured manifest authority: do not guess.
    if (files.length !== 1) throw new VerificationPlanError(`${check.id}: multiple configured Cargo manifests; specify --manifest-path explicitly before execution.`, "semantic", plan);
    const configurationFile = files[0]!;
    const manifest = relative(check.cwd, resolve(check.cwd, configurationFile)).split(sep).join("/");
    const argument = /^[\w./-]+$/.test(manifest) ? manifest : `'${manifest.replaceAll("'", "'\\''")}'`;
    const before = check.command;
    check.command = `${prefix[0]} --manifest-path ${argument}${before.slice(prefix[0].length)}`;
    corrections.push({ checkId: check.id, before, after: check.command, configurationFile,
      reason: "Cargo cannot discover a manifest from cwd; bind the single manifest already listed in this check's configurationFiles." });
  }
  if (corrections.length && plan.inventoryReconciliation) {
    const decoded = verificationInventoryCommands.decode(JSON.stringify(plan.inventoryReconciliation));
    if (!decoded.valid) throw new VerificationPlanError("Invalid command inventory reconciliation exchange.", "semantic", plan);
    for (const replacement of decoded.value.payload.replacements) {
      for (const correction of corrections) {
        if (correction.checkId === replacement.checkId && correction.before === replacement.after) replacement.after = correction.after;
      }
    }
    plan.inventoryReconciliation = decoded.value;
  }
  // Resolution must not create duplicate executions or bypass shared admission.
  return { plan: parseFreshVerificationPlan(JSON.stringify(plan), phases), corrections };
}

function discoversManifest(cwd: string) {
  for (let directory = resolve(cwd); ; directory = dirname(directory)) {
    if (existsSync(resolve(directory, "Cargo.toml"))) return true;
    if (dirname(directory) === directory) return false;
  }
}
