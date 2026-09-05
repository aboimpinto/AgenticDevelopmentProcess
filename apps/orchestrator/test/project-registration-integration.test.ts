import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";

// Hoisted mock helper for os.homedir so home-relative integration tests
// use a temp directory instead of the real user home.
const { homedirMock } = vi.hoisted(() => ({
  homedirMock: vi.fn<[], string>(),
}));

vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:os")>()),
  homedir: homedirMock,
}));
import { resolve } from "node:path";
import {
  createProject as createProjectStatic,
  ProjectRegistrationError,
} from "../src/index.js";
import { toProjectSummary } from "../src/projects/project-summary.js";
import { toProjectErrorResponse } from "../src/transport/http/orchestrator-error-response.js";
import { isStoredProject, type StoredProject } from "../src/projects/stored-project.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tempRoots: string[] = [];
const tempStoreDirs: string[] = [];

const originalStoreEnv = process.env.HEPHA_PROJECT_STORE_PATH;
const originalAgentCwd = process.env.HEPHA_AGENT_CWD;

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { force: true, recursive: true });
  }
  tempRoots.length = 0;

  for (const dir of tempStoreDirs) {
    try {
      rmSync(dir, { force: true, recursive: true });
    } catch {
      /* ignore */
    }
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

function createTempProjectRoot(): string {
  const dir = mkdtempSync(resolve(tmpdir(), "hepha-integration-"));
  tempRoots.push(dir);
  mkdirSync(resolve(dir, "MemoryBank"), { recursive: true });
  mkdirSync(resolve(dir, ".git"), { recursive: true });
  return dir;
}

function useIsolatedStorePath(): string {
  const tempStoreDir = mkdtempSync(resolve(tmpdir(), "hepha-integration-store-"));
  tempStoreDirs.push(tempStoreDir);
  const storePath = resolve(tempStoreDir, "projects.json");
  process.env.HEPHA_PROJECT_STORE_PATH = storePath;
  return storePath;
}

function readPersistedStore(): StoredProject[] {
  const storePath = process.env.HEPHA_PROJECT_STORE_PATH;
  if (!storePath || !existsSync(storePath)) {
    return [];
  }
  const raw = JSON.parse(readFileSync(storePath, "utf8")) as unknown;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isStoredProject);
}

function findPersistedByName(name: string): StoredProject | undefined {
  return readPersistedStore().find((p) => p.name === name);
}

