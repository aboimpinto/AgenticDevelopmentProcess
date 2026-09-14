import { spawn } from "node:child_process";
import http from "node:http";
import { assertPortAvailable, stopProcessTree } from "./dev-processes.mjs";

const orchestratorPort = Number(process.env.HEPHA_ORCHESTRATOR_PORT ?? "4318");
const webPort = Number(process.env.HEPHA_WEB_PORT ?? "5176");
const orchestratorUrl = `http://127.0.0.1:${orchestratorPort}/api/health`;
const processTrees = new Set();
const usePolling = process.argv.includes("--poll");
let isShuttingDown = false;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
});

async function main() {
  await assertPortAvailable(orchestratorPort);
  await assertPortAvailable(webPort);
  if (isShuttingDown) return;
  const orchestrator = startProcess("orchestrator", [
    "--filter",
    "@hepha/orchestrator",
    "dev",
  ]);

  await waitForHealth(orchestratorUrl, orchestrator, 20000);

  if (isShuttingDown) return;
  startProcess("web", ["--filter", "@hepha/web", "dev"]);
}

function startProcess(label, args) {
  const command = getPnpmCommand();
  const commandArgs = getPnpmArgs(args);
  const child = spawn(command, commandArgs, {
    env: getChildEnv(),
    shell: false,
    stdio: "inherit",
    windowsHide: true,
    detached: process.platform !== "win32",
  });

  processTrees.add(child);

  child.on("exit", (code, signal) => {
    if (isShuttingDown) {
      return;
    }

    console.error(`${label} stopped; shutting down the development session.`);
    shutdown(signal === "SIGINT" ? 0 : code ?? 1);
  });

  child.on("error", (error) => {
    console.error(`${label} failed to start: ${error.message}`);
    shutdown(1);
  });

  return child;
}

function getChildEnv() {
  if (!usePolling) {
    return process.env;
  }

  return {
    ...process.env,
    CHOKIDAR_USEPOLLING: "1",
  };
}

async function waitForHealth(url, child, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (isShuttingDown || child.exitCode !== null || child.signalCode !== null) {
      throw new Error("orchestrator exited before becoming healthy.");
    }

    if (await isHealthy(url)) {
      return;
    }

    await sleep(250);
  }

  throw new Error(`orchestrator did not become healthy at ${url}.`);
}

function isHealthy(url) {
  return new Promise((resolveHealth) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolveHealth(response.statusCode === 200);
    });

    request.on("error", () => resolveHealth(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolveHealth(false);
    });
  });
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function getPnpmCommand() {
  return process.platform === "win32" ? "cmd.exe" : "pnpm";
}

function getPnpmArgs(args) {
  if (process.platform !== "win32") {
    return args;
  }

  return ["/d", "/s", "/c", "pnpm.cmd", ...args];
}

function shutdown(code) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  for (const child of processTrees) stopProcessTree(child);
  if (processTrees.size) setTimeout(() => {
    for (const child of processTrees) stopProcessTree(child, "SIGKILL");
    processTrees.clear();
  }, 2000);

  process.exitCode = code;
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
