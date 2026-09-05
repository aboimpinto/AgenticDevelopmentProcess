export interface StoredProject {
  id: string;
  createdAt: string;
  memoryBankPath: string;
  name: string;
  rootPath: string;
  updatedAt: string;
  /** Exact user-entered project path, preserved for display and troubleshooting. */
  originalRootPathInput?: string;
  /** Exact user-entered MemoryBank path, preserved for display and troubleshooting. */
  originalMemoryBankPathInput?: string;
}

export function isStoredProject(value: unknown): value is StoredProject {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const requiredFields = [
    "id",
    "createdAt",
    "memoryBankPath",
    "name",
    "rootPath",
    "updatedAt",
  ] as const;

  if (requiredFields.some((field) => typeof candidate[field] !== "string")) {
    return false;
  }

  return optionalString(candidate.originalRootPathInput)
    && optionalString(candidate.originalMemoryBankPathInput);
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}
