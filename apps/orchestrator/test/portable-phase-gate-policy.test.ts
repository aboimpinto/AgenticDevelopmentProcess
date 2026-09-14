import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const templates = [
  "pi-packages/pi-skill-hepha-companion/skills/continue-implementation/SKILL.md",
  "pi-packages/pi-skill-hepha-continue-implementation/skills/continue-implementation/SKILL.md",
  "pi-packages/pi-skill-hepha-continue-implementation/skills/start-feature/SKILL.md",
  "pi-packages/pi-skill-hepha-continue-implementation/skills/refine-feature/SKILL.md",
  ".hepha/commands/refine-feature.md",
];
it.each(templates)("%s retains declared gate ownership in the shipped instructions", file => {
  const prompt = readFileSync(resolve(file), "utf8").replace(/\s+/g, " ");
  expect(prompt).not.toMatch(/(?:Required for|require) browser\/UI behavior changes|Browser\/UI behavior changes require|For code-relevant phases|Production code changes require automated tests/);
  expect(prompt).toContain("needCodeReview");
  expect(prompt).toContain("needTestCoverage");
});
