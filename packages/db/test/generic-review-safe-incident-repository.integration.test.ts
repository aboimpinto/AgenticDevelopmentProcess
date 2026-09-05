import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyReviewGovernanceMigrations } from "../src/review-governance/migrations/index.js";
import { ReviewSafeIncidentRepository } from "../src/review-governance/safe-incident-repository.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-review-safe-incident-repository.feature"), "utf8");
const facade = readFileSync(resolve(testRoot, "../src/review-governance-store.ts"), "utf8");

describe("generic review safe-incident repository Gherkin integration", () => {
  it("specifies four identity-blind incident behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("persists an incident through the production repository", () => {
    const database = new DatabaseSync(":memory:");
    applyReviewGovernanceMigrations(database);
    new ReviewSafeIncidentRepository(database).record({
      incidentId: "incident-runtime",
      projectId: "project-runtime",
      stage: "ingress",
      incidentCode: "invalid-input",
      createdAt: "2026-07-21T08:00:00Z",
    });
    expect(database.prepare("select count(*) as count from hepha_review_safe_incidents").get())
      .toEqual({ count: 1 });
    database.close();
  });

  it("keeps safe-incident SQL and validation outside the facade", () => {
    expect(facade).toContain("this.safeIncidentRepository.record(rawInput)");
    expect(facade).not.toContain("insert into hepha_review_safe_incidents");
    expect(facade).not.toContain("function validateSafeIncidentInput");
  });
});
