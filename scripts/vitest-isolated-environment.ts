import { tmpdir } from "node:os";
import { resolve } from "node:path";

// Importing the orchestrator composes its SQLite-backed stores at module load.
// Give each Vitest worker a separate database so clean-clone test runs cannot
// race on the repository's normal .hepha/hepha.sqlite runtime path.
if (!process.env.HEPHA_DATABASE_PATH) {
  const workerIdentity = `${process.pid}-${process.env.VITEST_POOL_ID ?? "main"}`;
  process.env.HEPHA_DATABASE_PATH = resolve(tmpdir(), `hepha-vitest-${workerIdentity}.sqlite`);
}
