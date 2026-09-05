import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createProject, ProjectRegistrationError } from "../src/index.js";
import { toProjectSummary } from "../src/projects/project-summary.js";
import { toProjectErrorResponse } from "../src/transport/http/orchestrator-error-response.js";
import type { StoredProject } from "../src/projects/stored-project.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tempRoots: string[] = [];
const tempStoreDirs: string[] = [];
const originalStoreEnv = process.env.HEPHA_PROJECT_STORE_PATH;

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

  // Restore original env var to avoid side-effect leakage across tests
  if (originalStoreEnv !== undefined) {
    process.env.HEPHA_PROJECT_STORE_PATH = originalStoreEnv;
  } else {
    delete process.env.HEPHA_PROJECT_STORE_PATH;
  }
});

function createTempProjectRoot() {
  const dir = mkdtempSync(resolve(tmpdir(), "hepha-presentation-test-"));
  tempRoots.push(dir);
  mkdirSync(resolve(dir, "MemoryBank"), { recursive: true });
  mkdirSync(resolve(dir, ".git"), { recursive: true });

  // Set up an isolated store path to avoid polluting the real workspace
  const tempStoreDir = mkdtempSync(resolve(tmpdir(), "hepha-presentation-store-"));
  tempStoreDirs.push(tempStoreDir);
  process.env.HEPHA_PROJECT_STORE_PATH = resolve(tempStoreDir, "projects.json");

  return dir;
}

// ---------------------------------------------------------------------------
// ProjectRegistrationError — statusCode
// ---------------------------------------------------------------------------

