import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  persistReviewArtifactFileV1,
  ReviewArtifactFileStore,
} from "../src/review-governance/artifact-file-store.js";

let directoryCounter = 0;

function fixture() {
  directoryCounter += 1;
  const projectRoot = resolve(tmpdir(), `review-artifact-store-${process.pid}-${directoryCounter}`);
  const canonicalJson = '{"artifactId":"manifest-alpha","artifactKind":"review_manifest"}';
  const contentHash = createHash("sha256").update(canonicalJson, "utf8").digest("hex");
  return {
    projectRoot,
    input: {
      projectRoot,
      featureRootPath: "MemoryBank/Features/current/work-item",
      artifactKind: "review_manifest" as const,
      contentHash,
      canonicalJson,
    },
  };
}

describe("review artifact file store", () => {
  it("atomically creates and then reuses identical content", () => {
    const { projectRoot, input } = fixture();
    mkdirSync(projectRoot, { recursive: true });
    try {
      const store = new ReviewArtifactFileStore();
      const created = store.persistValidated(input);
      expect(created.created).toBe(true);
      expect(readFileSync(created.path, "utf8")).toBe(input.canonicalJson);
      expect(store.persistValidated(input)).toEqual({ path: created.path, created: false });
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("rejects a different file at the content-addressed destination", () => {
    const { projectRoot, input } = fixture();
    const finalPath = resolve(
      projectRoot,
      input.featureRootPath,
      "code-reviews/artifacts/review_manifest",
      `${input.contentHash}.json`,
    );
    mkdirSync(dirname(finalPath), { recursive: true });
    writeFileSync(finalPath, "different bytes", "utf8");
    try {
      expect(() => new ReviewArtifactFileStore().persistValidated(input))
        .toThrow(/^FILE_COLLISION$/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("contains injected filesystem failures to one publisher instance", () => {
    const { projectRoot, input } = fixture();
    mkdirSync(projectRoot, { recursive: true });
    try {
      const failing = new ReviewArtifactFileStore({
        writeFileSync: (() => { throw Object.assign(new Error("write"), { code: "EIO" }); }) as typeof import("node:fs").writeFileSync,
      });
      expect(() => failing.persistValidated(input)).toThrow(/^PERSISTENCE_FAILED$/);

      const healthy = new ReviewArtifactFileStore();
      expect(healthy.persistValidated(input).created).toBe(true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("does not create a missing project root implicitly", () => {
    const { projectRoot, input } = fixture();
    rmSync(projectRoot, { recursive: true, force: true });
    expect(() => new ReviewArtifactFileStore().persistValidated(input))
      .toThrow(/^PERSISTENCE_FAILED$/);
  });

  it("validates the closed public request before publisher dispatch", () => {
    const { input } = fixture();
    let calls = 0;
    const publisher = {
      persistValidated: () => {
        calls += 1;
        return { path: "unused", created: true };
      },
    };
    expect(() => persistReviewArtifactFileV1({ ...input, contentHash: "invalid" }, publisher))
      .toThrow(/^INVALID_INPUT$/);
    expect(() => persistReviewArtifactFileV1({ ...input, extra: true }, publisher))
      .toThrow(/^INVALID_INPUT$/);
    expect(calls).toBe(0);
  });

  it("dispatches an exact canonical request to the injected publisher", () => {
    const { input } = fixture();
    let received: unknown;
    const expected = { path: "published", created: true };
    const publisher = { persistValidated: (request: unknown) => { received = request; return expected; } };
    expect(persistReviewArtifactFileV1(input, publisher)).toEqual(expected);
    expect(received).toEqual(input);
  });
});
