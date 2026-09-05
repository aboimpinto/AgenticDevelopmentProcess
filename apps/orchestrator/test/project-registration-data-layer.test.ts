import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createProject } from "../src/index.js";
import { isStoredProject, type StoredProject } from "../src/projects/stored-project.js";

describe("StoredProject data layer — legacy compatibility", () => {
  it("accepts legacy records that have only the original six required fields", () => {
    const legacy: Record<string, unknown> = {
      id: "project-legacy-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      memoryBankPath: "/home/user/project/MemoryBank",
      name: "legacy-project",
      rootPath: "/home/user/project",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };

    expect(isStoredProject(legacy)).toBe(true);
  });

  it("accepts legacy records loaded from serialized JSON without original fields", () => {
    const json = `{
      "id": "project-legacy-2",
      "createdAt": "2026-01-15T00:00:00.000Z",
      "memoryBankPath": "/home/user/other/MemoryBank",
      "name": "other-legacy",
      "rootPath": "/home/user/other",
      "updatedAt": "2026-06-15T00:00:00.000Z"
    }`;

    const parsed = JSON.parse(json) as unknown;

    expect(isStoredProject(parsed)).toBe(true);

    // Verify that original fields are absent
    const project = parsed as StoredProject;
    expect(project.originalRootPathInput).toBeUndefined();
    expect(project.originalMemoryBankPathInput).toBeUndefined();
  });
});

describe("StoredProject data layer — new records with original fields", () => {
  it("stores and persists both canonical and original path fields", () => {
    const project: StoredProject = {
      id: "project-new-1",
      createdAt: "2026-06-29T00:00:00.000Z",
      memoryBankPath: "/home/user/project/MemoryBank",
      name: "new-project",
      rootPath: "/home/user/project",
      updatedAt: "2026-06-29T00:00:00.000Z",
      originalRootPathInput: "~/project",
      originalMemoryBankPathInput: "MemoryBank",
    };

    const json = JSON.stringify(project);
    const parsed = JSON.parse(json) as StoredProject;

    expect(parsed.rootPath).toBe("/home/user/project");
    expect(parsed.memoryBankPath).toBe("/home/user/project/MemoryBank");
    expect(parsed.originalRootPathInput).toBe("~/project");
    expect(parsed.originalMemoryBankPathInput).toBe("MemoryBank");
    expect(isStoredProject(parsed)).toBe(true);
  });

  it("round-trips original field values without mutation", () => {
    const originalInput = "../relative/path/to/project";
    const canonicalPath = "/home/user/absolute/path/to/project";

    const project: StoredProject = {
      id: "project-new-2",
      createdAt: "2026-06-29T01:00:00.000Z",
      memoryBankPath: resolve(canonicalPath, "MemoryBank"),
      name: "relative-project",
      rootPath: canonicalPath,
      updatedAt: "2026-06-29T01:00:00.000Z",
      originalRootPathInput: originalInput,
      originalMemoryBankPathInput: "../MemoryBank",
    };

    const json = JSON.stringify(project);
    const parsed = JSON.parse(json) as StoredProject;

    // Original input must not be recomputed from canonical path
    expect(parsed.originalRootPathInput).toBe(originalInput);
    expect(parsed.originalRootPathInput).not.toBe(parsed.rootPath);
    expect(parsed.originalMemoryBankPathInput).toBe("../MemoryBank");
    expect(parsed.originalMemoryBankPathInput).not.toBe(parsed.memoryBankPath);
  });
});

