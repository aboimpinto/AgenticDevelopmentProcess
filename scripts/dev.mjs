import { spawn } from "node:child_process";
import http from "node:http";

const orchestratorUrl = "http://127.0.0.1:4317/api/health";
const children = new Set();
const usePolling = process.argv.includes("--poll");
let isShuttingDown = false;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
});

async function main() {
  const orchestrator = startProcess("orchestrator", [
    "--filter",
    "@hepha/orchestrator",
    "dev",
  ]);

  await waitForHealth(orchestratorUrl, orchestrator, 20000);

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
  });

  children.add(child);

  child.on("exit", (code, signal) => {
    children.delete(child);

    if (isShuttingDown) {
      return;
    }

    if (children.size > 0 && code !== 0 && signal !== "SIGINT") {
      console.error(`${label} stopped unexpectedly.`);
      shutdown(code ?? 1);
    }
  });

  child.on("error", (error) => {
    children.delete(child);
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
    if (child.exitCode !== null) {
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
  isShuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }

  process.exitCode = code;
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