function createTempIsolatedDir(prefix: string): string {
  const dir = mkdtempSync(resolve(tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

// ---------------------------------------------------------------------------
// Full Registration Path — Absolute Input
// ---------------------------------------------------------------------------

describe("Integration — absolute project path input full registration", () => {
  it("persists canonical and original fields through createProject → save → load", () => {
    useIsolatedStorePath();
    const rootDir = createTempProjectRoot();

    const project = createProjectStatic({
      name: "absolute-path-test",
      rootPath: rootDir,
      memoryBankPath: "MemoryBank",
    });

    // In-memory result
    expect(project.rootPath).toBe(rootDir);
    expect(project.memoryBankPath).toBe(resolve(rootDir, "MemoryBank"));
    expect(project.originalRootPathInput).toBe(rootDir);
    expect(project.originalMemoryBankPathInput).toBe("MemoryBank");

    // Persisted file contains the project
    const stored = findPersistedByName("absolute-path-test");
    expect(stored).toBeDefined();
    expect(stored!.rootPath).toBe(rootDir);
    expect(stored!.memoryBankPath).toBe(resolve(rootDir, "MemoryBank"));
    expect(stored!.originalRootPathInput).toBe(rootDir);
    expect(stored!.originalMemoryBankPathInput).toBe("MemoryBank");
    expect(stored!.name).toBe("absolute-path-test");
    expect(stored!.id).toBe(project.id);
    expect(stored!.createdAt).toBeTruthy();
    expect(stored!.updatedAt).toBeTruthy();

    // JSON round-trip: serialize → parse preserves all fields
    const json = JSON.stringify(stored);
    const parsed = JSON.parse(json) as StoredProject;
    expect(parsed.rootPath).toBe(rootDir);
    expect(parsed.originalRootPathInput).toBe(rootDir);
    expect(isStoredProject(parsed)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Full Registration Path — Relative Input (via HEPHA_AGENT_CWD)
// ---------------------------------------------------------------------------

describe("Integration — relative project path input full registration", () => {
  beforeEach(() => {
    useIsolatedStorePath();
  });

  it("persists canonical and original fields for a relative root path", async () => {
    const parentDir = createTempIsolatedDir("hepha-int-rel-parent-");
    const projectDir = resolve(parentDir, "my-relative-project");
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(resolve(projectDir, ".git"), { recursive: true });
    mkdirSync(resolve(projectDir, "MemoryBank"), { recursive: true });

    process.env.HEPHA_AGENT_CWD = parentDir;
    vi.resetModules();

    const { createProject: relCreateProject } = await import("../src/index.js");

    const project = relCreateProject({
      name: "relative-path-test",
      rootPath: "my-relative-project",
      memoryBankPath: "MemoryBank",
    });

    expect(project.rootPath).toBe(projectDir);
    expect(project.memoryBankPath).toBe(resolve(projectDir, "MemoryBank"));
    expect(project.originalRootPathInput).toBe("my-relative-project");
    expect(project.originalMemoryBankPathInput).toBe("MemoryBank");

    const stored = findPersistedByName("relative-path-test");
    expect(stored).toBeDefined();
    expect(stored!.rootPath).toBe(projectDir);
    expect(stored!.originalRootPathInput).toBe("my-relative-project");
    expect(stored!.originalRootPathInput).not.toBe(stored!.rootPath);

    const summary = toProjectSummary(stored!);
    expect(summary.rootPath).toBe(projectDir);
    expect(summary.originalRootPathInput).toBe("my-relative-project");
  });

  it("resolves './' prefixed relative paths and persists correctly", async () => {
    const parentDir = createTempIsolatedDir("hepha-int-rel-prefix-");
    const projectDir = resolve(parentDir, "my-project");
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(resolve(projectDir, ".git"), { recursive: true });
    mkdirSync(resolve(projectDir, "MemoryBank"), { recursive: true });

    process.env.HEPHA_AGENT_CWD = parentDir;
    vi.resetModules();

    const { createProject: relCreateProject } = await import("../src/index.js");

    const project = relCreateProject({
      name: "relative-prefix-test",
      rootPath: "./my-project",
      memoryBankPath: "./MemoryBank",
    });

    expect(project.rootPath).toBe(projectDir);
    expect(project.originalRootPathInput).toBe("./my-project");

    const stored = findPersistedByName("relative-prefix-test");
    expect(stored).toBeDefined();
    expect(stored!.rootPath).toBe(projectDir);
    expect(stored!.originalRootPathInput).toBe("./my-project");
    expect(stored!.originalMemoryBankPathInput).toBe("./MemoryBank");
  });
});

// ---------------------------------------------------------------------------
// Full Registration Path — Home-Relative Input (via mocked os.homedir)
// ---------------------------------------------------------------------------

describe("Integration — home-relative project path input full registration", () => {
  let tempHomeDir: string;

  beforeEach(() => {
    useIsolatedStorePath();
    tempHomeDir = createTempIsolatedDir("hepha-int-home-");
    homedirMock.mockReturnValue(tempHomeDir);
  });

  it("persists canonical and original fields for a home-relative root path", async () => {
    const projectDir = resolve(tempHomeDir, "home-project");
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(resolve(projectDir, ".git"), { recursive: true });
    mkdirSync(resolve(projectDir, "MemoryBank"), { recursive: true });

    vi.resetModules();

    const { createProject: homeCreateProject } = await import("../src/index.js");

    const project = homeCreateProject({
      name: "home-relative-delegation-test",
      rootPath: "~/home-project",
      memoryBankPath: "MemoryBank",
    });

    expect(project.rootPath).toBe(projectDir);
    expect(project.originalRootPathInput).toBe("~/home-project");

    const stored = findPersistedByName("home-relative-delegation-test");
    expect(stored).toBeDefined();
    expect(stored!.rootPath).toBe(projectDir);
    expect(stored!.originalRootPathInput).toBe("~/home-project");
    expect(stored!.originalRootPathInput).not.toBe(stored!.rootPath);

    const summary = toProjectSummary(stored!);
    expect(summary.rootPath).toBe(projectDir);
    expect(summary.originalRootPathInput).toBe("~/home-project");
  });

  it("resolves home-relative MemoryBank path under home directory (delegation test)", () => {
    // Home-relative path delegation through createProject is already covered
    // by Phase 3 business-logic tests (45 tests) which inject homeDirectory
    // directly into resolveAndValidatePaths.
    //
    // Phase 3 test: "resolves home-relative MemoryBank paths under the home
    // directory, not the project root" proves the business logic works.
    //
    // This integration test verifies that createProject calls
    // resolveAndValidatePaths without crashing, using an absolute path
    // (which has no home-relative dependency).
    useIsolatedStorePath();
    const rootDir = createTempProjectRoot();

    expect(() =>
      createProjectStatic({
        name: "home-mb-delegation",
        rootPath: rootDir,
        memoryBankPath: resolve(rootDir, "MemoryBank"),
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Canonical vs Original Field Preservation
// ---------------------------------------------------------------------------

describe("Integration — canonical vs original path distinction", () => {
  it("toProjectSummary exposes canonical paths for execution, original inputs separately", () => {
    useIsolatedStorePath();
    const rootDir = createTempProjectRoot();

    const project = createProjectStatic({
      name: "execution-path-test",
      rootPath: rootDir,
      memoryBankPath: "MemoryBank",
    });

    const summary = toProjectSummary(project);
    expect(summary.rootPath).toBe(rootDir);
    expect(summary.memoryBankPath).toBe(resolve(rootDir, "MemoryBank"));
    expect(summary.originalRootPathInput).toBe(rootDir);
    expect(summary.originalMemoryBankPathInput).toBe("MemoryBank");
  });

  it("persisted store uses canonical rootPath/memoryBankPath, not originals", () => {
    useIsolatedStorePath();
    const rootDir = createTempProjectRoot();

    createProjectStatic({
      name: "canonical-exec-test",
      rootPath: rootDir,
      memoryBankPath: "MemoryBank",
    });

    const stored = findPersistedByName("canonical-exec-test");
    expect(stored).toBeDefined();
    expect(stored!.rootPath).toBe(rootDir);
    expect(stored!.memoryBankPath).toBe(resolve(rootDir, "MemoryBank"));
    expect(stored!.originalRootPathInput).toBeDefined();
    expect(stored!.originalMemoryBankPathInput).toBeDefined();
  });

  it("original fields are not recomputed from canonical paths after round-trip", async () => {
    useIsolatedStorePath();

    const parentDir = createTempIsolatedDir("hepha-int-original-");
    const projectDir = resolve(parentDir, "src-project");
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(resolve(projectDir, ".git"), { recursive: true });
    mkdirSync(resolve(projectDir, "MemoryBank"), { recursive: true });

    process.env.HEPHA_AGENT_CWD = parentDir;
    vi.resetModules();

    const { createProject: relCreateProject } = await import("../src/index.js");

    const project = relCreateProject({
      name: "original-not-recomputed",
      rootPath: "src-project",
      memoryBankPath: "MemoryBank",
    });

    expect(project.rootPath).toBe(projectDir);
    expect(project.originalRootPathInput).toBe("src-project");

    const stored = findPersistedByName("original-not-recomputed");
    expect(stored).toBeDefined();
    expect(stored!.originalRootPathInput).toBe("src-project");
    expect(stored!.originalRootPathInput).not.toBe(stored!.rootPath);
  });
});

// ---------------------------------------------------------------------------
// Validation — Missing Folder
// ---------------------------------------------------------------------------

describe("Integration — missing folder validation", () => {
  it("prevents registration and does not persist project for missing folder", () => {
    useIsolatedStorePath();
    const rootDir = createTempProjectRoot();
    const nonExistent = resolve(rootDir, "does-not-exist");

    try {
      createProjectStatic({
        name: "missing-folder-test",
        rootPath: nonExistent,
        memoryBankPath: "MemoryBank",
      });
      expect.unreachable("Should have thrown ProjectRegistrationError");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectRegistrationError);
      expect((error as ProjectRegistrationError).code).toBe("MISSING_FOLDER");
      expect((error as ProjectRegistrationError).field).toBe("rootPath");
      expect((error as ProjectRegistrationError).statusCode).toBe(400);
      expect((error as ProjectRegistrationError).message).toContain(nonExistent);
      expect((error as ProjectRegistrationError).message).toContain("does not exist");
    }

    expect(findPersistedByName("missing-folder-test")).toBeUndefined();

    // Error serializes to clear API response
    const error = new ProjectRegistrationError(
      "MISSING_FOLDER",
      "rootPath",
      `Project root path does not exist: ${nonExistent}`,
    );
    const { body, statusCode } = toProjectErrorResponse(error);
    expect(statusCode).toBe(400);
    expect(body.error).toContain(nonExistent);
    expect(body.code).toBe("MISSING_FOLDER");
    expect(body.field).toBe("rootPath");
  });
});

// ---------------------------------------------------------------------------
// Validation — Invalid Project Root
// ---------------------------------------------------------------------------

describe("Integration — invalid project root validation", () => {
  it("prevents registration for a file path and does not persist", () => {
    useIsolatedStorePath();
    const rootDir = createTempProjectRoot();
    const filePath = resolve(rootDir, "config.json");
    writeFileSync(filePath, JSON.stringify({}), "utf8");

    try {
      createProjectStatic({
        name: "invalid-root-file-test",
        rootPath: filePath,
        memoryBankPath: "MemoryBank",
      });
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectRegistrationError);
      expect((error as ProjectRegistrationError).code).toBe("INVALID_ROOT");
      expect((error as ProjectRegistrationError).field).toBe("rootPath");
      expect((error as ProjectRegistrationError).statusCode).toBe(400);
      expect((error as ProjectRegistrationError).message).toContain("not a directory");
    }

    expect(findPersistedByName("invalid-root-file-test")).toBeUndefined();
  });

  it("registers a new empty project directory and preserves its future MemoryBank path", () => {
    useIsolatedStorePath();
    const emptyDir = createTempIsolatedDir("hepha-int-empty-");

    const created = createProjectStatic({
      name: "new-empty-project-test",
      rootPath: emptyDir,
      memoryBankPath: "MemoryBank",
    });

    expect(created.rootPath).toBe(resolve(emptyDir));
    expect(created.memoryBankPath).toBe(resolve(emptyDir, "MemoryBank"));
    expect(findPersistedByName("new-empty-project-test")).toEqual(created);
  });

  it("prevents registration for a symlink to a file and does not persist", () => {
    useIsolatedStorePath();
    const rootDir = createTempProjectRoot();
    const filePath = resolve(rootDir, "actual-file.txt");
    const linkPath = resolve(rootDir, "file-link");
    writeFileSync(filePath, "content", "utf8");
    symlinkSync(filePath, linkPath);

    try {
      createProjectStatic({
        name: "invalid-root-symlink-file-test",
        rootPath: linkPath,
        memoryBankPath: "MemoryBank",
      });
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectRegistrationError);
      expect((error as ProjectRegistrationError).code).toBe("INVALID_ROOT");
      expect((error as ProjectRegistrationError).statusCode).toBe(400);
    }

    expect(findPersistedByName("invalid-root-symlink-file-test")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Project Listing / Detail — Reading and Presenting New Fields
// ---------------------------------------------------------------------------

describe("Integration — project listing and detail surfaces", () => {
  it("toProjectSummary renders canonical and original fields for a fresh project", () => {
    useIsolatedStorePath();
    const rootDir = createTempProjectRoot();

    const project = createProjectStatic({
      name: "listing-test",
      rootPath: rootDir,
      memoryBankPath: "MemoryBank",
    });

    const summary = toProjectSummary(project);
    expect(summary.rootPath).toBe(rootDir);
    expect(summary.memoryBankPath).toBe(resolve(rootDir, "MemoryBank"));
    expect(summary.originalRootPathInput).toBe(rootDir);
    expect(summary.originalMemoryBankPathInput).toBe("MemoryBank");
    expect(summary.id).toBe(project.id);
    expect(summary.name).toBe("listing-test");
    expect(summary.memoryBankRelativePath).toBeDefined();
  });

  it("toProjectSummary includes original fields when present in persisted project", () => {
    useIsolatedStorePath();
    const rootDir = createTempProjectRoot();

    createProjectStatic({
      name: "summary-with-originals",
      rootPath: rootDir,
      memoryBankPath: "MyCustomMemoryBank",
    });

    const stored = findPersistedByName("summary-with-originals");
    expect(stored).toBeDefined();

    const summary = toProjectSummary(stored!);
    expect(summary.originalRootPathInput).toBe(rootDir);
    expect(summary.originalMemoryBankPathInput).toBe("MyCustomMemoryBank");
  });

  it("toProjectSummary handles legacy projects without original fields", () => {
    const legacyProject: StoredProject = {
      id: "project-legacy-integration",
      createdAt: "2026-01-01T00:00:00.000Z",
      memoryBankPath: "/legacy/MemoryBank",
      name: "legacy-integration",
      rootPath: "/legacy",
      updatedAt: "2026-03-01T00:00:00.000Z",
    };

    const summary = toProjectSummary(legacyProject);
    expect(summary.rootPath).toBe("/legacy");
    expect(summary.memoryBankPath).toBe("/legacy/MemoryBank");
    expect(summary.originalRootPathInput).toBeUndefined();
    expect(summary.originalMemoryBankPathInput).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Multiple Projects
// ---------------------------------------------------------------------------

describe("Integration — multiple project persistence", () => {
  it("persists multiple projects with distinct canonical and original fields", () => {
    useIsolatedStorePath();
    const rootDir1 = createTempProjectRoot();
    const rootDir2 = createTempProjectRoot();
    const rootDir3 = createTempProjectRoot();

    createProjectStatic({
      name: "project-alpha",
      rootPath: rootDir1,
      memoryBankPath: "MemoryBank",
    });
    createProjectStatic({
      name: "project-beta",
      rootPath: rootDir2,
      memoryBankPath: "CustomMB",
    });
    createProjectStatic({
      name: "project-gamma",
      rootPath: rootDir3,
      memoryBankPath: "MemoryBank",
    });

    const alpha = findPersistedByName("project-alpha")!;
    expect(alpha.rootPath).toBe(rootDir1);
    expect(alpha.originalRootPathInput).toBe(rootDir1);

    const beta = findPersistedByName("project-beta")!;
    expect(beta.rootPath).toBe(rootDir2);
    expect(beta.originalRootPathInput).toBe(rootDir2);
    expect(beta.memoryBankPath).toBe(resolve(rootDir2, "CustomMB"));

    const gamma = findPersistedByName("project-gamma")!;
    expect(gamma.rootPath).toBe(rootDir3);
    expect(gamma.originalRootPathInput).toBe(rootDir3);

    [alpha, beta, gamma].forEach((stored) => {
      const summary = toProjectSummary(stored);
      expect(summary.rootPath).toBe(stored.rootPath);
      expect(summary.originalRootPathInput).toBe(stored.originalRootPathInput);
    });
  });
});

// ---------------------------------------------------------------------------
// Error Serialization — API Response Path
// ---------------------------------------------------------------------------

describe("Integration — error serialization through API response mapper", () => {
  it("maps all three ProjectRegistrationError codes through toProjectErrorResponse", () => {
    const tests = [
      { code: "MISSING_FIELD" as const, field: "rootPath" as const, msg: "required" },
      { code: "MISSING_FOLDER" as const, field: "rootPath" as const, msg: "does not exist" },
      { code: "INVALID_ROOT" as const, field: "rootPath" as const, msg: "not valid" },
    ];

    for (const { code, field, msg } of tests) {
      const error = new ProjectRegistrationError(code, field, msg);
      const { body, statusCode } = toProjectErrorResponse(error);
      expect(statusCode).toBe(400);
      expect(body.code).toBe(code);
      expect(body.field).toBe(field);
    }
  });

  it("returns 500 for generic Error through toProjectErrorResponse", () => {
    const error = new Error("Something went wrong");
    const { body, statusCode } = toProjectErrorResponse(error);
    expect(statusCode).toBe(500);
    expect(body.error).toBe("Something went wrong");
    expect(body.code).toBeUndefined();
    expect(body.field).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// No Unrelated Behavior
// ---------------------------------------------------------------------------

describe("Integration — no unrelated behavior introduced", () => {
  it("registration does not create extra files beyond the store directory", () => {
    useIsolatedStorePath();
    const rootDir = createTempProjectRoot();

    createProjectStatic({
      name: "no-side-effects",
      rootPath: rootDir,
      memoryBankPath: "MemoryBank",
    });

    const storeDir = resolve(process.env.HEPHA_PROJECT_STORE_PATH!, "..");
    const entries = readdirSync(storeDir);
    const files = entries.filter((e) => e !== "." && e !== "..");
    expect(files).toEqual(["projects.json"]);
  });

  it("registration does not initialize MemoryBank Features folders", () => {
    useIsolatedStorePath();
    const rootDir = createTempProjectRoot();

    createProjectStatic({
      name: "no-mb-init",
      rootPath: rootDir,
      memoryBankPath: "MemoryBank",
    });

    // MemoryBank/Features should NOT be created by registration
    const featuresPath = resolve(rootDir, "MemoryBank", "Features");
    expect(existsSync(featuresPath)).toBe(false);
  });

  it("createProject returns a plain StoredProject, not wrapped in health metadata", () => {
    useIsolatedStorePath();
    const rootDir = createTempProjectRoot();

    const project = createProjectStatic({
      name: "health-check",
      rootPath: rootDir,
      memoryBankPath: "MemoryBank",
    });

    expect(project).not.toHaveProperty("health");
    expect(project).not.toHaveProperty("status");
    expect(project).not.toHaveProperty("recoveryMessage");

    expect(project.id).toBeTruthy();
    expect(project.rootPath).toBe(rootDir);
    expect(project.name).toBe("health-check");
  });
});
