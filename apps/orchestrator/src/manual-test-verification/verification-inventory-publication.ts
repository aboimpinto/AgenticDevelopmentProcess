import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { writeFileAtomic } from "./artifact-storage.js";
import { type FreshPlan, within } from "./fresh-verification-evidence.js";
import { verificationInventoryCommands } from "./verification-inventory-contract.js";

const start = "<!-- hepha:verification-inventory:start -->";
const end = "<!-- hepha:verification-inventory:end -->";
const portable = (path: string) => path.split(sep).join("/");
export interface InventoryPublicationInput {
  folder: string; root: string; directory: string; plan: FreshPlan;
  phases: { number: number | null; documentPath: string | null }[];
}

/** The host owns writes. Only command literals inside inventory sections and
 * its managed inventory/reference blocks may change; gates/results are untouched. */
export function publishVerificationInventory(input: InventoryPublicationInput) {
  const folder = realpathSync(input.folder);
  const targets = new Map<string, { path: string; section: string; before: string; after: string }>();
  const add = (path: string, section: string) => {
    const full = resolve(path);
    if (!within(folder, full) || lstatSync(full).isSymbolicLink() || !lstatSync(full).isFile() || !within(folder, realpathSync(full)))
      throw new Error("Verification inventory target must be a regular feature-local document.");
    const name = portable(relative(folder, full));
    if (targets.has(name)) throw new Error("Duplicate verification inventory target.");
    const before = readFileSync(full, "utf8");
    targets.set(name, { path: full, section, before, after: before });
  };
  add(resolve(folder, "FeatureDescription.md"), "TestPlan");
  for (const phase of input.phases) if (phase.documentPath) add(resolve(folder, phase.documentPath), "Verification References");
  const decoded = verificationInventoryCommands.decode(JSON.stringify(input.plan.inventoryReconciliation ?? {
    schemaVersion: "hepha-exchange/v1", kind: "verification.inventory.commands", payload: { replacements: [] },
  }));
  if (!decoded.valid) throw new Error(`Invalid command reconciliation: ${JSON.stringify(decoded.diagnostics)}`);
  const normalizeCommand = (command: string) => command.split(input.directory).join("${VERIFICATION_OUTPUT_DIR}");
  for (const update of decoded.value.payload.replacements) {
    const target = targets.get(update.document);
    const check = input.plan.checks.find(c => c.id === update.checkId);
    if (!target || !check || check.command !== update.after) throw new Error("Command reconciliation must name an admitted check, its exact command and an allowed document.");
    target.after = updateSection(target.after, target.section, body => replaceCommandLiteral(body, update.before, normalizeCommand(update.after)), false);
  }
  const inventory = {
    schema: "project-verification-inventory/v1", status: "inspected-not-executed",
    pathBase: "FeatureDescription.md directory; configurationFiles/testPaths remain relative to each check cwd",
    outputDirectory: "Resolve VERIFICATION_OUTPUT_DIR to this invocation's absolute evidence directory before execution",
    checks: input.plan.checks.map(c => ({ ...c, cwd: portable(relative(folder, c.cwd)) || ".", command: normalizeCommand(c.command) })),
    phases: input.plan.phases,
  };
  const featureTarget = targets.get("FeatureDescription.md")!;
  featureTarget.after = updateSection(featureTarget.after, "TestPlan", body => managedBlock(body,
    "Current inspected execution inventory. These commands and Phase mappings are authoritative for Refresh; retained prose supplies acceptance/ownership context. This declaration is not a passing result.\n\n```json\n" + JSON.stringify(inventory, null, 2) + "\n```"), true);
  for (const phase of input.phases) {
    if (!phase.documentPath) continue;
    const path = resolve(folder, phase.documentPath), target = targets.get(portable(relative(folder, path)))!;
    const mapping = input.plan.phases.find(p => p.phaseNumber === phase.number);
    if (!mapping) throw new Error("Verification inventory omitted a phase mapping.");
    const link = portable(relative(resolve(path, ".."), featureTarget.path));
    target.after = updateSection(target.after, "Verification References", body => managedBlock(body,
      `Canonical commands: [FeatureDescription TestPlan](${link}#testplan).\n\nCheck IDs: ${mapping.checkIds.map(id => `\`${id}\``).join(", ") || "none"}.` +
      (mapping.noAutomationReason ? `\n\nScope: ${mapping.noAutomationReason}` : "") +
      "\n\nExecution references do not change this phase's gates, acceptance criteria, lifecycle or saved results."), true);
  }
  const changes = [...targets].filter(([, t]) => t.before !== t.after).map(([document, t]) => ({ document, ...t }));
  // Validate the complete write set first; no partially validated document writes.
  for (const change of changes) if (readFileSync(change.path, "utf8") !== change.before) throw new Error("Verification documents changed before publication; no inventory correction applied.");
  writeFileAtomic(resolve(input.directory, "inventory-command-reconciliation.json"), JSON.stringify({
    schema: "verification-inventory-publication/v1", replacements: decoded.value.payload.replacements,
    changes: changes.map(({ document, before, after }) => ({ document, before, after })),
  }, null, 2));
  const written: typeof changes = [];
  try {
    for (const change of changes) { writeFileAtomic(change.path, change.after); written.push(change); }
  } catch (error) {
    for (const change of written.reverse()) if (readFileSync(change.path, "utf8") === change.after) writeFileAtomic(change.path, change.before);
    throw error;
  }
  return changes.map(c => c.document);
}

function managedBlock(body: string, content: string) {
  const a = body.indexOf(start), b = body.indexOf(end);
  if ((a < 0) !== (b < 0) || (a >= 0 && (b < a || body.indexOf(start, a + start.length) >= 0 || body.indexOf(end, b + end.length) >= 0)))
    throw new Error("Malformed managed verification inventory markers.");
  const block = `${start}\n${content}\n${end}`;
  return a < 0 ? `${body.trimEnd()}\n\n${block}\n\n` : body.slice(0, a) + block + body.slice(b + end.length);
}

/** Recognize headings outside fences so shell/JSON contents never select an edit boundary. */
function updateSection(document: string, title: string, update: (body: string) => string, create: boolean) {
  const lines = document.match(/.*(?:\r?\n|$)/g)!.filter(Boolean);
  let fence = "", offset = 0, begin = -1, finish = document.length, found = false;
  for (const line of lines) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) { if (!fence) fence = marker[1]![0]!; else if (marker[1]![0] === fence) fence = ""; }
    else if (!fence && /^#{1,2} /.test(line)) {
      if (line.trim() === `## ${title}`) {
        if (found) throw new Error(`Ambiguous ${title} sections.`);
        found = true; begin = offset + line.length;
      } else if (begin >= 0 && finish === document.length) finish = offset;
    }
    offset += line.length;
  }
  if (!found) {
    if (!create) throw new Error(`Cannot replace a command outside ${title}.`);
    return document.trimEnd() + `\n\n## ${title}\n` + update("");
  }
  return document.slice(0, begin) + update(document.slice(begin, finish)) + document.slice(finish);
}

function replaceCommandLiteral(body: string, before: string, after: string) {
  if (before === after) return body;
  if (/[\r\n`]/.test(before + after)) throw new Error("Command replacement requires a single command literal.");
  let found = false, fence = "";
  const changed = body.split("\n").map(line => {
    const marker = line.match(/^\s*(`{3,}|~{3,})(\w*)/);
    if (marker) { fence = fence ? "" : marker[2] || "plain"; return line; }
    if (!fence) return line.replace(/`([^`]+)`/g, (literal, value: string) => {
      if (value !== before) return literal; found = true; return `\`${after}\``;
    });
    if (["bash", "sh", "shell", "plain"].includes(fence) && line.trim() === before) { found = true; return line.replace(before, after); }
    return line;
  }).join("\n");
  if (!found) throw new Error("The documented command literal changed or is not in an editable inventory section.");
  return changed;
}
