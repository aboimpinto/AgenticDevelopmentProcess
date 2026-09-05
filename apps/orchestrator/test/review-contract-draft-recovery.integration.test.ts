import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { recoverReviewContractDraft } from "../src/review-contract-draft-recovery.js";

const featurePath = fileURLToPath(new URL("./review-contract-draft-recovery.feature", import.meta.url));
const repairApplicationPath = fileURLToPath(new URL(
  "../src/workflows/reviews/phase-review-contract-repair-application.ts",
  import.meta.url,
));

describe("generic review-contract draft recovery Gherkin integration", () => {
  it("binds the generic scenarios to the executable recovery boundary", () => {
    const feature = readFileSync(featurePath, "utf8");
    const repairApplication = readFileSync(repairApplicationPath, "utf8");

    expect(feature).toContain("Scenario: A schema-invalid review draft is repaired in the same run");
    expect(feature).toContain("Scenario: A repair that makes no progress stops safely");
    expect(feature).toContain("Scenario: Unsafe review output is not echoed into a repair prompt");
    expect(feature).not.toMatch(/FEAT-\d+|Phase \d+|shadow parity|migration audit/i);
    expect(repairApplication).toContain("recoverReviewContractDraft");
    expect(repairApplication).toContain("buildReviewContractRepairPrompt");
  });

  it("revalidates a corrected candidate before authorizing persistence", async () => {
    const validations: string[] = [];
    const result = await recoverReviewContractDraft({
      initialDraft: '{"authority":"wrong"}',
      validate: (draft) => {
        validations.push(draft);
        return draft === '{"authority":"correct"}'
          ? { kind: "validated", value: { authoritative: true } }
          : { kind: "rejected", code: "ambiguous_rule_reference", message: "Invalid authority." };
      },
      repair: async () => '{"authority":"correct"}',
    });

    expect(validations).toEqual(['{"authority":"wrong"}', '{"authority":"correct"}']);
    expect(result).toMatchObject({ kind: "validated", value: { authoritative: true } });
  });
});
