import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ProjectRegistrationError,
  resolveAndValidatePaths,
  canonicalExistingPath,
} from "../src/project-registration.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { force: true, recursive: true });
  }
  tempRoots.length = 0;
});

function createTempRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-registration-"));
  tempRoots.push(root);
  return root;
}

function createTempProject(): string {
  const root = createTempRoot();
  mkdirSync(resolve(root, "MemoryBank"), { recursive: true });
  return root;
}

// ---------------------------------------------------------------------------
// canonicalExistingPath
// ---------------------------------------------------------------------------

describe("canonicalExistingPath", () => {
  it("resolves an existing directory to its real path", () => {
    const root = createTempRoot();

    const result = canonicalExistingPath(root);

    expect(result).toBe(resolve(root));
  });

  it("resolves symlinks to the target path", () => {
    const root = createTempRoot();
    const target = resolve(root, "target");
    const link = resolve(root, "link");

    mkdirSync(target, { recursive: true });
    symlinkSync(target, link, "dir");

    const result = canonicalExistingPath(link);

    // On systems where symlinks are supported, the canonical path should be the target
    expect(result.endsWith("target")).toBe(true);
    expect(result).not.toBe(link);
  });

  it("falls back to resolve when realpathSync fails (non-existent path)", () => {
    const root = createTempRoot();
    const nonExistent = resolve(root, "does-not-exist");

    const result = canonicalExistingPath(nonExistent);

    // Should fall back to the same resolved path
    expect(result).toBe(resolve(nonExistent));
  });

  it("normalizes a regular path without symlinks", () => {
    const root = createTempRoot();
    const nestedDeep = resolve(root, "a", "b", "c");
    mkdirSync(nestedDeep, { recursive: true });

    const result = canonicalExistingPath(nestedDeep);

    // Should resolve 'a/b/c' to its real path
    const expected = resolve(root, "a", "b", "c");
    expect(result).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// resolveAndValidatePaths — Field presence
// ---------------------------------------------------------------------------

describe("resolveAndValidatePaths — field presence", () => {
  it("throws MISSING_FIELD when rootPath is undefined", () => {
    expect(() =>
      resolveAndValidatePaths({ rootPath: undefined as unknown as string, memoryBankPath: "/some/mb" }),
    ).toThrow(ProjectRegistrationError);

    try {
      resolveAndValidatePaths({ rootPath: undefined as unknown as string, memoryBankPath: "/some/mb" });
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectRegistrationError);
      expect((error as ProjectRegistrationError).code).toBe("MISSING_FIELD");
      expect((error as ProjectRegistrationError).field).toBe("rootPath");
    }
  });

  it("throws MISSING_FIELD when rootPath is empty after trim", () => {
    expect(() =>
      resolveAndValidatePaths({ rootPath: "", memoryBankPath: "/some/mb" }),
    ).toThrow(ProjectRegistrationError);

    expect(() =>
      resolveAndValidatePaths({ rootPath: "   ", memoryBankPath: "/some/mb" }),
    ).toThrow(ProjectRegistrationError);
  });

  it("throws MISSING_FIELD when memoryBankPath is undefined", () => {
    try {
      resolveAndValidatePaths({ rootPath: "/some/root", memoryBankPath: undefined as unknown as string });
    } catch (error) {
      expect((error as ProjectRegistrationError).code).toBe("MISSING_FIELD");
      expect((error as ProjectRegistrationError).field).toBe("memoryBankPath");
    }
  });

  it("throws MISSING_FIELD when memoryBankPath is empty after trim", () => {
    expect(() =>
      resolveAndValidatePaths({ rootPath: "/some/root", memoryBankPath: "" }),
    ).toThrow(ProjectRegistrationError);

    expect(() =>
      resolveAndValidatePaths({ rootPath: "/some/root", memoryBankPath: "   " }),
    ).toThrow(ProjectRegistrationError);
  });
});

// ---------------------------------------------------------------------------
// resolveAndValidatePaths — Absolute path resolution
// ---------------------------------------------------------------------------

describe("resolveAndValidatePaths — absolute inputs", () => {
  it("resolves an absolute project root to itself (after canonicalization)", () => {
    const rootDir = createTempProject();
    const mbDir = resolve(rootDir, "MemoryBank");

    const result = resolveAndValidatePaths({
      rootPath: rootDir,
      memoryBankPath: mbDir,
    });

    expect(result.canonicalRootPath).toBe(resolve(rootDir));
    expect(result.canonicalMemoryBankPath).toBe(resolve(mbDir));
    expect(result.originalRootPathInput).toBe(rootDir);
    expect(result.originalMemoryBankPathInput).toBe(mbDir);
  });

  it("keeps absolute root path independent of basePath", () => {
    const rootDir = createTempProject();
    const mbDir = resolve(rootDir, "MemoryBank");
    const wrongBase = createTempRoot();

    const result = resolveAndValidatePaths(
      { rootPath: rootDir, memoryBankPath: mbDir },
      { basePath: wrongBase },
    );

    // Should resolve to rootDir, not to wrongBase/rootDir
    expect(result.canonicalRootPath).toBe(resolve(rootDir));
    expect(result.canonicalMemoryBankPath).toBe(resolve(mbDir));
  });

  it("resolves an absolute MemoryBank path independent of the project root", () => {
    const rootDir = createTempProject();
    const absoluteMb = resolve(createTempRoot(), "CustomMemoryBank");
    mkdirSync(absoluteMb, { recursive: true });

    const result = resolveAndValidatePaths({
      rootPath: rootDir,
      memoryBankPath: absoluteMb,
    });

    // MemoryBank should resolve to the absolute path, not under rootDir
    expect(result.canonicalMemoryBankPath).toBe(resolve(absoluteMb));
    expect(result.canonicalMemoryBankPath).not.toContain(rootDir);
  });

  it("returns canonicalized root path when symlink is involved", () => {
    const rootDir = createTempProject();
    const realTarget = resolve(rootDir, "real-project");
    mkdirSync(realTarget, { recursive: true });
    mkdirSync(resolve(realTarget, "MemoryBank"), { recursive: true });
    mkdirSync(resolve(realTarget, ".git"), { recursive: true });

    const linkPath = resolve(rootDir, "project-link");
    symlinkSync(realTarget, linkPath, "dir");

    const mbDir = resolve(linkPath, "MemoryBank");

    const result = resolveAndValidatePaths({
      rootPath: linkPath,
      memoryBankPath: mbDir,
    });

    // The canonical root path should resolve through the symlink
    expect(result.canonicalRootPath.endsWith("real-project")).toBe(true);
    expect(result.canonicalRootPath).not.toBe(linkPath);
  });
});

// ---------------------------------------------------------------------------
// resolveAndValidatePaths — Relative path resolution
// ---------------------------------------------------------------------------

describe("resolveAndValidatePaths — relative inputs", () => {
  it("resolves a relative project root against the default (cwd) base", () => {
    // This test uses the actual cwd as the deterministic base
    const rootDir = createTempProject();
    const relativeRoot = resolve(rootDir); // absolute for assertion, but we test the function

    // Test relative path resolution by passing basePath equal to parent
    const parentDir = resolve(rootDir, "..");
    const projectName = rootDir.split("/").pop()!;

    const result = resolveAndValidatePaths(
      {
        rootPath: projectName,
        memoryBankPath: "MemoryBank",
      },
      { basePath: parentDir },
    );

    expect(result.canonicalRootPath).toBe(rootDir);
    expect(result.canonicalMemoryBankPath).toBe(resolve(rootDir, "MemoryBank"));
    expect(result.originalRootPathInput).toBe(projectName);
    expect(result.originalMemoryBankPathInput).toBe("MemoryBank");
  });

  it("resolves a relative MemoryBank path against the canonical project root", () => {
    const rootDir = createTempProject();

    const result = resolveAndValidatePaths({
      rootPath: rootDir,
      memoryBankPath: "MyMemoryBank",
    });

    // MemoryBank should resolve relative to the canonical root
    expect(result.canonicalMemoryBankPath).toBe(resolve(rootDir, "MyMemoryBank"));
  });

  it("resolves './' prefixed relative paths correctly", () => {
    const rootDir = createTempProject();

    const result = resolveAndValidatePaths(
      {
        rootPath: `./${rootDir.split("/").pop()!}`,
        memoryBankPath: "./MemoryBank",
      },
      { basePath: resolve(rootDir, "..") },
    );

    expect(result.canonicalRootPath).toBe(rootDir);
    expect(result.canonicalMemoryBankPath).toBe(resolve(rootDir, "MemoryBank"));
  });

  it("resolves '../' sibling project paths correctly", () => {
    const parentDir = createTempRoot();
    const projectA = resolve(parentDir, "project-a");
    const projectB = resolve(parentDir, "project-b");
    mkdirSync(projectA, { recursive: true });
    mkdirSync(resolve(projectA, "MemoryBank"), { recursive: true });
    mkdirSync(projectB, { recursive: true });

    mkdirSync(resolve(projectA, ".git"), { recursive: true });

    // From projectB's perspective, resolve projectA as "../project-a"
    const result = resolveAndValidatePaths(
      {
        rootPath: "../project-a",
        memoryBankPath: "MemoryBank",
      },
      { basePath: projectB },
    );

    expect(result.canonicalRootPath).toBe(resolve(projectA));
    expect(result.canonicalMemoryBankPath).toBe(resolve(projectA, "MemoryBank"));
  });
});

// ---------------------------------------------------------------------------
// resolveAndValidatePaths — Home-relative path resolution
// ---------------------------------------------------------------------------

describe("resolveAndValidatePaths — home-relative inputs", () => {
  it("expands ~/ to the home directory", () => {
    const homeDir = createTempRoot();
    const projectDir = resolve(homeDir, "my-project");
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(resolve(projectDir, "MemoryBank"), { recursive: true });
    mkdirSync(resolve(projectDir, ".git"), { recursive: true });

    const result = resolveAndValidatePaths(
      {
        rootPath: "~/my-project",
        memoryBankPath: "MemoryBank",
      },
      { homeDirectory: homeDir },
    );

    expect(result.canonicalRootPath).toBe(projectDir);
    expect(result.canonicalMemoryBankPath).toBe(resolve(projectDir, "MemoryBank"));
    expect(result.originalRootPathInput).toBe("~/my-project");
  });

  it("expands ~ alone to the home directory", () => {
    const homeDir = createTempRoot();
    mkdirSync(resolve(homeDir, ".git"), { recursive: true });
    const mbDir = resolve(homeDir, "MemoryBank");
    mkdirSync(mbDir, { recursive: true });

    const result = resolveAndValidatePaths(
      {
        rootPath: "~",
        memoryBankPath: mbDir,
      },
      { homeDirectory: homeDir },
    );

    expect(result.canonicalRootPath).toBe(homeDir);
    expect(result.originalRootPathInput).toBe("~");
  });

  it("resolves home-relative MemoryBank paths under the home directory, not the project root", () => {
    const homeDir = createTempRoot();
    const projectDir = resolve(homeDir, "work-project");
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(resolve(homeDir, "GlobalMemoryBank"), { recursive: true });
    mkdirSync(resolve(projectDir, ".git"), { recursive: true });

    const result = resolveAndValidatePaths(
      {
        rootPath: "~/work-project",
        memoryBankPath: "~/GlobalMemoryBank",
      },
      { homeDirectory: homeDir },
    );

    // MemoryBank should be under home, not under project root
    expect(result.canonicalMemoryBankPath).toBe(resolve(homeDir, "GlobalMemoryBank"));
    expect(result.canonicalMemoryBankPath).not.toContain("work-project");
  });

  it("uses os.homedir() when no homeDirectory option is provided", () => {
    // This is a smoke test — we can't predict os.homedir(), but we can
    // verify that the function doesn't throw and returns a real path
    // when given an existing project under the real home.
    const rootDir = createTempProject();

    // We can test with an absolute path to verify the function works
    // with the default homeDirectory (which comes from os.homedir()).
    // For explicit home-relative testing, pass homeDirectory.
    const result = resolveAndValidatePaths({
      rootPath: rootDir,
      memoryBankPath: "MemoryBank",
    });

    expect(result.canonicalRootPath).toBe(resolve(rootDir));
  });
});

describe("resolveAndValidatePaths — missing folder validation", () => {
  it("throws MISSING_FOLDER when the root path does not exist", () => {
    const rootDir = createTempRoot();
    const nonExistent = resolve(rootDir, "does-not-exist");

    try {
      resolveAndValidatePaths({
        rootPath: nonExistent,
        memoryBankPath: "MemoryBank",
      });
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectRegistrationError);
      expect((error as ProjectRegistrationError).code).toBe("MISSING_FOLDER");
      expect((error as ProjectRegistrationError).field).toBe("rootPath");
      // Message should include the resolved path that does not exist
      expect((error as ProjectRegistrationError).message).toContain(nonExistent);
      expect((error as ProjectRegistrationError).message).toContain("does not exist");
    }
  });

  it("throws MISSING_FOLDER with actionable message including the resolved path", () => {
    const rootDir = createTempRoot();
    const nonExistent = resolve(rootDir, "nonexistent-project");

    expect(() =>
      resolveAndValidatePaths({
        rootPath: nonExistent,
        memoryBankPath: "MemoryBank",
      }),
    ).toThrowError(`does not exist: ${nonExistent}`);
  });

  it("does not throw for a MemoryBank path that does not exist (initialization is separate)", () => {
    const rootDir = createTempProject();
    const nonExistentMb = resolve(rootDir, "NonExistentMemoryBank");

    // MemoryBank path existence is NOT validated by registration —
    // initialization handles missing MemoryBank folders
    const result = resolveAndValidatePaths({
      rootPath: rootDir,
      memoryBankPath: nonExistentMb,
    });

    expect(result.canonicalRootPath).toBe(resolve(rootDir));
    expect(result.canonicalMemoryBankPath).toBe(resolve(nonExistentMb));
  });
});

// ---------------------------------------------------------------------------
// resolveAndValidatePaths — Invalid root validation
// ---------------------------------------------------------------------------

describe("resolveAndValidatePaths — root directory validation", () => {
  it("throws INVALID_ROOT when root path is a file, not a directory", () => {
    const rootDir = createTempRoot();
    const filePath = resolve(rootDir, "some-file.txt");
    writeFileSync(filePath, "not a directory", "utf8");

    try {
      resolveAndValidatePaths({
        rootPath: filePath,
        memoryBankPath: "MemoryBank",
      });
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectRegistrationError);
      expect((error as ProjectRegistrationError).code).toBe("INVALID_ROOT");
      expect((error as ProjectRegistrationError).field).toBe("rootPath");
      expect((error as ProjectRegistrationError).message).toContain("not a directory");
    }
  });

  it("throws INVALID_ROOT with actionable message including the resolved path", () => {
    const rootDir = createTempRoot();
    const filePath = resolve(rootDir, "config.json");
    writeFileSync(filePath, '{"key": "value"}', "utf8");

    expect(() =>
      resolveAndValidatePaths({
        rootPath: filePath,
        memoryBankPath: "MemoryBank",
      }),
    ).toThrowError(`not a directory: ${filePath}`);
  });

  it("throws INVALID_ROOT when root path is a symlink to a file (not a directory)", () => {
    const rootDir = createTempRoot();
    const filePath = resolve(rootDir, "actual-file.txt");
    const linkPath = resolve(rootDir, "file-link");
    writeFileSync(filePath, "content", "utf8");
    symlinkSync(filePath, linkPath);

    try {
      resolveAndValidatePaths({
        rootPath: linkPath,
        memoryBankPath: "MemoryBank",
      });
      expect.unreachable("Should have thrown for symlink to file");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectRegistrationError);
      expect((error as ProjectRegistrationError).code).toBe("INVALID_ROOT");
    }
  });

  it("accepts an empty directory as a new project root before initialization", () => {
    const emptyDir = createTempRoot();

    const result = resolveAndValidatePaths({
      rootPath: emptyDir,
      memoryBankPath: "MemoryBank",
    });

    expect(result.canonicalRootPath).toBe(resolve(emptyDir));
    expect(result.canonicalMemoryBankPath).toBe(resolve(emptyDir, "MemoryBank"));
  });

  it("continues accepting an existing project directory that contains .git", () => {
    const rootDir = createTempRoot();
    mkdirSync(resolve(rootDir, "MemoryBank"), { recursive: true });
    mkdirSync(resolve(rootDir, ".git"), { recursive: true });

    const result = resolveAndValidatePaths({
      rootPath: rootDir,
      memoryBankPath: "MemoryBank",
    });

    expect(result.canonicalRootPath).toBe(resolve(rootDir));
  });

  it("continues accepting an existing project directory that contains package.json", () => {
    const rootDir = createTempRoot();
    mkdirSync(resolve(rootDir, "MemoryBank"), { recursive: true });
    writeFileSync(resolve(rootDir, "package.json"), "{}", "utf8");

    const result = resolveAndValidatePaths({
      rootPath: rootDir,
      memoryBankPath: "MemoryBank",
    });

    expect(result.canonicalRootPath).toBe(resolve(rootDir));
  });

  it("continues accepting an existing project directory that contains AGENTS.md", () => {
    const rootDir = createTempRoot();
    mkdirSync(resolve(rootDir, "MemoryBank"), { recursive: true });
    writeFileSync(resolve(rootDir, "AGENTS.md"), "# Project", "utf8");

    const result = resolveAndValidatePaths({
      rootPath: rootDir,
      memoryBankPath: "MemoryBank",
    });

    expect(result.canonicalRootPath).toBe(resolve(rootDir));
  });

  it("continues accepting an existing project directory that contains .hepha", () => {
    const rootDir = createTempRoot();
    mkdirSync(resolve(rootDir, "MemoryBank"), { recursive: true });
    mkdirSync(resolve(rootDir, ".hepha"), { recursive: true });

    const result = resolveAndValidatePaths({
      rootPath: rootDir,
      memoryBankPath: "MemoryBank",
    });

    expect(result.canonicalRootPath).toBe(resolve(rootDir));
  });
});

