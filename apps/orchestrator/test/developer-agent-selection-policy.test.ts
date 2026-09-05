import { describe, expect, it } from "vitest";
import { selectDeveloperAgentForStack } from "../src/workflows/phases/developer-agent-selection-policy.js";

describe("developer agent selection policy", () => {
  it.each([
    [["Rust", "Tauri"], "Rust Developer Agent"],
    [["C#", "ASP.NET"], "C# Developer Agent"],
    [["React", "TypeScript"], "Node/TypeScript Developer Agent"],
    [["Node.js"], "Node/TypeScript Developer Agent"],
    [["Unknown"], "Implementation Agent"],
    [[], "Implementation Agent"],
  ])("maps %j to %s", (stack, expected) => {
    expect(selectDeveloperAgentForStack(stack)).toBe(expected);
  });

  it("uses the specialized native agent when a mixed stack contains Rust", () => {
    expect(selectDeveloperAgentForStack(["React", "Rust", "TypeScript"]))
      .toBe("Rust Developer Agent");
  });
});
