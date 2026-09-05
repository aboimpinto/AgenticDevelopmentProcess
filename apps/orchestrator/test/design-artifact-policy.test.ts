import { describe, expect, it, vi } from "vitest";
import { DesignArtifactPolicy } from "../src/application/features/design-artifact-policy.js";

describe("design artifact policy", () => {
  it("accepts all three required non-empty artifacts", () => {
    const readSnippet = vi.fn(() => "# Evidence");
    const policy = new DesignArtifactPolicy({ exists: () => true, readSnippet });
    expect(() => policy.assertComplete({ folderPath: "/work" })).not.toThrow();
    expect(readSnippet).toHaveBeenCalledTimes(3);
  });

  it("reports every missing or empty artifact together", () => {
    const policy = new DesignArtifactPolicy({
      exists: (path) => !path.endsWith("UX-research-report.md"),
      readSnippet: (path) => path.endsWith("Wireframes-design.md") ? " " : "# Complete",
    });
    expect(() => policy.assertComplete({ folderPath: "/work" })).toThrow(
      /UX-research-report\.md, Wireframes-design\.md/,
    );
  });
});
