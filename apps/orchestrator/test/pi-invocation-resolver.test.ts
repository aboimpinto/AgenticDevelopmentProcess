import { describe, expect, it } from "vitest";
import {
  formatMissingPiCliError,
  formatPiSpawnError,
  getPiInvocation,
  renderPiInvocation,
  resolvePiInvocation,
  type PiResolverHost,
} from "../src/runtime/pi/pi-invocation-resolver.js";

function host(existing: string[] = []): PiResolverHost {
  return {
    appData: null,
    execPath: "/node/bin/node",
    exists: (path) => existing.includes(path),
    pathDelimiter: ":",
    platform: "linux",
    readDirectory: () => [],
    resolvePath: (path) => path.replace("~", "/home/user"),
  };
}

describe("Pi invocation resolver", () => {
  it("uses a configured absolute executable and renders it", () => {
    const result = resolvePiInvocation(
      { HEPHA_PI_COMMAND: "~/tools/pi" },
      host(["/home/user/tools/pi"]),
    );

    expect(result.invocation).toEqual({
      argsPrefix: [],
      command: "/home/user/tools/pi",
      diagnostics: ["No pi executable was found on PATH."],
      source: "HEPHA_PI_COMMAND",
    });
    expect(renderPiInvocation(result.invocation!)).toBe("/home/user/tools/pi");
  });

  it("resolves a configured command on PATH", () => {
    const result = resolvePiInvocation(
      { HEPHA_PI_COMMAND: "custom-pi", PATH: "/tools:/bin" },
      host(["/tools/custom-pi"]),
    );

    expect(result.invocation).toEqual(expect.objectContaining({
      command: "/tools/custom-pi",
      source: "HEPHA_PI_COMMAND on PATH",
    }));
  });

  it("discovers nvm and PATH candidates after recording unavailable candidates", () => {
    const resolverHost = host(["/home/user/.nvm/versions/node/v22/bin/pi"]);
    resolverHost.readDirectory = () => ["v22"];

    const result = resolvePiInvocation({ PATH: "/empty" }, resolverHost);

    expect(result.invocation).toEqual(expect.objectContaining({
      command: "/home/user/.nvm/versions/node/v22/bin/pi",
      source: "nvm Node install",
    }));
    expect(result.diagnostics).toContainEqual(expect.stringContaining("~/.local/bin/pi"));
  });

  it("returns diagnostics and throws a useful missing-CLI error", () => {
    const resolverHost = host();
    const resolution = resolvePiInvocation({ HEPHA_PI_COMMAND: "missing" }, resolverHost);

    expect(resolution.invocation).toBeNull();
    expect(resolution.diagnostics).toContain("HEPHA_PI_COMMAND is set but not usable: missing");
    expect(() => getPiInvocation({ HEPHA_PI_COMMAND: "missing" }, resolverHost)).toThrow(
      /Pi CLI is not available to Hepha[\s\S]*Pi resolver:/,
    );
    expect(formatMissingPiCliError(["not found"])).toContain("npm install -g");
  });

  it("formats spawn failures with resolver evidence", () => {
    expect(formatPiSpawnError(new Error("spawn ENOENT"), {
      argsPrefix: ["cli.js"],
      command: "node",
      diagnostics: ["selected fallback"],
      source: "package",
    })).toContain("Resolved Pi command: node cli.js (package)");
  });
});