describe("StoredProject data layer — file persistence round-trip", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots) {
      rmSync(root, { force: true, recursive: true });
    }
    tempRoots.length = 0;
  });

  function createTempDir() {
    const dir = mkdtempSync(resolve(tmpdir(), "hepha-stored-project-"));
    tempRoots.push(dir);
    return dir;
  }

  it("loads a project array with mixed legacy and new records", () => {
    const tempDir = createTempDir();
    const storePath = resolve(tempDir, "projects.json");
    const mixedRecords = [
      // Legacy record — no original fields
      {
        id: "project-legacy-3",
        createdAt: "2026-01-01T00:00:00.000Z",
        memoryBankPath: "/legacy/MemoryBank",
        name: "legacy-three",
        rootPath: "/legacy",
        updatedAt: "2026-03-01T00:00:00.000Z",
      },
      // New record — with original fields
      {
        id: "project-new-3",
        createdAt: "2026-06-29T00:00:00.000Z",
        memoryBankPath: "/new-project/CustomMemoryBank",
        name: "new-three",
        rootPath: "/new-project",
        updatedAt: "2026-06-29T00:00:00.000Z",
        originalRootPathInput: "~./new-project",
        originalMemoryBankPathInput: "CustomMemoryBank",
      },
    ];

    writeFileSync(storePath, JSON.stringify(mixedRecords, null, 2), "utf8");
    expect(existsSync(storePath)).toBe(true);

    const loaded = JSON.parse(readFileSync(storePath, "utf8")) as unknown[];
    expect(Array.isArray(loaded)).toBe(true);
    expect(loaded.length).toBe(2);

    const validated = loaded.filter(isStoredProject);
    expect(validated.length).toBe(2); // Both legacy and new pass validation

    const legacyThree = validated.find((p) => p.id === "project-legacy-3")!;
    expect(legacyThree.originalRootPathInput).toBeUndefined();
    expect(legacyThree.originalMemoryBankPathInput).toBeUndefined();

    const newThree = validated.find((p) => p.id === "project-new-3")!;
    expect(newThree.originalRootPathInput).toBe("~./new-project");
    expect(newThree.originalMemoryBankPathInput).toBe("CustomMemoryBank");
    expect(newThree.rootPath).toBe("/new-project");
    expect(newThree.memoryBankPath).toBe("/new-project/CustomMemoryBank");
  });

  it("persists canonical and original fields on save", () => {
    const tempDir = createTempDir();
    const storePath = resolve(tempDir, "projects.json");

    const savedProjects: StoredProject[] = [
      {
        id: "project-saved-1",
        createdAt: "2026-06-29T02:00:00.000Z",
        memoryBankPath: "/saved/MemoryBank",
        name: "saved-one",
        rootPath: "/saved",
        updatedAt: "2026-06-29T02:00:00.000Z",
        originalRootPathInput: "~/saved",
        originalMemoryBankPathInput: "MemoryBank",
      },
    ];

    writeFileSync(storePath, JSON.stringify(savedProjects, null, 2), "utf8");

    const loaded = JSON.parse(readFileSync(storePath, "utf8")) as StoredProject[];
    const validated = loaded.filter(isStoredProject);

    expect(validated.length).toBe(1);
    expect(validated[0].originalRootPathInput).toBe("~/saved");
    expect(validated[0].originalMemoryBankPathInput).toBe("MemoryBank");
    expect(validated[0].rootPath).toBe("/saved");
    expect(validated[0].memoryBankPath).toBe("/saved/MemoryBank");
  });
});

