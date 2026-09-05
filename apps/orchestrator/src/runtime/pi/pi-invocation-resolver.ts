import { existsSync, readdirSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { resolvePathInput } from "../../path-input.js";

export interface PiInvocation {
  readonly argsPrefix: string[];
  readonly command: string;
  readonly diagnostics: string[];
  readonly source: string;
}

export interface PiResolverHost {
  appData: string | null;
  execPath: string;
  exists(path: string): boolean;
  pathDelimiter: string;
  platform: NodeJS.Platform;
  readDirectory(path: string): string[];
  resolvePath(path: string): string;
}

const defaultHost: PiResolverHost = {
  appData: process.env.APPDATA ?? null,
  execPath: process.execPath,
  exists: existsSync,
  pathDelimiter: delimiter,
  platform: process.platform,
  readDirectory: safeReadDirectory,
  resolvePath: resolvePathInput,
};

export function getPiInvocation(
  env: NodeJS.ProcessEnv,
  host: PiResolverHost = defaultHost,
): PiInvocation {
  const resolution = resolvePiInvocation(env, host);
  if (resolution.invocation) return resolution.invocation;
  throw new Error(formatMissingPiCliError(resolution.diagnostics));
}

export function resolvePiInvocation(
  env: NodeJS.ProcessEnv,
  host: PiResolverHost = defaultHost,
): { diagnostics: string[]; invocation: PiInvocation | null } {
  const diagnostics: string[] = [];
  const candidates: Array<{
    argsPrefix: string[];
    checkPath: string;
    command: string;
    source: string;
  }> = [];
  const configuredCommand = env.HEPHA_PI_COMMAND?.trim();
  if (configuredCommand) {
    const configured = createConfiguredCandidate(configuredCommand, env, host);
    if (configured) candidates.push(configured);
    else diagnostics.push(`HEPHA_PI_COMMAND is set but not usable: ${configuredCommand}`);
  }

  if (host.platform !== "win32") {
    const localPi = host.resolvePath("~/.local/bin/pi");
    const packageCli = getPiPackageCliPathForNode(host.execPath);
    candidates.push(
      { argsPrefix: [], checkPath: localPi, command: localPi, source: "~/.local/bin/pi" },
      {
        argsPrefix: [],
        checkPath: resolve(dirname(host.execPath), "pi"),
        command: resolve(dirname(host.execPath), "pi"),
        source: "current Node global bin",
      },
      {
        argsPrefix: [packageCli],
        checkPath: packageCli,
        command: host.execPath,
        source: "current Node global package",
      },
      ...getNvmPiCandidates(host),
    );
    const pathPi = findExecutableOnPath("pi", env.PATH, host);
    if (pathPi) {
      candidates.push({ argsPrefix: [], checkPath: pathPi, command: pathPi, source: "PATH" });
    } else {
      diagnostics.push("No pi executable was found on PATH.");
    }
  } else {
    const npmDirectory = host.appData ? resolve(host.appData, "npm") : "";
    const cliPath = resolve(
      npmDirectory,
      "node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
    );
    candidates.push({
      argsPrefix: [cliPath],
      checkPath: cliPath,
      command: host.execPath,
      source: "Windows npm global package",
    });
    const pathPi = findExecutableOnPath("pi.cmd", env.PATH, host);
    if (pathPi) {
      candidates.push({ argsPrefix: [], checkPath: pathPi, command: pathPi, source: "PATH" });
    }
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = [candidate.command, ...candidate.argsPrefix].join("\0");
    if (seen.has(key)) continue;
    seen.add(key);
    if (host.exists(candidate.checkPath)) {
      return {
        diagnostics,
        invocation: {
          argsPrefix: candidate.argsPrefix,
          command: candidate.command,
          diagnostics,
          source: candidate.source,
        },
      };
    }
    diagnostics.push(`Checked ${candidate.source}: ${candidate.checkPath} was not found.`);
  }
  return { diagnostics, invocation: null };
}

export function renderPiInvocation(invocation: PiInvocation): string {
  return [invocation.command, ...invocation.argsPrefix].join(" ");
}

export function formatPiSpawnError(error: Error, invocation: PiInvocation): string {
  return [
    `Failed to start Pi: ${error.message}`,
    `Resolved Pi command: ${renderPiInvocation(invocation)} (${invocation.source}).`,
    ...invocation.diagnostics.map((diagnostic) => `Pi resolver: ${diagnostic}`),
  ].join("\n");
}

export function formatMissingPiCliError(diagnostics: string[]): string {
  return [
    "Pi CLI is not available to Hepha.",
    ...diagnostics.map((diagnostic) => `Pi resolver: ${diagnostic}`),
    "Install it with `npm install -g @earendil-works/pi-coding-agent`, or set HEPHA_PI_COMMAND to an existing Pi executable.",
  ].join("\n");
}

function createConfiguredCandidate(
  command: string,
  env: NodeJS.ProcessEnv,
  host: PiResolverHost,
) {
  if (command.includes("/") || command.includes("\\")) {
    const resolvedCommand = host.resolvePath(command);
    return {
      argsPrefix: [], checkPath: resolvedCommand, command: resolvedCommand, source: "HEPHA_PI_COMMAND",
    };
  }
  const pathCommand = findExecutableOnPath(command, env.PATH, host);
  return pathCommand
    ? {
        argsPrefix: [],
        checkPath: pathCommand,
        command: pathCommand,
        source: "HEPHA_PI_COMMAND on PATH",
      }
    : null;
}

function getPiPackageCliPathForNode(nodePath: string): string {
  return resolve(
    dirname(nodePath),
    "../lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
  );
}

function getNvmPiCandidates(host: PiResolverHost) {
  const versionsDir = host.resolvePath("~/.nvm/versions/node");
  return host.readDirectory(versionsDir).map((version) => {
    const path = resolve(versionsDir, version, "bin/pi");
    return { argsPrefix: [], checkPath: path, command: path, source: "nvm Node install" };
  });
}

function findExecutableOnPath(
  command: string,
  pathValue: string | undefined,
  host: PiResolverHost,
): string | null {
  if (!pathValue) return null;
  for (const directory of pathValue.split(host.pathDelimiter)) {
    if (!directory) continue;
    const candidate = resolve(directory, command);
    if (host.exists(candidate)) return candidate;
  }
  return null;
}

function safeReadDirectory(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}
