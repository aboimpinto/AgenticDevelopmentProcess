import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  scanSafeContent,
  scanSafeParsedStringValues,
} from "../src/review-governance/content-safety.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(
  resolve(testRoot, "generic-review-governance-content-safety.feature"),
  "utf8",
);
const facade = readFileSync(resolve(testRoot, "../src/review-governance-store.ts"), "utf8");
const ingestValidation = readFileSync(resolve(testRoot, "../src/review-governance/review-ingest-validation.ts"), "utf8");

describe("generic review governance content-safety Gherkin integration", () => {
  it("specifies four identity-blind safety behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("executes transport and parsed-value safety boundaries", () => {
    expect(() => scanSafeContent("Safe review evidence 😀")).not.toThrow();
    expect(() => scanSafeParsedStringValues({ nested: "secret_key: exposed" }))
      .toThrow(/^SECURITY_VIOLATION$/);
  });

  it("keeps the SQLite store as a consumer rather than the safety owner", () => {
    expect(ingestValidation).toContain('from "./content-safety.js"');
    expect(facade).not.toContain('from "./review-governance/content-safety.js"');
    expect(facade).not.toContain("const SECRET_LIKE_PATTERNS");
    expect(facade).not.toContain("function scanSafeStringValue");
  });
});
