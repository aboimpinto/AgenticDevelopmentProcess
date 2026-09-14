import { spawn } from "node:child_process";
import net from "node:net";
import { once } from "node:events";
import { expect, it } from "vitest";
import { assertPortAvailable, stopProcessTree } from "./dev-processes.mjs";

it("rejects an occupied port without disturbing its existing listener", async () => {
  const server = net.createServer(socket => socket.end());
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = (server.address() as net.AddressInfo).port;
  try {
    await expect(assertPortAvailable(port)).rejects.toThrow("already in use");
    expect(server.listening).toBe(true);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  await expect(assertPortAvailable(port)).resolves.toBeUndefined();
});

it.skipIf(process.platform === "win32").each([false, true])(
  "terminates a spawned server descendant (ignores SIGTERM: %s) without touching an unrelated service",
  async ignoresTerm => {
    const unrelated = net.createServer(socket => socket.end());
    unrelated.listen(0, "127.0.0.1"); await once(unrelated, "listening");
    const serverCode = `
      const net = require('node:net');
      ${ignoresTerm ? "process.on('SIGTERM', () => {});" : ""}
      const server = net.createServer();
      server.listen(0, '127.0.0.1', () => console.log(server.address().port));
    `;
    const wrapperCode = `require('node:child_process').spawn(process.execPath,
      ['-e', ${JSON.stringify(serverCode)}], {stdio: 'inherit'});`;
    const child = spawn(process.execPath, ["-e", wrapperCode], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
    try {
      let output = "";
      child.stdout!.on("data", data => { output += data.toString(); });
      await expect.poll(() => Number(output.trim()) > 0).toBe(true);
      const port = Number(output.trim());
      await expect(assertPortAvailable(port)).rejects.toThrow("already in use");
      stopProcessTree(child);
      if (ignoresTerm) {
        await expect.poll(() => child.signalCode).toBe("SIGTERM");
        // The wrapper is gone but its stubborn descendant still owns the port.
        await expect(assertPortAvailable(port)).rejects.toThrow("already in use");
        stopProcessTree(child, "SIGKILL");
      }
      await expect.poll(async () => {
        try { await assertPortAvailable(port); return true; } catch { return false; }
      }).toBe(true);
      expect(unrelated.listening).toBe(true);
    } finally {
      stopProcessTree(child, "SIGKILL");
      await new Promise<void>(resolve => unrelated.close(() => resolve()));
    }
  },
);
