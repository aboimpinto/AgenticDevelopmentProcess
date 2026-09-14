import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { authorWithCheckpoints } from "./authoring-checkpoints.js";
import { buildManualTestDeliveryModel, hashManualTestDeliveryModel, type ManualTestDeliveryModel } from "./delivery-model.js";
import { writeFileAtomic } from "./artifact-storage.js";
import type { GeneratePackOptions } from "./pack-generation.js";
import { stripCompletionRecoverySection } from "../memorybank/completion-recovery-section.js";

/** Supplies feature-local source documents, never repository credentials or tools. */
export function readFeatureDocuments(root: string, guidance: string, criterionIds: readonly string[] = []): string {
  const documents: { name: string; content: string }[] = [];
  let size = 0;
  function visit(folder: string, depth: number) {
    for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) continue;
      const path = resolve(folder, entry.name);
      if (entry.isDirectory() && depth < 3 && !/^(?:\.|manual-test-verification|code-reviews|archive|node_modules)/i.test(entry.name)) visit(path, depth + 1);
      if (!entry.isFile() || !/\.md$/i.test(entry.name) || /ManualTestVerification/i.test(entry.name)) continue;
      size += statSync(path).size;
      if (size > 10_000_000) throw new Error("Feature source documents exceed the 10 MB authoring scan limit.");
      documents.push({ name: relative(root, path), content: stripCompletionRecoverySection(readFileSync(path, "utf8")) });
    }
  }
  visit(root, 0);
  const digest = createHash("sha256").update(JSON.stringify(documents)).digest("hex");
  documents.sort((a, b) => Number(b.name === "FeatureDescription.md") - Number(a.name === "FeatureDescription.md"));
  let remaining = 80_000;
  const excerpts = documents.map((document, index) => {
    const allowance = document.name === "FeatureDescription.md" ? Math.min(30_000, remaining)
      : Math.floor(remaining / (documents.length - index));
    const excerpt = selectSourceExcerpt(document.content, allowance, guidance);
    remaining -= excerpt.length;
    return `${document.name}\n${excerpt}`;
  });
  // Recovery needs exact criterion rows even when a long phase's late repair report falls
  // outside its ordinary excerpt allowance. These are context, never execution proof.
  const criterionExcerpts: string[] = [];
  let criterionBudget = 24_000;
  const requested = new Set(criterionIds);
  const matches = new Map<string, string[]>();
  if (requested.size) for (const document of documents) {
    const lines = document.content.split("\n");
    for (const [index, line] of lines.entries()) {
      for (const id of new Set(line.match(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+/g) ?? [])) {
        if (!requested.has(id)) continue;
        const excerpt = `${document.name}:${index + 1}\n${lines.slice(Math.max(0, index - 1), index + 2).join("\n").slice(0, 2000)}`;
        matches.set(id, [...(matches.get(id) ?? []).slice(-5), excerpt]);
      }
    }
  }
  for (const [index, id] of criterionIds.entries()) {
    const allowance = Math.floor(criterionBudget / (criterionIds.length - index));
    const excerpt = (matches.get(id) ?? []).reverse().join("\n").slice(0, allowance);
    criterionBudget -= excerpt.length;
    if (excerpt) criterionExcerpts.push(`${id} (bounded source mentions, latest document lines first; not proof):\n${excerpt}`);
  }
  return `Full-source fingerprint: ${digest}\n${excerpts.join("\n\n")}${criterionExcerpts.length ? `\n\nExact criterion context:\n${criterionExcerpts.join("\n\n")}` : ""}`;
}

function selectSourceExcerpt(content: string, limit: number, guidance: string): string {
  if (content.length <= limit) return content;
  const notice = "\n[SOURCE EXCERPT: some content omitted. Do not infer missing requirements, environments or prerequisites; report them as unresolved.]\n";
  if (limit <= notice.length) return notice.slice(0, Math.max(0, limit));
  const terms = guidance.toLowerCase().match(/[a-z]{5,}/g) ?? [];
  const sections = content.split(/(?=^#{1,4}\s)/m).map((text, index) => ({ text, index,
    score: (/acceptance|manual test|precondition|user flow|interaction|scenario|setup|test data|accessibility|environment/i.test(text.split("\n")[0] ?? "") ? 10 : 0)
      + terms.filter((term) => text.toLowerCase().includes(term)).length,
  }));
  let budget = Math.max(0, limit - notice.length);
  const selected: { text: string; index: number }[] = [];
  for (const section of sections.sort((a, b) => b.score - a.score || a.index - b.index)) {
    if (!budget) break;
    const text = section.text.slice(0, budget);
    selected.push({ text, index: section.index });
    budget -= text.length;
  }
  return selected.sort((a, b) => a.index - b.index).map((section) => section.text).join("") + notice;
}

export async function prepareSteeredManualCases(options: GeneratePackOptions & {
  model: ManualTestDeliveryModel;
  expectedPackId: string | null;
}) {
  if (!options.runPrompt) throw new Error("Manual-test authoring model is unavailable; the existing pack was preserved.");
  const { context } = options;
  const guidance = options.guidance?.trim() ?? "";
  const sourceMarkdown = readFeatureDocuments(context.featFolderPath, guidance);
  const assertCurrent = async () => {
    const current = await context.store.getCurrentManualTestPack(context.projectId, context.cardKey);
    const latestModel = await buildManualTestDeliveryModel(context, options.sourceOptions);
    if ((current?.id ?? null) !== options.expectedPackId || hashManualTestDeliveryModel(latestModel) !== hashManualTestDeliveryModel(options.model)
      || readFeatureDocuments(context.featFolderPath, guidance) !== sourceMarkdown) {
      throw new Error("The feature sources or current pack changed during authoring. Refresh and retry; the proposal was not applied.");
    }
  };
  const fingerprint = createHash("sha256").update(JSON.stringify({ sourceMarkdown, guidance, model: hashManualTestDeliveryModel(options.model), packId: options.expectedPackId })).digest("hex");
  const authored = await authorWithCheckpoints({ guidance, sourceMarkdown,
    checkpointPath: resolve(context.featFolderPath, "manual-test-verification", "authoring-progress.json"), fingerprint,
    model: options.model, runPrompt: options.runPrompt, assertCurrent });
  await assertCurrent();
  const sourcePath = resolve(context.featFolderPath, "ManualTestCases.json");
  const previous = existsSync(sourcePath) ? JSON.parse(readFileSync(sourcePath, "utf8")) : { tests: [], history: [] };
  writeFileAtomic(sourcePath, JSON.stringify({ schemaVersion: "hepha-manual-test-cases/v1",
    tests: [...previous.tests, ...authored.tests], unresolved: authored.unresolved,
    history: [...(previous.history ?? []), { guidance, createdAt: new Date().toISOString(),
      sourceHash: hashManualTestDeliveryModel(options.model), addedIds: authored.tests.map((test) => test.id), unresolved: authored.unresolved }],
  }, null, 2));
}
