import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { applyReviewGovernanceMigrations } from "../src/review-governance/migrations/index.js";
import {
  ReviewSafeIncidentRepository,
  validateSafeIncidentInput,
} from "../src/review-governance/safe-incident-repository.js";

const validIncident = {
  incidentId: "incident-alpha",
  projectId: "project-alpha",
  featureId: "work-item-alpha",
  phaseNumber: 2,
  reviewGateId: "review-gate",
  stage: "persistence",
  incidentCode: "safe-refusal",
  contentHash: "a".repeat(64),
  createdAt: "2026-07-21T08:00:00.000Z",
};

function createRepository(): { database: DatabaseSync; repository: ReviewSafeIncidentRepository } {
  const database = new DatabaseSync(":memory:");
  applyReviewGovernanceMigrations(database);
  return { database, repository: new ReviewSafeIncidentRepository(database) };
}

describe("review safe-incident repository", () => {
  it("validates and persists the complete secret-safe projection", () => {
    const { database, repository } = createRepository();
    repository.record(validIncident);
    expect(database.prepare(
      `select incident_id as incidentId, project_id as projectId, feature_id as featureId,
              phase_number as phaseNumber, review_gate_id as reviewGateId, stage,
              incident_code as incidentCode, content_hash as contentHash, created_at as createdAt
       from hepha_review_safe_incidents`,
    ).get()).toEqual(validIncident);
    database.close();
  });

  it.each([
    null,
    [],
    { ...validIncident, unknown: "forbidden" },
    { ...validIncident, stage: "token: exposed" },
    { ...validIncident, incidentCode: "x".repeat(129) },
    { ...validIncident, phaseNumber: -1 },
    { ...validIncident, contentHash: "invalid" },
    { ...validIncident, createdAt: "2026-02-30T08:00:00Z" },
    { ...validIncident, featureId: null },
  ])("rejects malformed or unsafe input before persistence", (input) => {
    expect(() => validateSafeIncidentInput(input)).toThrow(/^INVALID_INPUT$/);
  });

  it("accepts the minimal incident shape", () => {
    expect(validateSafeIncidentInput({
      incidentId: "incident-minimal",
      projectId: "project-alpha",
      stage: "validation",
      incidentCode: "invalid-input",
      createdAt: "2026-07-21T08:00:00+00:00",
    })).toMatchObject({ incidentId: "incident-minimal" });
  });

  it("maps duplicate and closed-database failures to one persistence boundary", () => {
    const { database, repository } = createRepository();
    repository.record(validIncident);
    expect(() => repository.record(validIncident)).toThrow(/^PERSISTENCE_FAILED$/);
    database.close();
    expect(() => repository.record({ ...validIncident, incidentId: "incident-after-close" }))
      .toThrow(/^PERSISTENCE_FAILED$/);
  });
});
