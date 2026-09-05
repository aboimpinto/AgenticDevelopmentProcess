import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import type { PiPromptRunOptions } from "./pi-argument-builder.js";

export interface PiPromptMaterializerHost {
  now(): Date;
  randomId(): string;
  writeFile(path: string, content: string): void;
}

const defaultHost: PiPromptMaterializerHost = {
  now: () => new Date(),
  randomId: randomUUID,
  writeFile: (path, content) => writeFileSync(path, content, "utf8"),
};

export function shouldUsePiPromptFile(prompt: string, options: PiPromptRunOptions): boolean {
  return Boolean(options.implementationProfile) || prompt.length > 8000;
}

export function writePiPromptFileArgument(
  prompt: string,
  options: PiPromptRunOptions,
  sessionDirectory: string,
  host: PiPromptMaterializerHost = defaultHost,
): string {
  const runPrefix = options.workflowRunId ? `${options.workflowRunId}-` : "";
  const timestamp = host.now().toISOString().replace(/[:.]/g, "-");
  const promptPath = resolve(sessionDirectory, `${runPrefix}${timestamp}-${host.randomId()}-prompt.md`);

  host.writeFile(promptPath, prompt);
  return `@${promptPath}`;
}
