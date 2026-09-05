export const featureRecipeOperations = [
  "designFeature",
  "refineFeature",
  "startImplementing",
  "continueImplementing",
  "completeFeature",
] as const;

export type FeatureRecipeOperation = typeof featureRecipeOperations[number];
export type FeatureRecipeSource = "native-hepha" | "devcycle-mcp";

const operationEnvironmentKeys: Readonly<Record<FeatureRecipeOperation, string>> = Object.freeze({
  designFeature: "HEPHA_DESIGN_FEATURE_RECIPE_SOURCE",
  refineFeature: "HEPHA_REFINE_FEATURE_RECIPE_SOURCE",
  startImplementing: "HEPHA_START_IMPLEMENTING_RECIPE_SOURCE",
  continueImplementing: "HEPHA_CONTINUE_IMPLEMENTING_RECIPE_SOURCE",
  completeFeature: "HEPHA_COMPLETE_FEATURE_RECIPE_SOURCE",
});

export interface FeatureRecipeSourcePolicy {
  readonly usesDevCycleMcp: boolean;
  sourceFor(operation: FeatureRecipeOperation): FeatureRecipeSource;
}

/** Validates the recipe authority once so action dispatch can trust an immutable source map. */
export function createFeatureRecipeSourcePolicy(environment: NodeJS.ProcessEnv): FeatureRecipeSourcePolicy {
  const defaultSource = parseRecipeSource(environment.HEPHA_FEATURE_RECIPE_SOURCE, "native-hepha");
  const sources = Object.freeze(Object.fromEntries(featureRecipeOperations.map((operation) => [
    operation,
    parseRecipeSource(environment[operationEnvironmentKeys[operation]], defaultSource),
  ])) as Record<FeatureRecipeOperation, FeatureRecipeSource>);

  return Object.freeze({
    usesDevCycleMcp: Object.values(sources).includes("devcycle-mcp"),
    sourceFor: (operation: FeatureRecipeOperation) => sources[operation],
  });
}

function parseRecipeSource(value: string | undefined, fallback: FeatureRecipeSource): FeatureRecipeSource {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "native-hepha" || normalized === "devcycle-mcp") return normalized;
  throw new Error(`FEATURE_RECIPE_SOURCE_INVALID: ${JSON.stringify(value)}`);
}
