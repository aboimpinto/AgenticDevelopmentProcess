import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createCardMetadataStore } from "../src/index.js";
import { DisabledCardMetadataStore } from "../src/adapters/disabled-card-metadata-store.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(
  resolve(testRoot, "generic-disabled-metadata-adapter.feature"),
  "utf8",
);

describe("generic disabled metadata adapter Gherkin integration", () => {
  it("specifies four identity-blind disabled-persistence paths", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("composes the null adapter through the production factory", async () => {
    const store = createCardMetadataStore({ HEPHA_DISABLE_METADATA_STORE: "1" });

    expect(store).toBeInstanceOf(DisabledCardMetadataStore);
    expect(store.enabled).toBe(false);
    await expect(store.getCardMetadata("project-a", "feature/example")).resolves.toBeNull();
    await expect(store.listImplementationTaskRuns("project-a", "feature/example", 1)).resolves.toEqual([]);
    await expect(store.close()).resolves.toBeUndefined();
  });
});
