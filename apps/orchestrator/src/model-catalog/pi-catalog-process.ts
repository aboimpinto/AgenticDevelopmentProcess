import { spawn } from "node:child_process";
import { PI_SDK_CATALOG_SCRIPT } from "./pi-sdk-catalog-script.js";
import type { PiCatalogProcess, PiCatalogProcessResult } from "./catalog-ports.js";

/** Bounded, read-only discovery through the installed Pi SDK, without a shell. */
export class NodePiCatalogProcess implements PiCatalogProcess {
  constructor(private readonly executablePath?: string) {}
  async listModels(input: { readonly timeoutMs: number; readonly maxStdoutBytes: number }): Promise<PiCatalogProcessResult> {
    return new Promise((resolve) => {
      let settled = false;
      let stdout = "";
      let stdoutBytes = 0;
      const child = spawn(process.execPath, ["--input-type=module", "--eval", PI_SDK_CATALOG_SCRIPT,
        ...(this.executablePath ? [this.executablePath] : [])], {
        shell: false,
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      });
      const finish = (result: PiCatalogProcessResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      };
      const timeout = setTimeout(() => {
        child.kill();
        finish({ kind: "timeout" });
      }, input.timeoutMs);

      child.on("error", () => finish({ kind: "spawn_failed" }));
      child.stdout.on("data", (chunk: Buffer | string) => {
        const text = String(chunk);
        stdoutBytes += Buffer.byteLength(text);
        if (stdoutBytes > input.maxStdoutBytes) {
          child.kill();
          finish({ kind: "spawn_failed" });
          return;
        }
        stdout += text;
      });
      child.on("close", (exitCode) => {
        if (exitCode !== 0) {
          finish({ kind: "non_zero", exitCode });
          return;
        }
        finish({ kind: "success", stdout });
      });
    });
  }
}
