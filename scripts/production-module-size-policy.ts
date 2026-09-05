import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

export interface ProductionModuleMeasurement {
  path: string;
  lines: number;
}

const PRODUCTION_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const TEST_FILE_PATTERN = /\.(?:spec|test)\.[cm]?[jt]sx?$/;
const TEST_SUPPORT_PATH_PATTERN = /(?:^|\/)(?:__fixtures__|__tests__|fixtures|test|test-support|tests)(?:\/|$)/;

export function isProductionModuleFile(path: string): boolean {
  const normalizedPath = path.replaceAll("\\", "/");
  return PRODUCTION_EXTENSIONS.has(extname(normalizedPath))
    && !TEST_FILE_PATTERN.test(normalizedPath)
    && !TEST_SUPPORT_PATH_PATTERN.test(normalizedPath)
    && !normalizedPath.endsWith(".d.ts");
}

export function measureProductionModules(workspaceRoot: string): ProductionModuleMeasurement[] {
  const measurements: ProductionModuleMeasurement[] = [];

  for (const packageArea of ["apps", "packages"]) {
    const areaPath = join(workspaceRoot, packageArea);
    for (const packageEntry of readdirSync(areaPath, { withFileTypes: true })) {
      if (!packageEntry.isDirectory()) continue;
      const sourceRoot = join(areaPath, packageEntry.name, "src");
      if (!existsSync(sourceRoot)) continue;
      collectSourceMeasurements(workspaceRoot, sourceRoot, measurements);
    }
  }

  return measurements.sort((left, right) => left.path.localeCompare(right.path));
}

export function findProductionModuleSizeViolations(
  measurements: readonly ProductionModuleMeasurement[],
  maximumLines = 1_000,
): ProductionModuleMeasurement[] {
  return measurements
    .filter((measurement) => measurement.lines > maximumLines)
    .sort((left, right) => right.lines - left.lines || left.path.localeCompare(right.path));
}

function collectSourceMeasurements(
  workspaceRoot: string,
  directory: string,
  measurements: ProductionModuleMeasurement[],
): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSourceMeasurements(workspaceRoot, absolutePath, measurements);
      continue;
    }
    if (!entry.isFile() || !isProductionModuleFile(absolutePath)) continue;
    const source = readFileSync(absolutePath, "utf8");
    measurements.push({
      path: relative(workspaceRoot, absolutePath).replaceAll("\\", "/"),
      lines: source.length === 0 ? 0 : (source.match(/\n/g)?.length ?? 0) + (source.endsWith("\n") ? 0 : 1),
    });
  }
}
