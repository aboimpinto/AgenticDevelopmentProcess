import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderHephaCommandTemplate } from "../src/hepha-command-template.js";

describe("hepha command templates", () => {
  it("renders a frontmatter-backed command template", () => {
    const workspaceRoot = mkdtempSync(resolve(tmpdir(), "hepha-template-"));
    const commandDir = resolve(workspaceRoot, ".hepha/commands");

    mkdirSync(commandDir, { recursive: true });
    writeFileSync(
      resolve(commandDir, "example.md"),
      ["---", "name: example", "---", "# Example", "", "Project: {{projectName}}"].join("\n"),
    );

    expect(
      renderHephaCommandTemplate({
        commandPath: "commands/example.md",
        variables: { projectName: "Demo" },
        workspaceRoot,
      }),
    ).toBe("# Example\n\nProject: Demo");
  });

  it("rejects missing template variables", () => {
    const workspaceRoot = mkdtempSync(resolve(tmpdir(), "hepha-template-"));
    const commandDir = resolve(workspaceRoot, ".hepha/commands");

    mkdirSync(commandDir, { recursive: true });
    writeFileSync(resolve(commandDir, "example.md"), "Missing {{requiredValue}}");

    expect(() =>
      renderHephaCommandTemplate({
        commandPath: "commands/example.md",
        variables: {},
        workspaceRoot,
      }),
    ).toThrow(/requiredValue/);
  });

  it("rejects command paths outside .hepha", () => {
    const workspaceRoot = mkdtempSync(resolve(tmpdir(), "hepha-template-"));

    expect(() =>
      renderHephaCommandTemplate({
        commandPath: "../outside.md",
        variables: {},
        workspaceRoot,
      }),
    ).toThrow(/must stay under/);
  });
});
