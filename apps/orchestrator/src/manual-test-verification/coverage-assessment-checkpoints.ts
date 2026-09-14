import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "./artifact-storage.js";

export interface CoverageAssessmentCheckpoint { directory: string; fingerprint: string; reassessDecisions?: boolean }
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** Persist only validated complete stages. Reloads are validated again, never treated as approvals. */
export async function runCoverageStage<T>(prompt: string, runPrompt: (prompt: string) => Promise<string>, validate: (response: string) => T,
  checkpoint?: CoverageAssessmentCheckpoint, reuse = true): Promise<T> {
  const key = hash(JSON.stringify(["coverage-stage/v1", checkpoint?.fingerprint, prompt]));
  const path = checkpoint ? join(checkpoint.directory, `${key}.json`) : undefined;
  if (path && reuse) {
    try {
      const stat = lstatSync(path);
      if (stat.isFile() && !stat.isSymbolicLink() && stat.size <= 3_000_000) {
        const saved = JSON.parse(readFileSync(path, "utf8"));
        if (saved.key === key && typeof saved.response === "string") return validate(saved.response);
      }
    } catch { /* Missing, damaged, or invalid checkpoints are retried, not used as evidence. */ }
  }
  const response = await runPrompt(prompt);
  const result = validate(response);
  if (path && response.length <= 1_000_000) writeFileAtomic(path, JSON.stringify({ key, response }));
  return result;
}
