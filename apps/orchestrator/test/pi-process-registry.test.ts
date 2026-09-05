import type { ChildProcess } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { PiWorkflowProcessRegistry } from "../src/runtime/pi/pi-process-registry.js";

function child(killed = false): ChildProcess {
  return { killed } as ChildProcess;
}

describe("Pi workflow process registry", () => {
  it("groups multiple processes under their workflow run", () => {
    const registry = new PiWorkflowProcessRegistry();
    const first = child();
    const second = child();

    registry.register("workflow-a", first);
    registry.register("workflow-a", second);
    registry.register("workflow-b", child());
    registry.register(undefined, child());

    expect(registry.activeRunIds()).toEqual(["workflow-a", "workflow-b"]);
  });

  it("removes a run only after its final process unregisters", () => {
    const registry = new PiWorkflowProcessRegistry();
    const first = child();
    const second = child();

    registry.register("workflow-a", first);
    registry.register("workflow-a", second);
    registry.unregister("workflow-a", first);
    expect(registry.activeRunIds()).toEqual(["workflow-a"]);

    registry.unregister("workflow-a", second);
    registry.unregister("missing", second);
    registry.unregister(undefined, second);
    expect(registry.activeRunIds()).toEqual([]);
  });

  it("terminates every live child once and clears the cancelled run", () => {
    const terminate = vi.fn();
    const registry = new PiWorkflowProcessRegistry(terminate);
    const live = child();
    const alreadyKilled = child(true);

    registry.register("workflow-a", live);
    registry.register("workflow-a", alreadyKilled);

    expect(registry.cancel("workflow-a")).toBe(1);
    expect(terminate).toHaveBeenCalledOnce();
    expect(terminate).toHaveBeenCalledWith(live);
    expect(registry.activeRunIds()).toEqual([]);
    expect(registry.cancel("workflow-a")).toBe(0);
  });
});
