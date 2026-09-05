import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ProviderConnectionRecord, RouteIdentityV1 } from "@hepha/shared";

const OPERATIONAL_ENVIRONMENT_KEYS = [
  "CI", "COMSPEC", "HEPHA_PI_COMMAND", "HOME", "LANG", "LC_ALL", "NO_COLOR", "NODE_OPTIONS", "PATH", "PATHEXT",
  "PI_OFFLINE", "PI_SKIP_VERSION_CHECK", "PI_TELEMETRY", "SystemRoot", "TEMP", "TERM", "TMP",
  "TMPDIR", "USERPROFILE", "WINDIR",
] as const;
const SECRET_ENVIRONMENT_KEY = "HEPHA_PI_PROVIDER_SECRET";

export interface PreparedIsolatedPiWorkerContext {
  readonly configurationRoot: string;
  readonly sessionDirectory: string;
  readonly providerId: string;
  readonly secretEnvironmentKey: typeof SECRET_ENVIRONMENT_KEY | null;
  buildEnvironment(secretValue?: string): NodeJS.ProcessEnv;
  cleanup(): Promise<boolean>;
}

export interface IsolatedPiWorkerContextDependencies {
  readonly baseEnvironment: NodeJS.ProcessEnv | (() => NodeJS.ProcessEnv);
  readonly createUniqueId: () => string;
  readonly runtimeRoot: string;
  readonly fileSystem?: {
    readonly mkdir: typeof mkdir;
    readonly rm: typeof rm;
    readonly writeFile: typeof writeFile;
  };
}

/** Closed preparation signal that distinguishes whether a partial root was removed. */
export class IsolatedPiWorkerPreparationError extends Error {
  readonly cleanupSucceeded: boolean;

  constructor(cleanupSucceeded: boolean) {
    super(cleanupSucceeded ? "RUNTIME_CONTEXT_PREPARATION_FAILED" : "RUNTIME_CLEANUP_FAILED");
    this.name = "IsolatedPiWorkerPreparationError";
    this.cleanupSucceeded = cleanupSucceeded;
  }
}

/** Creates and removes one secret-safe Pi configuration and session boundary per attempt. */
export class IsolatedPiWorkerContext {
  constructor(private readonly dependencies: IsolatedPiWorkerContextDependencies) {}

  async prepare(input: {
    readonly attemptId: string;
    readonly connection: ProviderConnectionRecord;
    readonly providerId: string;
    readonly route: RouteIdentityV1;
  }): Promise<PreparedIsolatedPiWorkerContext> {
    const root = resolve(
      this.dependencies.runtimeRoot,
      `${safeComponent(input.attemptId)}-${safeComponent(this.dependencies.createUniqueId())}`,
    );
    const sessionDirectory = resolve(root, "sessions");
    const injected = input.connection.kind !== "pi_session";
    const fileSystem = this.dependencies.fileSystem ?? { mkdir, rm, writeFile };
    try {
      await fileSystem.mkdir(sessionDirectory, { recursive: true });
      const providerConfig = input.connection.kind === "custom"
        ? {
            baseUrl: input.connection.endpointUrl,
            api: "openai-completions",
            apiKey: `$${SECRET_ENVIRONMENT_KEY}`,
            models: [{ id: input.route.modelId }],
          }
        : injected
          ? { apiKey: `$${SECRET_ENVIRONMENT_KEY}` }
          : undefined;

      if (providerConfig) {
        await fileSystem.writeFile(resolve(root, "models.json"), `${JSON.stringify({ providers: { [input.providerId]: providerConfig } }, null, 2)}\n`, {
          encoding: "utf8",
          mode: 0o600,
        });
      }
    } catch {
      let cleanupSucceeded = true;
      try {
        await fileSystem.rm(root, { recursive: true, force: true });
      } catch {
        cleanupSucceeded = false;
      }
      throw new IsolatedPiWorkerPreparationError(cleanupSucceeded);
    }

    let cleaned = false;
    return {
      configurationRoot: root,
      sessionDirectory,
      providerId: input.providerId,
      secretEnvironmentKey: injected ? SECRET_ENVIRONMENT_KEY : null,
      buildEnvironment: (secretValue?: string) => {
        const environment: NodeJS.ProcessEnv = {};
        const baseEnvironment = typeof this.dependencies.baseEnvironment === "function"
          ? this.dependencies.baseEnvironment()
          : this.dependencies.baseEnvironment;
        for (const key of OPERATIONAL_ENVIRONMENT_KEYS) {
          const value = baseEnvironment[key];
          if (value !== undefined) environment[key] = value;
        }
        if (injected) {
          environment.PI_CODING_AGENT_DIR = root;
        } else {
          const hostConfigurationRoot = baseEnvironment.PI_CODING_AGENT_DIR;
          if (typeof hostConfigurationRoot === "string" && hostConfigurationRoot.trim().length > 0) {
            environment.PI_CODING_AGENT_DIR = hostConfigurationRoot;
          }
        }
        environment.PI_CODING_AGENT_SESSION_DIR = sessionDirectory;
        environment.PI_SKIP_VERSION_CHECK ??= "1";
        environment.PI_TELEMETRY ??= "0";
        if (injected) {
          if (typeof secretValue !== "string" || secretValue.length === 0) {
            throw new Error("RUNTIME_AUTH_UNAVAILABLE");
          }
          environment[SECRET_ENVIRONMENT_KEY] = secretValue;
        } else if (secretValue !== undefined) {
          throw new Error("RUNTIME_INVALID_CONTEXT");
        }
        return environment;
      },
      cleanup: async () => {
        if (cleaned) return true;
        try {
          await fileSystem.rm(root, { recursive: true, force: true });
          cleaned = true;
          return true;
        } catch {
          return false;
        }
      },
    };
  }
}

function safeComponent(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.slice(0, 96) || "attempt";
}
