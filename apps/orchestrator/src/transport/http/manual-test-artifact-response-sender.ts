import { readFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import type {
  ManualTestArtifactInput,
  ManualTestArtifactResolver,
  ResolvedManualTestArtifact,
} from "../../application/manual-tests/manual-test-artifact-resolver.js";
import { sendJson } from "./send-json.js";

export interface ManualTestArtifactResponseSenderDependencies {
  readFile(path: string): Buffer;
  resolveArtifact(input: ManualTestArtifactInput): Promise<ResolvedManualTestArtifact | null>;
}

/** Writes one resolved manual-test artifact with safe response headers and a uniform not-found boundary. */
export class ManualTestArtifactResponseSender {
  constructor(private readonly dependencies: ManualTestArtifactResponseSenderDependencies) {}

  async send(response: ServerResponse, input: ManualTestArtifactInput): Promise<void> {
    const artifact = await this.dependencies.resolveArtifact(input);
    if (!artifact) {
      sendJson(response, 404, { error: "Artifact not found." });
      return;
    }
    try {
      const content = this.dependencies.readFile(artifact.path);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Disposition": `${artifact.disposition}; filename="${artifact.fileName}"`,
        "Content-Length": content.length,
        "Content-Type": artifact.mimeType,
        "X-Content-Type-Options": "nosniff",
      });
      response.end(content);
    } catch {
      sendJson(response, 404, { error: "Artifact not found." });
    }
  }
}

export function createManualTestArtifactResponseSender(resolver: Pick<ManualTestArtifactResolver, "resolve">) {
  return new ManualTestArtifactResponseSender({
    readFile: readFileSync,
    resolveArtifact: (input) => resolver.resolve(input),
  });
}
