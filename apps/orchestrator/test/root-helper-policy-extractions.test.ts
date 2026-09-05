import { describe, expect, it, vi } from "vitest";
import { ProjectChangeNotifier } from "../src/application/projects/project-change-notifier.js";
import { normalizeRelativeProjectPath } from "../src/application/projects/relative-project-path-policy.js";
import { slugifySessionFileComponent } from "../src/runtime/pi/session-file-name-policy.js";

describe("extracted root helper policies", () => {
  it("broadcasts project changes to both streams", () => {
    const notifyLive = vi.fn();
    const notifyMemoryBank = vi.fn();
    new ProjectChangeNotifier({ notifyLive, notifyMemoryBank }).notify("project", "workflow.completed", "ITEM");
    expect(notifyMemoryBank).toHaveBeenCalledWith("project", "workflow.completed", "ITEM");
    expect(notifyLive).toHaveBeenCalledWith("project", "workflow.completed", "ITEM");
  });

  it("normalizes only paths contained by the project root", () => {
    expect(normalizeRelativeProjectPath("/project", "/project/docs/file.md")).toBe("docs/file.md");
    expect(normalizeRelativeProjectPath("/project", "/external/file.md")).toBe("/external/file.md");
  });

  it("creates bounded safe Pi session filename components", () => {
    expect(slugifySessionFileComponent("Review / Fixer Agent")).toBe("review-fixer-agent");
    expect(slugifySessionFileComponent("***")).toBe("option");
    expect(slugifySessionFileComponent("A".repeat(80))).toHaveLength(48);
  });
});
