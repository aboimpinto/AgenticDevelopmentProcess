import type { MemoryBankStateFolder } from "../work-items/identity-contracts.js";

export interface ProjectSummary {
  id: string;
  name: string;
  rootPath: string;
  memoryBankPath: string;
  memoryBankRelativePath: string;
  defaultBranch: string;
  detectedStack: string[];
  featuresRootExists: boolean;
  needsInitialization: boolean;
  counts: Record<MemoryBankStateFolder, number>;
  createdAt: string;
  updatedAt: string;
  /** Exact user-entered project path, preserved for display and troubleshooting. */
  originalRootPathInput?: string;
  /** Exact user-entered MemoryBank path, preserved for display and troubleshooting. */
  originalMemoryBankPathInput?: string;
}

export interface CreateProjectInput {
  memoryBankPath: string;
  name: string;
  rootPath: string;
}

export interface ProjectListResponse {
  projects: ProjectSummary[];
}

export interface ProjectResponse {
  project: ProjectSummary;
}

export interface InitializeProjectResponse {
  createdDirectories: string[];
  createdFiles: string[];
  project: ProjectSummary;
}
