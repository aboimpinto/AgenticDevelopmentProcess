export interface HealthPiInvocation {
  readonly command: string;
}

export interface OrchestratorHealthDependencies {
  authFileExists(path: string): boolean;
  createPiEnvironment(): NodeJS.ProcessEnv;
  metadataDatabasePath: string | null;
  metadataStore: string;
  port: number;
  renderPiInvocation(invocation: HealthPiInvocation): string;
  resolveAuthFile(): string;
  resolvePi(env: NodeJS.ProcessEnv): {
    readonly diagnostics: readonly string[];
    readonly invocation: HealthPiInvocation | null;
  };
  sessionDir: string;
  workspaceRoot: string;
}

export function buildOrchestratorHealth(dependencies: OrchestratorHealthDependencies) {
  const env = dependencies.createPiEnvironment();
  const resolution = dependencies.resolvePi(env);
  return {
    env: {
      DEEPSEEK_API_KEY: Boolean(env.DEEPSEEK_API_KEY),
      HEPHA_DATABASE_PATH: Boolean(env.HEPHA_DATABASE_PATH),
      OPENAI_API_KEY: Boolean(env.OPENAI_API_KEY),
      PI_CHATGPT_AUTH: dependencies.authFileExists(dependencies.resolveAuthFile()),
    },
    metadataDatabasePath: dependencies.metadataDatabasePath,
    metadataStore: dependencies.metadataStore,
    ok: true,
    piCommand: resolution.invocation
      ? dependencies.renderPiInvocation(resolution.invocation)
      : null,
    piCommandDiagnostics: resolution.diagnostics,
    piCommandStatus: resolution.invocation ? "available" as const : "missing" as const,
    port: dependencies.port,
    sessionDir: dependencies.sessionDir,
    workspaceRoot: dependencies.workspaceRoot,
  };
}