// ---------------------------------------------------------------------------
// resolveAndValidatePaths — Original input preservation
// ---------------------------------------------------------------------------

describe("resolveAndValidatePaths — original input preservation", () => {
  it("preserves the exact rootPath input string without mutation", () => {
    const homeDir = createTempRoot();
    const projectDir = resolve(homeDir, "my-project");
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(resolve(projectDir, "MemoryBank"), { recursive: true });
    const rawInput = "  ~/my-project  ";

    const result = resolveAndValidatePaths(
      {
        rootPath: rawInput,
        memoryBankPath: "MemoryBank",
      },
      { homeDirectory: homeDir },
    );

    // Original input must NOT be trimmed, canonicalized, or recomputed
    expect(result.originalRootPathInput).toBe(rawInput);
    expect(result.originalRootPathInput).not.toBe(result.canonicalRootPath);
  });

  it("preserves the exact memoryBankPath input string without mutation", () => {
    const rootDir = createTempProject();
    const rawInput = "  CustomMemoryBank  ";

    const result = resolveAndValidatePaths({
      rootPath: rootDir,
      memoryBankPath: rawInput,
    });

    // Original input must NOT be trimmed or recomputed
    expect(result.originalMemoryBankPathInput).toBe(rawInput);
    expect(result.originalMemoryBankPathInput).not.toBe(result.canonicalMemoryBankPath);
  });

  it("preserves leading/trailing whitespace in original inputs", () => {
    const rootDir = createTempProject();
    const rawRootPath = `  ${rootDir}  `;
    const rawMemoryBankPath = "  MemoryBank  ";

    const result = resolveAndValidatePaths({
      rootPath: rawRootPath,
      memoryBankPath: rawMemoryBankPath,
    });

    expect(result.originalRootPathInput).toBe(rawRootPath);
    expect(result.originalRootPathInput).not.toBe(rawRootPath.trim());
    expect(result.originalMemoryBankPathInput).toBe(rawMemoryBankPath);
    expect(result.originalMemoryBankPathInput).not.toBe(rawMemoryBankPath.trim());
  });

  it("preserves home-relative notation in original input", () => {
    const rootDir = createTempProject();
    const homeDir = createTempRoot();
    const projectUnderHome = resolve(homeDir, "project-ray");
    mkdirSync(projectUnderHome, { recursive: true });
    mkdirSync(resolve(projectUnderHome, "MemoryBank"), { recursive: true });
    mkdirSync(resolve(projectUnderHome, ".git"), { recursive: true });

    const result = resolveAndValidatePaths(
      {
        rootPath: "~/project-ray",
        memoryBankPath: "MemoryBank",
      },
      { homeDirectory: homeDir },
    );

    // Original input must preserve the ~/ notation
    expect(result.originalRootPathInput).toBe("~/project-ray");
    // Canonical path must be the expanded version
    expect(result.canonicalRootPath).toBe(projectUnderHome);
    // They must be different
    expect(result.originalRootPathInput).not.toBe(result.canonicalRootPath);
  });
});

