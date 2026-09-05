import { existsSync, mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupRawSessionLogs,
  DEFAULT_SESSION_LOG_CLEANUP_INTERVAL_MINUTES,
  DEFAULT_SESSION_LOG_RETENTION_HOURS,
  readRawSessionLogCleanupConfig,
} from "../src/raw-session-log-cleanup.js";

const tempRoots: string[] = [];
const now = new Date("2026-07-13T12:00:00.000Z");

function createTempRoot(): string {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-session-cleanup-"));
  tempRoots.push(root);
  return root;
}

function writeFileWithAge(path: string, content: string, ageHours: number): void {
  writeFileSync(path, content, "utf8");
  const modifiedAt = new Date(now.getTime() - ageHours * 60 * 60 * 1_000);
  utimesSync(path, modifiedAt, modifiedAt);
}

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { force: true, recursive: true });
  }
  tempRoots.length = 0;
});

describe("cleanupRawSessionLogs", () => {
  it("deletes only expired raw session artifacts and reports their aggregate size", async () => {
    const sessionDir = createTempRoot();
    writeFileWithAge(resolve(sessionDir, "workflow-old.json"), "old session", 7);
    writeFileWithAge(resolve(sessionDir, "startup-old.log"), "old startup", 7);
    writeFileWithAge(resolve(sessionDir, "deep-dive-old-prompt.md"), "old prompt", 7);
    writeFileWithAge(resolve(sessionDir, "workflow-current.json"), "current session", 1);
    writeFileWithAge(resolve(sessionDir, "notes.md"), "durable note", 7);
    mkdirSync(resolve(sessionDir, "workflow-old-directory.json"));

    const summary = await cleanupRawSessionLogs({
      now,
      retentionHours: 6,
      sessionDir,
    });

    expect(summary).toEqual({
      bytesFreed: Buffer.byteLength("old sessionold startupold prompt"),
      filesDeleted: 3,
    });
    expect(existsSync(resolve(sessionDir, "workflow-old.json"))).toBe(false);
    expect(existsSync(resolve(sessionDir, "startup-old.log"))).toBe(false);
    expect(existsSync(resolve(sessionDir, "deep-dive-old-prompt.md"))).toBe(false);
    expect(existsSync(resolve(sessionDir, "workflow-current.json"))).toBe(true);
    expect(existsSync(resolve(sessionDir, "notes.md"))).toBe(true);
    expect(existsSync(resolve(sessionDir, "workflow-old-directory.json"))).toBe(true);
  });

  it("does not follow or delete symlinks", async () => {
    const sessionDir = createTempRoot();
    const targetPath = resolve(createTempRoot(), "durable-session.json");
    writeFileWithAge(targetPath, "durable target", 7);
    const linkPath = resolve(sessionDir, "workflow-linked.json");
    symlinkSync(targetPath, linkPath);

    const summary = await cleanupRawSessionLogs({ now, retentionHours: 6, sessionDir });

    expect(summary).toEqual({ bytesFreed: 0, filesDeleted: 0 });
    expect(existsSync(linkPath)).toBe(true);
    expect(existsSync(targetPath)).toBe(true);
  });

  it("treats a missing session directory as a no-op", async () => {
    const sessionDir = resolve(createTempRoot(), "missing");

    await expect(cleanupRawSessionLogs({ now, retentionHours: 6, sessionDir })).resolves.toEqual({
      bytesFreed: 0,
      filesDeleted: 0,
    });
  });
});

describe("readRawSessionLogCleanupConfig", () => {
  it("uses configured positive integers", () => {
    expect(
      readRawSessionLogCleanupConfig({
        HEPHA_PI_SESSION_CLEANUP_INTERVAL_MINUTES: "30",
        HEPHA_PI_SESSION_RETENTION_HOURS: "12",
      }),
    ).toEqual({ cleanupIntervalMinutes: 30, retentionHours: 12 });
  });

  it("falls back safely for invalid values", () => {
    expect(
      readRawSessionLogCleanupConfig({
        HEPHA_PI_SESSION_CLEANUP_INTERVAL_MINUTES: "15minutes",
        HEPHA_PI_SESSION_RETENTION_HOURS: "0",
      }),
    ).toEqual({
      cleanupIntervalMinutes: DEFAULT_SESSION_LOG_CLEANUP_INTERVAL_MINUTES,
      retentionHours: DEFAULT_SESSION_LOG_RETENTION_HOURS,
    });
  });
});
