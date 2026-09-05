import { describe, expect, it, vi } from "vitest";
import { createRuntimeMetadataStore, prepareRegisteredProjects } from "../src/bootstrap/orchestrator-host-lifecycle.js";

describe("orchestrator host lifecycle", () => {
  it("reports an enabled metadata store", async () => {
    const log = vi.fn();
    const store = await createRuntimeMetadataStore({
      create: vi.fn(() => ({ databasePath: "/state/hepha.sqlite", enabled: true })),
      env: {},
      log,
    });
    expect(store.enabled).toBe(true);
    expect(log).toHaveBeenCalledWith("Hepha metadata store: SQLite (/state/hepha.sqlite)");
  });

  it("does not report a disabled metadata store as SQLite", async () => {
    const log = vi.fn();
    await createRuntimeMetadataStore({ create: vi.fn(() => ({ enabled: false })), env: {}, log });
    expect(log).not.toHaveBeenCalled();
  });

  it("continues preparing projects after an isolated startup failure", async () => {
    const projects = [
      { id: "one", name: "One", rootPath: "/one" },
      { id: "two", name: "Two", rootPath: "/two" },
    ];
    const prepare = vi.fn(async (project: { id: string }) => {
      if (project.id === "one") throw new Error("failed");
    });
    const report = vi.fn();
    await prepareRegisteredProjects({ options: { env: {} }, prepare, projects, report });
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledWith(projects[0], expect.objectContaining({ message: "failed" }));
  });
});
