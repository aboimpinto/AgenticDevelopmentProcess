import { modelJsonPayload } from "../runtime/model-json-payload.js";
import { VerificationPlanError } from "./fresh-verification-plan.js";
import type { FreshPlan } from "./fresh-verification-evidence.js";

/** Corrections can return only changed entries. All other selection and phase
 * obligations stay in the orchestrator-owned candidate, followed by full admission. */
export function applyVerificationPlanPatch(output: string, candidate: unknown, reason: string): string {
  let patch: any;
  try { patch = modelJsonPayload(output); } catch { return output; } // Main parser supplies format diagnostics.
  if (!patch || typeof patch !== "object" || !("checkUpdates" in patch || "phaseUpdates" in patch)) return output;
  const fail = (message: string): never => { throw new VerificationPlanError(`Invalid targeted correction: ${message}\nOriginal candidate diagnostics:\n${reason}`, "semantic", candidate); };
  const plan = structuredClone(candidate) as FreshPlan;
  if (!plan || !Array.isArray(plan.checks) || !Array.isArray(plan.phases)) return fail("a complete candidate is required");
  if (Object.keys(patch).some(k => !["checkUpdates", "phaseUpdates"].includes(k))
    || !Array.isArray(patch.checkUpdates) || !Array.isArray(patch.phaseUpdates)
    || patch.checkUpdates.length > 100 || patch.phaseUpdates.length > 100) return fail("use only bounded checkUpdates and phaseUpdates arrays");
  const diagnosed = new Set(reason.split("\n").flatMap(line => {
    const direct = /^([\w.-]+):/.exec(line)?.[1];
    // Include both participants in current duplicate and legacy saved overlap
    // diagnostics. Arbitrary mentions in model prose do not expand repair scope.
    const pair = /^[\w.-]+: (?:overlap|Duplicate verification execution) between ([\w.-]+) and ([\w.-]+);/.exec(line);
    return [...(direct ? [direct] : []), ...(pair ? [pair[1]!, pair[2]!] : [])];
  }));
  const changed = new Set<string>();
  const fields = ["id", "kind", "suiteKey", "cwd", "command", "configurationFiles", "testPaths", "reason", "gates"];
  for (const update of patch.checkUpdates) {
    if (!update || typeof update.id !== "string" || changed.has(update.id) || Object.keys(update).some(k => !fields.includes(k))) return fail("unknown or duplicate check update");
    const index = plan.checks.findIndex(c => c.id === update.id);
    if (index < 0 || !diagnosed.has(update.id)) return fail("update only checks identified by diagnostics");
    changed.add(update.id); plan.checks[index] = { ...plan.checks[index]!, ...update };
  }
  const phases = new Set<number>();
  for (const update of patch.phaseUpdates) {
    if (!update || !Number.isInteger(update.phaseNumber) || phases.has(update.phaseNumber)
      || Object.keys(update).some(k => !["phaseNumber", "checkIds", "noAutomationReason"].includes(k))) return fail("unknown or duplicate phase update");
    if (!reason.includes(`phase ${update.phaseNumber}:`) && !reason.includes("Verification scope omitted")) return fail("preserve unaffected phase mappings; order does not matter");
    phases.add(update.phaseNumber);
    const index = plan.phases.findIndex(p => p.phaseNumber === update.phaseNumber);
    if (index < 0) plan.phases.push(update); else plan.phases[index] = { ...plan.phases[index]!, ...update };
  }
  return JSON.stringify(plan);
}
