import { lstat, readdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";

export const DEFAULT_SESSION_LOG_RETENTION_HOURS = 6;
export const DEFAULT_SESSION_LOG_CLEANUP_INTERVAL_MINUTES = 15;

const rawSessionArtifactName = /^(?:workflow|deep-dive|startup)-.+\.(?:jsonl?|log|md)$/i;

export interface RawSessionLogCleanupConfig {
  cleanupIntervalMinutes: number;
  retentionHours: number;
}

export interface RawSessionLogCleanupSummary {
  bytesFreed: number;
  filesDeleted: number;
}

export interface RawSessionLogCleanupOptions {
  now?: Date;
  retentionHours: number;
  sessionDir: string;
}

export interface RawSessionLogCleanupServiceOptions extends RawSessionLogCleanupConfig {
  report?: (summary: RawSessionLogCleanupSummary) => void;
  sessionDir: string;
}

export function readRawSessionLogCleanupConfig(
  env: NodeJS.ProcessEnv,
): RawSessionLogCleanupConfig {
  return {
    cleanupIntervalMinutes: readPositiveInteger(
      env.HEPHA_PI_SESSION_CLEANUP_INTERVAL_MINUTES,
      DEFAULT_SESSION_LOG_CLEANUP_INTERVAL_MINUTES,
    ),
    retentionHours: readPositiveInteger(
      env.HEPHA_PI_SESSION_RETENTION_HOURS,
      DEFAULT_SESSION_LOG_RETENTION_HOURS,
    ),
  };
}

export async function cleanupRawSessionLogs(
  options: RawSessionLogCleanupOptions,
): Promise<RawSessionLogCleanupSummary> {
  const emptySummary: RawSessionLogCleanupSummary = { bytesFreed: 0, filesDeleted: 0 };
  const cutoff = (options.now ?? new Date()).getTime() - options.retentionHours * 60 * 60 * 1_000;

  try {
    const directoryStat = await lstat(options.sessionDir);

    // A configured directory symlink could point at durable artifacts. Refuse it.
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      return emptySummary;
    }

    const entries = await readdir(options.sessionDir);
    let bytesFreed = 0;
    let filesDeleted = 0;

    for (const entry of entries) {
      if (!rawSessionArtifactName.test(entry)) {
        continue;
      }

      const path = resolve(options.sessionDir, entry);

      try {
        // lstat deliberately rejects symlinks and never follows their target.
        const entryStat = await lstat(path);

        if (!entryStat.isFile() || entryStat.isSymbolicLink() || entryStat.mtimeMs >= cutoff) {
          continue;
        }

        await unlink(path);
        filesDeleted += 1;
        bytesFreed += entryStat.size;
      } catch {
        // Best effort only: one inaccessible or raced entry must not block workflows.
      }
    }

    return { bytesFreed, filesDeleted };
  } catch {
    // A missing or inaccessible session directory is not a workflow failure.
    return emptySummary;
  }
}

export function startRawSessionLogCleanupService(
  options: RawSessionLogCleanupServiceOptions,
): { stop: () => void } {
  let cleaning = false;

  const sweep = () => {
    if (cleaning) {
      return;
    }

    cleaning = true;
    void cleanupRawSessionLogs(options)
      .then((summary) => {
        if (summary.filesDeleted > 0) {
          options.report?.(summary);
        }
      })
      .finally(() => {
        cleaning = false;
      });
  };

  sweep();
  const timer = setInterval(sweep, options.cleanupIntervalMinutes * 60 * 1_000);
  timer.unref();

  return {
    stop: () => clearInterval(timer),
  };
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value || !/^\d+$/.test(value)) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
