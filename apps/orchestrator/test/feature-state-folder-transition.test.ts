import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { FeatureStateFolderTransition } from "../src/application/features/feature-state-folder-transition.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
});

function createTarget(stateFolder: string) {
  const rootPath = mkdtempSync(join(tmpdir(), "hepha-feature-transition-"));
  const memoryBankPath = join(rootPath, "MemoryBank");
  const folderPath = join(memoryBankPath, "Features", stateFolder, "work-item-arbitrary");
  temporaryDirectories.push(rootPath);
  mkdirSync(folderPath, { recursive: true });
  writeFileSync(join(folderPath, "FeatureDescription.md"), "# Work\n");
  return {
    feature: { folderPath, stateFolder } as never,
    project: { memoryBankPath, rootPath } as never,
  };
}

describe("feature state-folder transition", () => {
  it("moves a Ready feature to In Progress and can move it back", () => {
    const target = createTarget("02_READY_TO_DEVELOP");
    const transition = new FeatureStateFolderTransition();
    const inProgressPath = transition.moveToInProgress(target.project, target.feature);

    expect(inProgressPath).toBe(join(target.project.memoryBankPath, "Features", "03_IN_PROGRESS", basename(target.feature.folderPath)));
    expect(existsSync(join(inProgressPath, "FeatureDescription.md"))).toBe(true);
    expect(existsSync(target.feature.folderPath)).toBe(false);

    const readyPath = transition.moveBackToReady(target.project, {
      ...target.feature,
      folderPath: inProgressPath,
      stateFolder: "03_IN_PROGRESS",
    });
    expect(readyPath).toBe(target.feature.folderPath);
    expect(existsSync(join(readyPath, "FeatureDescription.md"))).toBe(true);
  });

  it("is idempotent when the feature already reports the target state", () => {
    const ready = createTarget("02_READY_TO_DEVELOP");
    const inProgress = createTarget("03_IN_PROGRESS");
    const transition = new FeatureStateFolderTransition();

    expect(transition.moveBackToReady(ready.project, ready.feature)).toBe(ready.feature.folderPath);
    expect(transition.moveToInProgress(inProgress.project, inProgress.feature)).toBe(inProgress.feature.folderPath);
  });

  it("rejects invalid source states and destination collisions", () => {
    const invalid = createTarget("01_SUBMITTED");
    const ready = createTarget("02_READY_TO_DEVELOP");
    const collisionPath = join(ready.project.memoryBankPath, "Features", "03_IN_PROGRESS", basename(ready.feature.folderPath));
    mkdirSync(collisionPath, { recursive: true });
    const transition = new FeatureStateFolderTransition();

    expect(() => transition.moveToInProgress(invalid.project, invalid.feature)).toThrow(
      "Only READY FEATs can be moved to In Progress.",
    );
    expect(() => transition.moveBackToReady(invalid.project, invalid.feature)).toThrow(
      "Only IN_PROGRESS FEATs can be rolled back",
    );
    expect(() => transition.moveToInProgress(ready.project, ready.feature)).toThrow(
      `In Progress folder already exists: ${collisionPath}`,
    );
  });
});
