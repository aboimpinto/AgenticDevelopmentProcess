import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPiProcessEnvironment,
  ensureCargoShimDirectory,
  findWindowsCargoExecutable,
  type PiProcessEnvironmentConfig,
} from "../src/runtime/pi/pi-process-environment.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { force: true, recursive: true })));

function setup(runtimeEnv: NodeJS.ProcessEnv = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-pi-env-"));
  roots.push(root);
  const config: PiProcessEnvironmentConfig = {
    localStateDirectory: resolve(root, ".hepha"),
    readUserEnvironmentValue: () => null,
    runtimeEnv,
    workspaceRoot: root,
  };
  return { config, root };
}

describe("Pi process environment", () => {
  it("merges local dotenv values and user fallbacks without losing runtime values", () => {
    const { config, root } = setup({ PATH: "/runtime", OPENAI_API_KEY: "runtime-key" });
    writeFileSync(resolve(root, ".env"), "OPENAI_API_KEY=local-key\nDEEPSEEK_API_KEY='local-deepseek'\n", "utf8");
    const readUserEnvironmentValue = vi.fn((key: string) => key === "HEPHA_PI_COMMAND" ? "/user/pi" : null);

    const env = createPiProcessEnvironment({ ...config, readUserEnvironmentValue });

    expect(env.OPENAI_API_KEY).toBe("local-key");
    expect(env.DEEPSEEK_API_KEY).toBe("local-deepseek");
    expect(env.HEPHA_PI_COMMAND).toBe("/user/pi");
    expect(env.PI_SKIP_VERSION_CHECK).toBe("1");
    expect(env.PI_TELEMETRY).toBe("0");
  });

  it("preserves explicit Pi runtime flags", () => {
    const { config } = setup({ PI_SKIP_VERSION_CHECK: "0", PI_TELEMETRY: "1" });

    expect(createPiProcessEnvironment(config)).toEqual(expect.objectContaining({
      PI_SKIP_VERSION_CHECK: "0",
      PI_TELEMETRY: "1",
    }));
  });

  it("creates an executable Cargo shim and prepends it to PATH", () => {
    const { config, root } = setup({ PATH: "/tools" });
    const cargoExecutable = resolve(root, "cargo.exe");
    writeFileSync(cargoExecutable, "cargo", "utf8");
    config.runtimeEnv.HEPHA_CARGO_EXE = cargoExecutable;

    const shimDirectory = ensureCargoShimDirectory(config);
    const env = createPiProcessEnvironment(config);
    const shimPath = resolve(shimDirectory!, "cargo");

    expect(findWindowsCargoExecutable(config.runtimeEnv)).toBe(cargoExecutable);
    expect(readFileSync(shimPath, "utf8")).toContain(`exec "${cargoExecutable}" "$@"`);
    expect(statSync(shimPath).mode & 0o111).not.toBe(0);
    expect(env.PATH?.split(delimiter)[0]).toBe(shimDirectory);
  });

  it("returns no shim when Cargo cannot be discovered", () => {
    const { config } = setup({ HEPHA_CARGO_EXE: "/missing/cargo.exe" });

    expect(findWindowsCargoExecutable(config.runtimeEnv)).toBeNull();
    expect(ensureCargoShimDirectory(config)).toBeNull();
  });
});
