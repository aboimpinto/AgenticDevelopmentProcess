import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReviewArtifactRepository } from "../src/review-governance/artifact-repository.js";
import { ReviewEvidenceRepository } from "../src/review-governance/evidence-repository.js";
import { ReviewGateRepository } from "../src/review-governance/gate-repository.js";
import { applyReviewGovernanceMigrations } from "../src/review-governance/migrations/index.js";
import { ReviewIngestRepository } from "../src/review-governance/review-ingest-repository.js";
import { resolveCurrentCatalogSnapshots } from "../src/review-governance/review-ingest-validation.js";
import { makeValidReviewIngestRequest, reviewIngestSnapshot } from "./support/review-ingest-fixture.js";

describe("ReviewIngestRepository", () => {
  let database: DatabaseSync;
  let artifacts: ReviewArtifactRepository;
  let repository: ReviewIngestRepository;

  beforeEach(() => {
    database = new DatabaseSync(":memory:");
    database.exec("pragma foreign_keys = on");
    applyReviewGovernanceMigrations(database);
    artifacts = new ReviewArtifactRepository(database);
    repository = new ReviewIngestRepository(
      database,
      artifacts,
      new ReviewEvidenceRepository(database),
      new ReviewGateRepository(database),
      resolveCurrentCatalogSnapshots([reviewIngestSnapshot]),
    );
  });

  afterEach(() => database.close());

  it("atomically persists a validated aggregate and verifies every derived identity", () => {
    const request = makeValidReviewIngestRequest();
    expect(repository.ingestValidatedReviewEvidence(request)).toBe(request.contentHash);
    expect(artifacts.getByHash(request.contentHash)).toMatchObject({
      contentHash: request.contentHash, artifactId: "manifest-alpha",
      projectId: "project-alpha", featureId: "work-item-alpha",
    });
    const counts = database.prepare(`select
      (select count(*) from hepha_review_runs) as runs,
      (select count(*) from hepha_review_findings) as findings,
      (select count(*) from hepha_review_finding_observations) as observations`).get() as Record<string, number>;
    expect(counts).toEqual({ runs: 1, findings: 1, observations: 1 });
  });

  it("leaves no partial rows when canonical validation fails", () => {
    const request = makeValidReviewIngestRequest();
    expect(() => repository.ingestValidatedReviewEvidence({ ...request, artifactId: "different-artifact" })).toThrow(/^INVALID_INPUT$/);
    const count = database.prepare("select count(*) as total from hepha_review_artifacts").get() as { total: number };
    expect(count.total).toBe(0);
  });
});
