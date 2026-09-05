import { describe, expect, it } from "vitest";
import { createWorkItemCardKey } from "../src/application/work-items/work-item-card-key-policy.js";

describe("work-item card key policy", () => {
  it("combines the work-item kind with a case-normalized external identity", () => {
    expect(createWorkItemCardKey("feature", "item-alpha")).toBe("feature:ITEM-ALPHA");
    expect(createWorkItemCardKey("epic", "parent-beta")).toBe("epic:PARENT-BETA");
  });
});