// ---------------------------------------------------------------------------
// resolveAndValidatePaths — Canonical MemoryBank derivation
// ---------------------------------------------------------------------------

describe("resolveAndValidatePaths — canonical MemoryBank derivation", () => {
  it("derives MemoryBank path from canonical root for relative inputs", () => {
    const rootDir = createTempProject();

    const result = resolveAndValidatePaths({
      rootPath: rootDir,
      memoryBankPath: "MemoryBank",
    });

    expect(result.canonicalMemoryBankPath).toBe(resolve(rootDir, "MemoryBank"));
  });

  it("derives MemoryBank path from canonical root for './' prefixed inputs", () => {
    const rootDir = createTempProject();
    mkdirSync(resolve(rootDir, "sub", "MB"), { recursive: true });

    const result = resolveAndValidatePaths({
      rootPath: rootDir,
      memoryBankPath: "./sub/MB",
    });

    expect(result.canonicalMemoryBankPath).toBe(resolve(rootDir, "sub", "MB"));
  });

  it("resolves absolute MemoryBank path independently from canonical root", () => {
    const rootDir = createTempProject();
    const externalMb = resolve(createTempRoot(), "ExternalMB");
    mkdirSync(externalMb, { recursive: true });

    const result = resolveAndValidatePaths({
      rootPath: rootDir,
      memoryBankPath: externalMb,
    });

    expect(result.canonicalMemoryBankPath).toBe(resolve(externalMb));
    expect(result.canonicalMemoryBankPath).not.toContain(rootDir);
  });

  it("resolves home-relative MemoryBank path under home directory", () => {
    const rootDir = createTempProject();
    const homeDir = createTempRoot();
    const globalMb = resolve(homeDir, "GlobalMB");
    mkdirSync(globalMb, { recursive: true });

    const result = resolveAndValidatePaths(
      {
        rootPath: rootDir,
        memoryBankPath: "~/GlobalMB",
      },
      { homeDirectory: homeDir },
    );

    expect(result.canonicalMemoryBankPath).toBe(globalMb);
    expect(result.canonicalMemoryBankPath).not.toContain(rootDir);
  });

  it("canonicalizes existing symlinked MemoryBank via realpathSync", () => {
    // Given a project with a symlinked MemoryBank directory, the resolved
    // canonicalMemoryBankPath should be the real filesystem path, not the
    // symlink path. This ensures execution consumers always get the true path.
    const rootDir = createTempProject();
    const realMbTarget = resolve(rootDir, "real_memorybank");
    mkdirSync(realMbTarget, { recursive: true });

    // Create a symlink from MemoryBank → real_memorybank
    const symlinkMbPath = resolve(rootDir, "MemoryBankSymlink");
    symlinkSync(realMbTarget, symlinkMbPath);

    const result = resolveAndValidatePaths({
      rootPath: rootDir,
      memoryBankPath: symlinkMbPath,
    });

    // canonicalMemoryBankPath should resolve to the real target, not the symlink
    expect(result.canonicalMemoryBankPath).toBe(realMbTarget);
    expect(result.canonicalMemoryBankPath).not.toBe(symlinkMbPath);
  });

  it("keeps deterministic path for non-existent MemoryBank instead of canonicalizing", () => {
    // When the MemoryBank directory does not exist yet (initialization will
    // create it later), canonicalMemoryBankPath should be the deterministic
    // absolute resolved path, not fail or try to canonicalize.
    const rootDir = createTempProject();
    const nonExistentMb = resolve(rootDir, "will-be-created-later");

    const result = resolveAndValidatePaths({
      rootPath: rootDir,
      memoryBankPath: "will-be-created-later",
    });

    expect(result.canonicalMemoryBankPath).toBe(nonExistentMb);
  });
});

