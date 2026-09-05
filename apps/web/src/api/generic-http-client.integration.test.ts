import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createHttpClient } from "./http-client.js";

const sourceRoot = resolve(import.meta.dirname, "..");
const specification = readFileSync(resolve(import.meta.dirname, "generic-http-client.feature"), "utf8");
const shell = readFileSync(resolve(sourceRoot, "app-shell.tsx"), "utf8");
const workspaceController = readFileSync(
  resolve(sourceRoot, "workspace/use-workspace-controller.ts"),
  "utf8",
);

describe("generic dashboard HTTP transport Gherkin integration", () => {
  it("specifies four capability-blind transport behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("exposes one injectable production transport boundary", () => {
    const client = createHttpClient(vi.fn() as unknown as typeof fetch);

    expect(client.get).toBeTypeOf("function");
    expect(client.post).toBeTypeOf("function");
    expect(client.request).toBeTypeOf("function");
  });

  it("keeps raw HTTP mechanics outside the application shell", () => {
    expect(workspaceController).toContain('from "../api/http-client.js"');
    expect(shell).not.toContain('from "./api/http-client.js"');
    expect(shell).not.toContain("async function apiRequest");
    expect(shell).not.toContain("await fetch(path, init)");
    expect(shell).not.toContain('"Content-Type": "application/json"');
  });
});
