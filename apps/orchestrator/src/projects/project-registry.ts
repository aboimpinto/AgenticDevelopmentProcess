import { randomUUID } from "node:crypto";
import type { CreateProjectInput } from "@hepha/shared";
import { resolveAndValidatePaths } from "../project-registration.js";
import { loadStoredProjects, saveStoredProjects } from "./project-store.js";
import type { StoredProject } from "./stored-project.js";

export interface ProjectRegistryOptions {
  basePath: string;
  createId?: () => string;
  now?: () => string;
  resolveStorePath: () => string;
}

export class ProjectRegistry {
  readonly #options: Required<Pick<ProjectRegistryOptions, "createId" | "now">>
    & Pick<ProjectRegistryOptions, "basePath" | "resolveStorePath">;
  readonly #projects: Map<string, StoredProject>;

  constructor(options: ProjectRegistryOptions) {
    this.#options = {
      ...options,
      createId: options.createId ?? (() => `project-${randomUUID()}`),
      now: options.now ?? (() => new Date().toISOString()),
    };
    this.#projects = new Map(
      loadStoredProjects(options.resolveStorePath()).map((project) => [project.id, project]),
    );
  }

  get(projectId: string): StoredProject | undefined {
    return this.#projects.get(projectId);
  }

  list(): StoredProject[] {
    return [...this.#projects.values()];
  }

  register(input: CreateProjectInput): StoredProject {
    const name = input.name?.trim();
    if (!name) {
      throw new Error("Project name is required");
    }

    const paths = resolveAndValidatePaths(input, { basePath: this.#options.basePath });
    const existingProject = this.list().find(
      (project) => project.rootPath.toLowerCase() === paths.canonicalRootPath.toLowerCase(),
    );
    const now = this.#options.now();
    const project: StoredProject = {
      id: existingProject?.id ?? this.#options.createId(),
      createdAt: existingProject?.createdAt ?? now,
      memoryBankPath: paths.canonicalMemoryBankPath,
      name,
      rootPath: paths.canonicalRootPath,
      updatedAt: now,
      originalRootPathInput: paths.originalRootPathInput,
      originalMemoryBankPathInput: paths.originalMemoryBankPathInput,
    };

    this.#projects.set(project.id, project);
    saveStoredProjects(this.#options.resolveStorePath(), this.#projects.values());
    return project;
  }
}