// ---------------------------------------------------------------------------
// resolveAndValidatePaths — Integration: complete happy path
// ---------------------------------------------------------------------------

describe("resolveAndValidatePaths — complete happy path", () => {
  it("resolves all fields correctly for a standard absolute input", () => {
    const rootDir = createTempProject();

    const result = resolveAndValidatePaths({
      rootPath: rootDir,
      memoryBankPath: "MemoryBank",
    });

    expect(result).toEqual({
      canonicalRootPath: resolve(rootDir),
      canonicalMemoryBankPath: resolve(rootDir, "MemoryBank"),
      originalRootPathInput: rootDir,
      originalMemoryBankPathInput: "MemoryBank",
    });
  });

  it("resolves all fields correctly for a home-relative project with relative MemoryBank", () => {
    const homeDir = createTempRoot();
    const projectDir = resolve(homeDir, "hepha-project");
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(resolve(projectDir, "MyMemoryBank"), { recursive: true });
    mkdirSync(resolve(projectDir, ".git"), { recursive: true });

    const result = resolveAndValidatePaths(
      {
        rootPath: "~/hepha-project",
        memoryBankPath: "MyMemoryBank",
      },
      { homeDirectory: homeDir },
    );

    expect(result.canonicalRootPath).toBe(projectDir);
    expect(result.canonicalMemoryBankPath).toBe(resolve(projectDir, "MyMemoryBank"));
    expect(result.originalRootPathInput).toBe("~/hepha-project");
    expect(result.originalMemoryBankPathInput).toBe("MyMemoryBank");
  });

  it("resolves all fields correctly for a relative project with home-relative MemoryBank", () => {
    const homeDir = createTempRoot();
    const workspaceDir = createTempRoot();
    const projectDir = resolve(workspaceDir, "my-project");
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(resolve(projectDir, ".git"), { recursive: true });
    const globalMb = resolve(homeDir, "GlobalMemoryBank");
    mkdirSync(globalMb, { recursive: true });

    const result = resolveAndValidatePaths(
      {
        rootPath: "./my-project",
        memoryBankPath: "~/GlobalMemoryBank",
      },
      { basePath: workspaceDir, homeDirectory: homeDir },
    );

    expect(result.canonicalRootPath).toBe(projectDir);
    expect(result.canonicalMemoryBankPath).toBe(globalMb);
    expect(result.originalRootPathInput).toBe("./my-project");
    expect(result.originalMemoryBankPathInput).toBe("~/GlobalMemoryBank");
  });
});

