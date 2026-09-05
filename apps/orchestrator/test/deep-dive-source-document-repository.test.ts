import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DeepDiveSourceDocumentRepository } from "../src/application/deep-dive/deep-dive-source-document-repository.js";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

describe("deep-dive source document repository", () => {
  it("normalizes the final newline and reads hash, timestamp, and semantic evidence", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "hepha-deep-dive-source-"));
    temporaryDirectories.push(directory);
    const path = resolve(directory, "source.md");
    const repository = new DeepDiveSourceDocumentRepository();
    repository.write(path, "# Updated   \n\nDecision");

    const persisted = readFileSync(path, "utf8");
    const evidence = repository.readEvidence(path);
    expect(persisted).toBe("# Updated   \n\nDecision\n");
    expect(evidence.sourceDocumentHash).toBe(createHash("sha256").update(persisted).digest("hex"));
    expect(evidence.sourceDocumentUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(evidence.semanticSource).toContain("Decision");
  });
});
