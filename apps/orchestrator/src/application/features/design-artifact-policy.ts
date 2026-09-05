import { resolve } from "node:path";
import { designArtifactDefinitions, type WorkItemCard } from "@hepha/shared";

const requiredDesignArtifacts = designArtifactDefinitions;

interface DesignArtifactPolicyDependencies {
  exists: (path: string) => boolean;
  readSnippet: (path: string, maxCharacters: number) => string;
}

export class DesignArtifactPolicy {
  constructor(private readonly dependencies: DesignArtifactPolicyDependencies) {}

  assertComplete(feature: Pick<WorkItemCard, "folderPath">): void {
    const missingFiles = requiredDesignArtifacts.filter(({ fileName }) => {
      const path = resolve(feature.folderPath, fileName);
      return !this.dependencies.exists(path)
        || this.dependencies.readSnippet(path, 1_000).trim().length === 0;
    }).map(({ fileName }) => fileName);
    if (missingFiles.length > 0) {
      throw new Error(`Design Feature skill did not create required design artifacts: ${missingFiles.join(", ")}.`);
    }
  }
}
