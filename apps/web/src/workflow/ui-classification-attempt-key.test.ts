import { describe, expect, it } from "vitest";
import type { WorkItemCard } from "@hepha/shared";
import { uiClassificationAttemptKey } from "./ui-classification-attempt-key.js";

describe("UI classification attempts", () => {
  it("deduplicates scans but retries changed source and isolates projects", () => {
    const item = { id: "sample", specMarkdown: "# Original" } as WorkItemCard;
    const key = uiClassificationAttemptKey("project", item);
    expect(uiClassificationAttemptKey("project", { ...item, documentUpdatedAt: "later" })).toBe(key);
    expect(uiClassificationAttemptKey("project", { ...item, specMarkdown: "# Revised" })).not.toBe(key);
    expect(uiClassificationAttemptKey("another-project", item)).not.toBe(key);
  });
});
