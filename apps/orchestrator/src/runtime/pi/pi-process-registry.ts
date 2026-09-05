import { execFileSync, type ChildProcess } from "node:child_process";

export type TerminatePiProcess = (child: ChildProcess) => void;

export class PiWorkflowProcessRegistry {
  readonly #runs = new Map<string, Set<ChildProcess>>();
  readonly #terminate: TerminatePiProcess;

  constructor(terminate: TerminatePiProcess = terminatePiProcessTree) {
    this.#terminate = terminate;
  }

  register(runId: string | undefined, child: ChildProcess): void {
    if (!runId) {
      return;
    }

    const children = this.#runs.get(runId) ?? new Set<ChildProcess>();
    children.add(child);
    this.#runs.set(runId, children);
  }

  unregister(runId: string | undefined, child: ChildProcess): void {
    if (!runId) {
      return;
    }

    const children = this.#runs.get(runId);

    if (!children) {
      return;
    }

    children.delete(child);

    if (children.size === 0) {
      this.#runs.delete(runId);
    }
  }

  cancel(runId: string): number {
    const children = this.#runs.get(runId);

    if (!children) {
      return 0;
    }

    let killed = 0;

    for (const child of children) {
      if (!child.killed) {
        this.#terminate(child);
        killed += 1;
      }
    }

    this.#runs.delete(runId);
    return killed;
  }

  activeRunIds(): string[] {
    return [...this.#runs.keys()];
  }
}

export function terminatePiProcessTree(child: ChildProcess): void {
  if (process.platform === "win32" && child.pid) {
    try {
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // The regular signal path is the portable fallback when taskkill fails.
    }
  }

  if (!child.killed) {
    child.kill();
  }
}
