import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { delimiter, resolve } from "node:path";

export interface PiProcessEnvironmentConfig {
  localStateDirectory: string;
  readUserEnvironmentValue(key: string): string | null;
  runtimeEnv: NodeJS.ProcessEnv;
  workspaceRoot: string;
}

export function createPiProcessEnvironment(config: PiProcessEnvironmentConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...config.runtimeEnv };

  for (const [key, value] of Object.entries(readDotEnv(resolve(config.workspaceRoot, ".env")))) {
    if (value) {
      env[key] = value;
    }
  }

  for (const key of ["OPENAI_API_KEY", "DEEPSEEK_API_KEY", "HEPHA_PI_COMMAND", "HEPHA_DATABASE_PATH"]) {
    if (!env[key]) {
      const userValue = config.readUserEnvironmentValue(key);

      if (userValue) {
        env[key] = userValue;
      }
    }
  }

  const cargoShimDirectory = ensureCargoShimDirectory(config);

  if (cargoShimDirectory) {
    env.PATH = [cargoShimDirectory, env.PATH].filter(Boolean).join(delimiter);
  }

  env.PI_SKIP_VERSION_CHECK ??= "1";
  env.PI_TELEMETRY ??= "0";
  return env;
}

export function ensureCargoShimDirectory(config: PiProcessEnvironmentConfig): string | null {
  const cargoExecutable = findWindowsCargoExecutable(config.runtimeEnv);

  if (!cargoExecutable) {
    return null;
  }

  const shimDirectory = resolve(config.localStateDirectory, "bin");
  const shimPath = resolve(shimDirectory, "cargo");

  try {
    mkdirSync(shimDirectory, { recursive: true });
    writeFileSync(shimPath, `#!/usr/bin/env bash\nexec "${cargoExecutable}" "$@"\n`, "utf8");
    chmodSync(shimPath, 0o755);
    return shimDirectory;
  } catch {
    return null;
  }
}

export function findWindowsCargoExecutable(runtimeEnv: NodeJS.ProcessEnv): string | null {
  const candidates = [
    runtimeEnv.HEPHA_CARGO_EXE,
    "/mnt/c/Users/aboim/.cargo/bin/cargo.exe",
    ...safeReadDirectory("/mnt/c/Users").map((entry) => `/mnt/c/Users/${entry}/.cargo/bin/cargo.exe`),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function readDotEnv(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }

  const values: Record<string, string> = {};

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex > 0) {
      values[trimmedLine.slice(0, separatorIndex).trim()] = unquote(
        trimmedLine.slice(separatorIndex + 1).trim(),
      );
    }
  }

  return values;
}

function unquote(value: string): string {
  return (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
    ? value.slice(1, -1)
    : value;
}

function safeReadDirectory(path: string): string[] {
  try {
    return existsSync(path) ? readdirSync(path) : [];
  } catch {
    return [];
  }
}
