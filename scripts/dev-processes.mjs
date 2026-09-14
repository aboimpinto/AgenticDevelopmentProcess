import net from "node:net";

/** Check before launching: another instance's health must not certify our child. */
export function assertPortAvailable(port, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", error => reject(new Error(
      error.code === "EADDRINUSE"
        ? `Port ${host}:${port} is already in use. Stop the existing service before starting Hepha.`
        : `Cannot bind ${host}:${port}: ${error.message}`,
    )));
    probe.listen(port, host, () => probe.close(resolve));
  });
}

/** pnpm and tsx spawn descendants; terminating only pnpm leaves the server alive. */
export function stopProcessTree(child, signal = "SIGTERM") {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}