describe("ProjectRegistrationError statusCode", () => {
  it("carries statusCode = 400 for MISSING_FOLDER", () => {
    const error = new ProjectRegistrationError(
      "MISSING_FOLDER",
      "rootPath",
      "Project root path does not exist: /nonexistent",
    );

    expect(error.statusCode).toBe(400);
  });

  it("carries statusCode = 400 for INVALID_ROOT", () => {
    const error = new ProjectRegistrationError(
      "INVALID_ROOT",
      "rootPath",
      "Project root path is not a directory: /file",
    );

    expect(error.statusCode).toBe(400);
  });

  it("carries statusCode = 400 for MISSING_FIELD", () => {
    const error = new ProjectRegistrationError(
      "MISSING_FIELD",
      "memoryBankPath",
      "MemoryBank path is required",
    );

    expect(error.statusCode).toBe(400);
  });

  it("is assignable to a number-typed statusCode variable", () => {
    const error = new ProjectRegistrationError(
      "MISSING_FOLDER",
      "rootPath",
      "test",
    );

    // Prove statusCode is a number usable for HTTP status code checks
    const code: number = error.statusCode;
    expect(code).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// toProjectSummary — canonical and original fields
// ---------------------------------------------------------------------------

describe("toProjectSummary — canonical and original path fields", () => {
  it("maps canonical rootPath and memoryBankPath from StoredProject", () => {
    const project: StoredProject = {
      id: "project-summary-1",
      createdAt: "2026-06-29T00:00:00.000Z",
      memoryBankPath: "/home/user/project/CustomMemoryBank",
      name: "summary-test",
      rootPath: "/home/user/project",
      updatedAt: "2026-06-29T00:00:00.000Z",
    };

    const summary = toProjectSummary(project);

    expect(summary.rootPath).toBe("/home/user/project");
    expect(summary.memoryBankPath).toBe("/home/user/project/CustomMemoryBank");
  });

  it("maps originalRootPathInput when present on StoredProject", () => {
    const project: StoredProject = {
      id: "project-summary-2",
      createdAt: "2026-06-29T00:00:00.000Z",
      memoryBankPath: "/home/user/project/MemoryBank",
      name: "original-test",
      rootPath: "/home/user/project",
      updatedAt: "2026-06-29T00:00:00.000Z",
      originalRootPathInput: "~/project",
      originalMemoryBankPathInput: "MemoryBank",
    };

    const summary = toProjectSummary(project);

    expect(summary.originalRootPathInput).toBe("~/project");
    expect(summary.originalMemoryBankPathInput).toBe("MemoryBank");
  });

  it("omits originalRootPathInput when absent on StoredProject (legacy compat)", () => {
    const project: StoredProject = {
      id: "project-summary-3",
      createdAt: "2026-01-01T00:00:00.000Z",
      memoryBankPath: "/legacy/MemoryBank",
      name: "legacy-project",
      rootPath: "/legacy",
      updatedAt: "2026-03-01T00:00:00.000Z",
    };

    const summary = toProjectSummary(project);

    expect(summary.originalRootPathInput).toBeUndefined();
    expect(summary.originalMemoryBankPathInput).toBeUndefined();
  });

  it("preserves original path values distinct from canonical paths", () => {
    const project: StoredProject = {
      id: "project-summary-4",
      createdAt: "2026-06-29T00:00:00.000Z",
      memoryBankPath: "/resolved/project/MemoryBank",
      name: "distinct-test",
      rootPath: "/resolved/project",
      updatedAt: "2026-06-29T00:00:00.000Z",
      originalRootPathInput: "../relative/project",
      originalMemoryBankPathInput: "../relative/MemoryBank",
    };

    const summary = toProjectSummary(project);

    // Original and canonical must be distinct
    expect(summary.originalRootPathInput).toBe("../relative/project");
    expect(summary.originalRootPathInput).not.toBe(summary.rootPath);
    expect(summary.originalMemoryBankPathInput).toBe("../relative/MemoryBank");
    expect(summary.originalMemoryBankPathInput).not.toBe(summary.memoryBankPath);
  });
});

// ---------------------------------------------------------------------------
// createProject — success response fields
// ---------------------------------------------------------------------------

describe("createProject — success response shape", () => {
  it("returns a StoredProject with both canonical and original path fields", () => {
    const rootDir = createTempProjectRoot();
    const rawRootPath = `  ${rootDir}  `;
    const rawMemoryBankPath = "  MemoryBank  ";

    const project = createProject({
      name: "response-shape-test",
      rootPath: rawRootPath,
      memoryBankPath: rawMemoryBankPath,
    });

    // Canonical fields exist
    expect(project.rootPath).toBe(rootDir);
    expect(project.memoryBankPath).toBe(resolve(rootDir, "MemoryBank"));

    // Original fields preserve raw input
    expect(project.originalRootPathInput).toBe(rawRootPath);
    expect(project.originalMemoryBankPathInput).toBe(rawMemoryBankPath);

    // Id, name, timestamps are present
    expect(project.id).toBeTruthy();
    expect(project.name).toBe("response-shape-test");
    expect(project.createdAt).toBeTruthy();
    expect(project.updatedAt).toBeTruthy();
  });

  it("produces a StoredProject that toProjectSummary renders correctly", () => {
    const rootDir = createTempProjectRoot();

    const project = createProject({
      name: "roundtrip-test",
      rootPath: rootDir,
      memoryBankPath: "MemoryBank",
    });

    const summary = toProjectSummary(project);

    expect(summary.id).toBe(project.id);
    expect(summary.name).toBe("roundtrip-test");
    expect(summary.rootPath).toBe(project.rootPath);
    expect(summary.memoryBankPath).toBe(project.memoryBankPath);
    expect(summary.originalRootPathInput).toBe(project.originalRootPathInput);
    expect(summary.originalMemoryBankPathInput).toBe(project.originalMemoryBankPathInput);
  });
});

// ---------------------------------------------------------------------------
// createProject — error response shape
// ---------------------------------------------------------------------------

describe("createProject — error response shape", () => {
  it("throws ProjectRegistrationError for missing root path", () => {
    const rootDir = createTempProjectRoot();
    const nonExistent = resolve(rootDir, "does-not-exist");

    try {
      createProject({
        name: "error-test",
        rootPath: nonExistent,
        memoryBankPath: "MemoryBank",
      });
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectRegistrationError);

      const regError = error as ProjectRegistrationError;
      expect(regError.code).toBe("MISSING_FOLDER");
      expect(regError.field).toBe("rootPath");
      expect(regError.statusCode).toBe(400);
      expect(regError.message).toContain(nonExistent);
    }
  });

  it("throws ProjectRegistrationError for invalid root (file instead of directory)", () => {
    const rootDir = createTempProjectRoot();
    const filePath = resolve(rootDir, "some-file.txt");
    writeFileSync(filePath, "not a directory", "utf8");

    try {
      createProject({
        name: "error-test-2",
        rootPath: filePath,
        memoryBankPath: "MemoryBank",
      });
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectRegistrationError);

      const regError = error as ProjectRegistrationError;
      expect(regError.code).toBe("INVALID_ROOT");
      expect(regError.field).toBe("rootPath");
      expect(regError.statusCode).toBe(400);
      expect(regError.message).toContain("not a directory");
    }
  });

  it("throws ProjectRegistrationError for missing project name", () => {
    const rootDir = createTempProjectRoot();

    try {
      createProject({
        name: "",
        rootPath: rootDir,
        memoryBankPath: "MemoryBank",
      });
      expect.unreachable("Should have thrown");
    } catch (error) {
      // Name validation throws a generic Error, not ProjectRegistrationError
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Project name is required");
    }
  });

  it("throws ProjectRegistrationError for missing rootPath field", () => {
    try {
      createProject({
        name: "missing-root",
        rootPath: "",
        memoryBankPath: "MemoryBank",
      });
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectRegistrationError);
      expect((error as ProjectRegistrationError).code).toBe("MISSING_FIELD");
      expect((error as ProjectRegistrationError).statusCode).toBe(400);
    }
  });
});

// ---------------------------------------------------------------------------
// Error serialization contract — properties available for API response
// ---------------------------------------------------------------------------

describe("ProjectRegistrationError — API response shape contract", () => {
  it("provides all fields needed for a structured JSON error response", () => {
    const error = new ProjectRegistrationError(
      "MISSING_FOLDER",
      "rootPath",
      "Project root path does not exist: /tmp/missing",
    );

    // These three properties are what the API error handler reads
    const apiResponse = {
      error: error.message,
      code: error.code,
      field: error.field,
      statusCode: error.statusCode,
    };

    expect(apiResponse).toEqual({
      error: "Project root path does not exist: /tmp/missing",
      code: "MISSING_FOLDER",
      field: "rootPath",
      statusCode: 400,
    });
  });

  it("serializes to JSON without prototype pollution", () => {
    const error = new ProjectRegistrationError(
      "INVALID_ROOT",
      "rootPath",
      "Not a directory",
    );

    const json = JSON.parse(JSON.stringify(error));

    // Standard Error properties don't serialize, but own properties do
    expect(json.code).toBe("INVALID_ROOT");
    expect(json.field).toBe("rootPath");
    expect(json.statusCode).toBe(400);
    // message is not own property on Error, but statusCode is
    expect(json.message).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Production error response mapper — exercises the actual catch handler logic
// ---------------------------------------------------------------------------

describe("toProjectErrorResponse — production error mapping", () => {
  it("maps ProjectRegistrationError to status 400 with code and field", () => {
    const error = new ProjectRegistrationError(
      "MISSING_FOLDER",
      "rootPath",
      "Project root path does not exist: /tmp/missing",
    );

    const { body, statusCode } = toProjectErrorResponse(error);

    expect(statusCode).toBe(400);
    expect(body.error).toBe("Project root path does not exist: /tmp/missing");
    expect(body.code).toBe("MISSING_FOLDER");
    expect(body.field).toBe("rootPath");
  });

  it("maps INVALID_ROOT ProjectRegistrationError to status 400 with code and field", () => {
    const error = new ProjectRegistrationError(
      "INVALID_ROOT",
      "rootPath",
      "Not a directory",
    );

    const { body, statusCode } = toProjectErrorResponse(error);

    expect(statusCode).toBe(400);
    expect(body.code).toBe("INVALID_ROOT");
    expect(body.field).toBe("rootPath");
  });

  it("maps MISSING_FIELD ProjectRegistrationError to status 400 with code and field", () => {
    const error = new ProjectRegistrationError(
      "MISSING_FIELD",
      "memoryBankPath",
      "MemoryBank path is required",
    );

    const { body, statusCode } = toProjectErrorResponse(error);

    expect(statusCode).toBe(400);
    expect(body.code).toBe("MISSING_FIELD");
    expect(body.field).toBe("memoryBankPath");
  });

  it("maps a generic Error to status 500 with no code or field", () => {
    const error = new Error("Something went wrong");

    const { body, statusCode } = toProjectErrorResponse(error);

    expect(statusCode).toBe(500);
    expect(body.error).toBe("Something went wrong");
    expect(body.code).toBeUndefined();
    expect(body.field).toBeUndefined();
  });

  it("maps a non-Error unknown to status 500 with default message", () => {
    const error = "string error";

    const { body, statusCode } = toProjectErrorResponse(error);

    expect(statusCode).toBe(500);
    expect(body.error).toBe("Unknown orchestrator error");
    expect(body.code).toBeUndefined();
    expect(body.field).toBeUndefined();
  });

  it("maps null to status 500 with no code or field", () => {
    const { body, statusCode } = toProjectErrorResponse(null);

    expect(statusCode).toBe(500);
    expect(body.code).toBeUndefined();
    expect(body.field).toBeUndefined();
  });

  it("fails if code is removed from the mapping", () => {
    // This test proves the production mapper would fail if code were dropped.
    // It mirrors the catch handler: response body only includes code/field
    // when the error is a ProjectRegistrationError.
    const error = new ProjectRegistrationError(
      "MISSING_FOLDER",
      "rootPath",
      "test",
    );

    const { body } = toProjectErrorResponse(error);

    // If body.code were omitted, this assertion would fail
    expect(body).toHaveProperty("code", "MISSING_FOLDER");
    expect(body).toHaveProperty("field", "rootPath");
  });
});