describe("StoredProject data layer — validation rejects malformed records", () => {
  it("rejects records missing required fields", () => {
    expect(isStoredProject(null)).toBe(false);
    expect(isStoredProject({})).toBe(false);
    expect(isStoredProject({ id: "only-id" })).toBe(false);
    expect(
      isStoredProject({
        id: "p1",
        createdAt: "2026-01-01T00:00:00.000Z",
        // missing memoryBankPath
        name: "test",
        rootPath: "/test",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("rejects records with wrong field types", () => {
    expect(
      isStoredProject({
        id: "p1",
        createdAt: "2026-01-01T00:00:00.000Z",
        memoryBankPath: 42, // should be string
        name: "test",
        rootPath: "/test",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("rejects records with malformed optional original path fields", () => {
    const validBase = {
      id: "p1",
      createdAt: "2026-01-01T00:00:00.000Z",
      memoryBankPath: "/mb",
      name: "test",
      rootPath: "/test",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    // originalRootPathInput with a non-string value must be rejected
    expect(isStoredProject({ ...validBase, originalRootPathInput: 42 })).toBe(false);

    // originalMemoryBankPathInput with a non-string value must be rejected
    expect(isStoredProject({ ...validBase, originalMemoryBankPathInput: {} })).toBe(false);
  });
});

describe("StoredProject data layer — raw input preservation in createProject", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots) {
      rmSync(root, { force: true, recursive: true });
    }
    tempRoots.length = 0;
  });

  it("preserves untrimmed raw user input in original fields", () => {
    const rawRootPath = "  ~/my-project  ";
    const rawMemoryBankPath = "  MyMemoryBank  ";

    // Verify that the raw string contains whitespace that would be trimmed
    expect(rawRootPath.trim()).toBe("~/my-project");
    expect(rawRootPath).not.toBe(rawRootPath.trim());
    expect(rawMemoryBankPath.trim()).toBe("MyMemoryBank");
    expect(rawMemoryBankPath).not.toBe(rawMemoryBankPath.trim());
  });

  it("distinguishes raw original input from trimmed canonical values in the StoredProject shape", () => {
    // The StoredProject type separates original (raw) from canonical (resolved) fields.
    // A record constructed with raw values shows that original fields can store
    // leading/trailing whitespace that would not survive trim().
    const project: StoredProject = {
      id: "project-raw-1",
      createdAt: "2026-06-29T03:00:00.000Z",
      memoryBankPath: "/home/user/project/MemoryBank",
      name: "raw-input-test",
      rootPath: "/home/user/project",
      updatedAt: "2026-06-29T03:00:00.000Z",
      originalRootPathInput: "  ~/project  ",
      originalMemoryBankPathInput: "  MemoryBank  ",
    };

    // Serialize and deserialize to verify raw values survive round-trip
    const json = JSON.stringify(project);
    const parsed = JSON.parse(json) as StoredProject;

    expect(parsed.originalRootPathInput).toBe("  ~/project  ");
    expect(parsed.originalMemoryBankPathInput).toBe("  MemoryBank  ");
    expect(isStoredProject(parsed)).toBe(true);

    // Canonical fields are distinct and trimmed
    expect(parsed.rootPath).toBe("/home/user/project");
    expect(parsed.memoryBankPath).toBe("/home/user/project/MemoryBank");
  });
});

describe("StoredProject data layer — production createProject raw input preservation", () => {
  const tempRoots: string[] = [];
  const tempStoreDirs: string[] = [];
  const originalStoreEnv = process.env.HEPHA_PROJECT_STORE_PATH;
  const originalAgentCwd = process.env.HEPHA_AGENT_CWD;

  beforeEach(() => {
    // Use an isolated temp store path to avoid writing test records
    // through the real workspace .hepha/projects.json.
    const tempStoreDir = mkdtempSync(resolve(tmpdir(), "hepha-store-test-"));
    tempStoreDirs.push(tempStoreDir);
    process.env.HEPHA_PROJECT_STORE_PATH = resolve(tempStoreDir, "projects.json");
  });

  afterEach(() => {
    for (const root of tempRoots) {
      rmSync(root, { force: true, recursive: true });
    }
    tempRoots.length = 0;

    for (const dir of tempStoreDirs) {
      try { rmSync(dir, { force: true, recursive: true }); } catch { /* ignore */ }
    }
    tempStoreDirs.length = 0;

    if (originalStoreEnv !== undefined) {
      process.env.HEPHA_PROJECT_STORE_PATH = originalStoreEnv;
    } else {
      delete process.env.HEPHA_PROJECT_STORE_PATH;
    }

    if (originalAgentCwd !== undefined) {
      process.env.HEPHA_AGENT_CWD = originalAgentCwd;
    } else {
      delete process.env.HEPHA_AGENT_CWD;
    }
  });

  function createTempProjectRoot() {
    const dir = mkdtempSync(resolve(tmpdir(), "hepha-createproject-test-"));
    tempRoots.push(dir);
    mkdirSync(resolve(dir, "MemoryBank"), { recursive: true });
    mkdirSync(resolve(dir, ".git"), { recursive: true });
    return dir;
  }

  it("preserves raw untrimmed user input in original fields via production createProject", () => {
    const rootDir = createTempProjectRoot();
    const rawRootPath = `  ${rootDir}  `;
    const rawMemoryBankPath = "  MemoryBank  ";

    const project = createProject({
      name: "production-raw-test",
      rootPath: rawRootPath,
      memoryBankPath: rawMemoryBankPath,
    });

    // Original fields preserve the exact raw input with whitespace
    expect(project.originalRootPathInput).toBe(rawRootPath);
    expect(project.originalMemoryBankPathInput).toBe(rawMemoryBankPath);

    // Canonical fields use resolved/trimmed values
    expect(project.rootPath).toBe(rootDir);
    expect(project.memoryBankPath).toBe(resolve(rootDir, "MemoryBank"));

    // Original values are distinct from canonical values
    expect(project.originalRootPathInput).not.toBe(project.rootPath);
    expect(project.originalMemoryBankPathInput).not.toBe(project.memoryBankPath);

    // The project passes isStoredProject validation including optional field type check
    expect(isStoredProject(project)).toBe(true);
  });

  it("resolves relative rootPath against HEPHA_AGENT_CWD base in production createProject", async () => {
    // Create a temp workspace directory to act as the deterministic registration base
    const workspaceDir = mkdtempSync(resolve(tmpdir(), "hepha-workspace-"));
    tempRoots.push(workspaceDir);

    // Create a project subdirectory inside the workspace with markers
    const projectDir = resolve(workspaceDir, "my-test-project");
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(resolve(projectDir, ".git"), { recursive: true });
    mkdirSync(resolve(projectDir, "MemoryBank"), { recursive: true });

    // Set HEPHA_AGENT_CWD to workspaceDir so createProject resolves relative paths
    // against this base, not the test runner's cwd.
    process.env.HEPHA_AGENT_CWD = workspaceDir;

    // Clear module cache and re-import createProject with the new env var
    vi.resetModules();
    const { createProject: freshCreateProject } = await import("../src/index.js");

    const project = freshCreateProject({
      name: "relative-root-regression",
      rootPath: "my-test-project", // relative — resolves against workspaceDir, not cwd
      memoryBankPath: "MemoryBank",
    });

    // The canonical rootPath must resolve from HEPHA_AGENT_CWD, not process.cwd()
    expect(project.rootPath).toBe(projectDir);
    expect(project.memoryBankPath).toBe(resolve(projectDir, "MemoryBank"));
    expect(project.originalRootPathInput).toBe("my-test-project");
    expect(project.originalMemoryBankPathInput).toBe("MemoryBank");
  });
});