// ---------------------------------------------------------------------------
// Error type contract — ProjectRegistrationError
// ---------------------------------------------------------------------------

describe("ProjectRegistrationError", () => {
  it("extends Error and carries code, field, and message", () => {
    const error = new ProjectRegistrationError(
      "MISSING_FOLDER",
      "rootPath",
      "Project root path does not exist: /nonexistent",
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ProjectRegistrationError);
    expect(error.name).toBe("ProjectRegistrationError");
    expect(error.code).toBe("MISSING_FOLDER");
    expect(error.field).toBe("rootPath");
    expect(error.message).toBe("Project root path does not exist: /nonexistent");
  });

  it("is catchable as a generic Error", () => {
    try {
      throw new ProjectRegistrationError("INVALID_ROOT", "rootPath", "Not a directory");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Not a directory");
    }
  });

  it("supports all three error codes", () => {
    const missingField = new ProjectRegistrationError("MISSING_FIELD", "rootPath", "");
    expect(missingField.code).toBe("MISSING_FIELD");

    const missingFolder = new ProjectRegistrationError("MISSING_FOLDER", "rootPath", "");
    expect(missingFolder.code).toBe("MISSING_FOLDER");

    const invalidRoot = new ProjectRegistrationError("INVALID_ROOT", "rootPath", "");
    expect(invalidRoot.code).toBe("INVALID_ROOT");
  });
});
