import { existsSync, readFileSync } from "node:fs";
import { authorManualTestCases } from "./pack-authoring.js";
import { parseManualTestCases } from "./pack-case-contract.js";
import { writeFileAtomic } from "./artifact-storage.js";
import type { ManualTestDeliveryModel } from "./delivery-model.js";

type Proposal = Awaited<ReturnType<typeof authorManualTestCases>>;
interface Checkpoint {
  schemaVersion: "hepha-manual-authoring/v1";
  fingerprint: string;
  state: "running" | "paused" | "assessed";
  totalBatches: number;
  completedBatches: Proposal[];
  message: string;
}

/** Only validated complete batches are durable. Drafts are never test results or approvals. */
export async function authorWithCheckpoints(options: {
  checkpointPath: string; fingerprint: string; guidance: string; sourceMarkdown: string;
  model: ManualTestDeliveryModel; runPrompt: (prompt: string) => Promise<string>;
  assertCurrent?: () => Promise<void>;
}): Promise<Proposal> {
  const batches = Array.from({ length: Math.ceil(options.model.manifestEntries.length / 3) }, (_, index) => options.model.manifestEntries.slice(index * 3, index * 3 + 3));
  let checkpoint: Checkpoint = { schemaVersion: "hepha-manual-authoring/v1", fingerprint: options.fingerprint,
    state: "running", totalBatches: batches.length, completedBatches: [], message: "Assessing manual scenarios." };
  if (existsSync(options.checkpointPath)) {
    const saved = JSON.parse(readFileSync(options.checkpointPath, "utf8")) as Checkpoint;
    if (saved.schemaVersion === checkpoint.schemaVersion && saved.fingerprint === options.fingerprint) {
      if (saved.totalBatches !== batches.length || !Array.isArray(saved.completedBatches) || saved.completedBatches.length > batches.length) throw new Error("Invalid authoring checkpoint. No saved proposal was applied.");
      checkpoint = saved;
      const tests = parseManualTestCases(saved.completedBatches.flatMap((batch) => batch.tests));
      if (tests.some((test) => options.model.tests.some((existing) => existing.id === test.id) || test.sourceIds.some((id) => !options.model.manifestEntries.some((entry) => entry.sourceId === id)))) throw new Error("Saved proposals do not match the current sources.");
      for (const batch of saved.completedBatches) if (!Array.isArray(batch.unresolved) || !batch.unresolved.every((entry) => typeof entry === "string" && entry.trim())) throw new Error("Invalid saved unresolved information.");
    }
  }
  const save = () => writeFileAtomic(options.checkpointPath, JSON.stringify(checkpoint, null, 2));
  try {
    for (let index = checkpoint.completedBatches.length; index < batches.length; index++) {
      await options.assertCurrent?.();
      checkpoint.state = "running";
      checkpoint.message = `Assessing batch ${index + 1}/${batches.length}; ${index} validated batches saved.`;
      save();
      const entries = batches[index]!;
      const ids = new Set(entries.map((entry) => entry.sourceId));
      const proposal = await authorManualTestCases({ guidance: options.guidance, sourceMarkdown: options.sourceMarkdown,
        model: { ...options.model, manifestEntries: entries, coverageMap: options.model.coverageMap.filter((entry) => ids.has(entry.sourceId)),
          tests: [...options.model.tests, ...checkpoint.completedBatches.flatMap((batch) => batch.tests)] }, runPrompt: options.runPrompt, assertCurrent: options.assertCurrent,
        onCorrection: diagnostic => {
          checkpoint.message = `Correcting batch ${index + 1}/${batches.length}; ${index} validated batches saved. ${diagnostic}`;
          save();
        } });
      await options.assertCurrent?.();
      checkpoint.completedBatches.push(proposal);
      save();
    }
    checkpoint.state = "assessed";
    checkpoint.message = "All authoring batches assessed. Proposals still require pack publication and human review.";
    save();
    return { tests: checkpoint.completedBatches.flatMap((batch) => batch.tests), unresolved: checkpoint.completedBatches.flatMap((batch) => batch.unresolved) };
  } catch (error) {
    checkpoint.state = "paused";
    checkpoint.message = `${checkpoint.completedBatches.length}/${batches.length} validated batches saved. Retry with the same guidance to resume. ${error instanceof Error ? error.message : String(error)}`;
    save();
    throw new Error(checkpoint.message);
  }
}

export function readAuthoringProgress(path: string) {
  try {
    const checkpoint = JSON.parse(readFileSync(path, "utf8")) as Checkpoint;
    if (checkpoint.schemaVersion !== "hepha-manual-authoring/v1" || !Array.isArray(checkpoint.completedBatches)) return undefined;
    return { state: checkpoint.state, completedBatches: checkpoint.completedBatches.length, totalBatches: checkpoint.totalBatches,
      proposedCases: checkpoint.completedBatches.reduce((sum, batch) => sum + batch.tests.length, 0), message: checkpoint.message };
  } catch { return undefined; }
}
