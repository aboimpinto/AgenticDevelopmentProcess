import type { CardMetadataStore } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { StoredProject } from "../../projects/stored-project.js";

export interface ManualTestArtifactInput {
  readonly cardId: string;
  readonly download: boolean;
  readonly format: "markdown" | "pdf";
  readonly projectId: string;
}

export interface ResolvedManualTestArtifact {
  readonly disposition: "attachment" | "inline";
  readonly fileName: string;
  readonly mimeType: string;
  readonly path: string;
}

export interface ManualTestArtifactDependencies {
  readonly createCardKey: (kind: WorkItemCard["kind"], externalId: string) => string;
  readonly findProject: (projectId: string) => StoredProject | null | undefined;
  readonly metadataStore: Pick<CardMetadataStore, "getCurrentManualTestPack">;
  readonly scanProject: (project: StoredProject) => Promise<WorkItemCard[]>;
}

export class ManualTestArtifactResolver {
  readonly #dependencies: ManualTestArtifactDependencies;

  constructor(dependencies: ManualTestArtifactDependencies) {
    this.#dependencies = dependencies;
  }

  async resolve(input: ManualTestArtifactInput): Promise<ResolvedManualTestArtifact | null> {
    const project = this.#dependencies.findProject(input.projectId);
    if (!project) return null;
    const feature = (await this.#dependencies.scanProject(project)).find(
      (candidate) => candidate.id === input.cardId && candidate.kind === "feature",
    );
    if (!feature) return null;

    const pack = await this.#dependencies.metadataStore.getCurrentManualTestPack(
      project.id,
      this.#dependencies.createCardKey(feature.kind, feature.externalId),
    );
    const hasRequestedArtifact = input.format === "pdf" ? Boolean(pack?.pdfPath) : Boolean(pack?.markdownPath);
    if (!pack || !hasRequestedArtifact) return null;

    try {
      const artifactFile = input.format === "pdf" ? "ManualTestVerification.pdf" : "ManualTestVerification.md";
      const artifactPath = realpathSync(resolve(
        feature.folderPath,
        "manual-test-verification",
        "archive",
        pack.version,
        artifactFile,
      ));
      const artifactRoot = realpathSync(resolve(feature.folderPath, "manual-test-verification"));
      if (!isPathInsideDirectory(artifactPath, artifactRoot) || !statSync(artifactPath).isFile()) return null;

      const version = pack.version.replace(/[^a-zA-Z0-9._-]/g, "-");
      const extension = input.format === "pdf" ? "pdf" : "md";
      return {
        disposition: input.download ? "attachment" : "inline",
        fileName: `ManualTestVerification-${version}.${extension}`,
        mimeType: input.format === "pdf" ? "application/pdf" : "text/markdown; charset=utf-8",
        path: artifactPath,
      };
    } catch {
      return null;
    }
  }
}

function isPathInsideDirectory(path: string, directory: string): boolean {
  const relativePath = relative(directory, path);
  return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}
