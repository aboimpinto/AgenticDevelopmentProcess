import { createServer, type RequestListener } from "node:http";
import type { RawSessionLogCleanupConfig, RawSessionLogCleanupSummary } from "../raw-session-log-cleanup.js";
import type { PrepareProjectStartupOptions, StartupProject } from "../project-startup.js";

/** Creates the runtime metadata store and reports only an enabled SQLite backend. */
export async function createRuntimeMetadataStore<TStore extends {
  databasePath?: string | null;
  enabled: boolean;
}>(input: {
  create(env: NodeJS.ProcessEnv): TStore | Promise<TStore>;
  env: NodeJS.ProcessEnv;
  log(message: string): void;
}): Promise<TStore> {
  const store = await input.create(input.env);
  if (store.enabled) input.log(`Hepha metadata store: SQLite (${store.databasePath})`);
  return store;
}

/** Best-effort startup preparation: one project failure cannot block the host. */
export async function prepareRegisteredProjects(input: {
  options: PrepareProjectStartupOptions;
  prepare(project: StartupProject, options: PrepareProjectStartupOptions): Promise<void>;
  projects: readonly StartupProject[];
  report(project: StartupProject, error: unknown): void;
}): Promise<void> {
  for (const project of input.projects) {
    try {
      await input.prepare(project, input.options);
    } catch (error) {
      input.report(project, error);
    }
  }
}

/** Starts the HTTP listener and process-wide cleanup/preparation services. */
export function startOrchestratorHost(input: {
  cleanupConfig: RawSessionLogCleanupConfig;
  listener: RequestListener;
  log(message: string): void;
  port: number;
  prepareProjects(): Promise<void>;
  reportCleanup(summary: RawSessionLogCleanupSummary): void;
  sessionDir: string;
  startCleanup(options: RawSessionLogCleanupConfig & {
    report(summary: RawSessionLogCleanupSummary): void;
    sessionDir: string;
  }): { stop(): void };
  workspaceRoot: string;
}) {
  const server = createServer(input.listener);
  server.listen(input.port, "127.0.0.1", () => {
    input.log(`Hepha orchestrator listening on http://127.0.0.1:${input.port}`);
    input.log(`Agent working directory: ${input.workspaceRoot}`);
    input.startCleanup({
      ...input.cleanupConfig,
      report: input.reportCleanup,
      sessionDir: input.sessionDir,
    });
    void input.prepareProjects();
  });
  return server;
}
