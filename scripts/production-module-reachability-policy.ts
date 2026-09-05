import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import ts from "typescript";

const PRODUCTION_EXTENSIONS = [".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"] as const;
const TEST_FILE_PATTERN = /\.(?:spec|test)\.[cm]?[jt]sx?$/;
const TEST_SUPPORT_PATH_PATTERN = /(?:^|\/)(?:__fixtures__|__tests__|fixtures|test|test-support|tests)(?:\/|$)/;
const CONFIG_FILE_PATTERN = /\.config\.[cm]?[jt]sx?$/;

export interface ProductionModuleReachability {
  dependencies: Record<string, string[]>;
  modules: string[];
  roots: string[];
  unreachable: string[];
}

export function isReachabilityProductionFile(path: string): boolean {
  const normalizedPath = path.replaceAll("\\", "/");
  return PRODUCTION_EXTENSIONS.includes(extname(normalizedPath) as (typeof PRODUCTION_EXTENSIONS)[number])
    && !TEST_FILE_PATTERN.test(normalizedPath)
    && !TEST_SUPPORT_PATH_PATTERN.test(normalizedPath)
    && !normalizedPath.endsWith(".d.ts");
}

export function discoverProductionModules(workspaceRoot: string): string[] {
  const modules = new Set<string>();

  for (const area of ["apps", "packages"]) {
    const areaRoot = join(workspaceRoot, area);
    if (!existsSync(areaRoot)) continue;
    for (const entry of readdirSync(areaRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      collectProductionFiles(join(areaRoot, entry.name, "src"), modules);
      if (area === "apps") {
        const appRoot = join(areaRoot, entry.name);
        for (const candidate of readDirectoryFiles(appRoot)) {
          if (CONFIG_FILE_PATTERN.test(candidate) && isReachabilityProductionFile(candidate)) {
            modules.add(resolve(candidate));
          }
        }
      }
    }
  }

  collectProductionFiles(join(workspaceRoot, "scripts"), modules);
  return [...modules].map((path) => toWorkspacePath(workspaceRoot, path)).sort();
}

export function discoverProductionRoots(
  workspaceRoot: string,
  modules = discoverProductionModules(workspaceRoot),
): string[] {
  return modules.filter((path) => {
    if (/^scripts\/[^/]+$/.test(path)) return true;
    if (/^apps\/[^/]+\/[^/]+\.config\.[cm]?[jt]sx?$/.test(path)) return true;
    return /^(?:apps|packages)\/[^/]+\/src\/(?:index\.[cm]?[jt]sx?|main\.[cm]?[jt]sx?)$/.test(path);
  }).sort();
}

export function extractModuleSpecifiers(path: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(path),
  );
  const specifiers = new Set<string>();
  const addLiteral = (node: ts.Node | undefined) => {
    if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
      specifiers.add(node.text);
    }
  };
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      addLiteral(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
    ) {
      addLiteral(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node)
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      addLiteral(node.arguments[0]);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      addLiteral(node.argument.literal);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...specifiers].sort();
}

export function resolveProductionDependency({
  modulePath,
  modules,
  packageSourceRoots,
  specifier,
  workspaceRoot,
}: {
  modulePath: string;
  modules: ReadonlySet<string>;
  packageSourceRoots: ReadonlyMap<string, string>;
  specifier: string;
  workspaceRoot: string;
}): string | null {
  let unresolvedBase: string;
  if (specifier.startsWith(".")) {
    unresolvedBase = resolve(workspaceRoot, dirname(modulePath), specifier);
  } else {
    const packageMatch = [...packageSourceRoots.keys()]
      .sort((left, right) => right.length - left.length)
      .find((name) => specifier === name || specifier.startsWith(`${name}/`));
    if (!packageMatch) return null;
    const subpath = specifier === packageMatch ? "index" : specifier.slice(packageMatch.length + 1);
    unresolvedBase = resolve(workspaceRoot, packageSourceRoots.get(packageMatch)!, subpath);
  }

  for (const candidate of dependencyCandidates(unresolvedBase)) {
    const workspacePath = toWorkspacePath(workspaceRoot, candidate);
    if (modules.has(workspacePath)) return workspacePath;
  }
  return null;
}

export function analyzeProductionModuleReachability(workspaceRoot: string): ProductionModuleReachability {
  const modules = discoverProductionModules(workspaceRoot);
  const roots = discoverProductionRoots(workspaceRoot, modules);
  const moduleSet = new Set(modules);
  const packageSourceRoots = discoverPackageSourceRoots(workspaceRoot);
  const dependencies: Record<string, string[]> = {};

  for (const modulePath of modules) {
    const source = readFileSync(resolve(workspaceRoot, modulePath), "utf8");
    dependencies[modulePath] = extractModuleSpecifiers(modulePath, source)
      .map((specifier) => resolveProductionDependency({
        modulePath,
        modules: moduleSet,
        packageSourceRoots,
        specifier,
        workspaceRoot,
      }))
      .filter((dependency): dependency is string => dependency !== null)
      .filter((dependency, index, values) => values.indexOf(dependency) === index)
      .sort();
  }

  const reachable = new Set<string>();
  const pending = [...roots];
  while (pending.length > 0) {
    const modulePath = pending.pop()!;
    if (reachable.has(modulePath)) continue;
    reachable.add(modulePath);
    pending.push(...(dependencies[modulePath] ?? []));
  }

  return {
    dependencies,
    modules,
    roots,
    unreachable: modules.filter((modulePath) => !reachable.has(modulePath)),
  };
}

export function findUnreachableProductionModules(workspaceRoot: string): string[] {
  return analyzeProductionModuleReachability(workspaceRoot).unreachable;
}

function collectProductionFiles(directory: string, modules: Set<string>): void {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectProductionFiles(path, modules);
    } else if (entry.isFile() && isReachabilityProductionFile(path)) {
      modules.add(resolve(path));
    }
  }
}

function readDirectoryFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(directory, entry.name));
}

function discoverPackageSourceRoots(workspaceRoot: string): Map<string, string> {
  const roots = new Map<string, string>();
  for (const area of ["apps", "packages"]) {
    const areaRoot = join(workspaceRoot, area);
    if (!existsSync(areaRoot)) continue;
    for (const entry of readdirSync(areaRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packageRoot = join(areaRoot, entry.name);
      const manifestPath = join(packageRoot, "package.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { name?: unknown };
      if (typeof manifest.name === "string") {
        roots.set(manifest.name, toWorkspacePath(workspaceRoot, join(packageRoot, "src")));
      }
    }
  }
  return roots;
}

function dependencyCandidates(unresolvedBase: string): string[] {
  const extension = extname(unresolvedBase);
  const base = PRODUCTION_EXTENSIONS.includes(extension as (typeof PRODUCTION_EXTENSIONS)[number])
    ? unresolvedBase.slice(0, -extension.length)
    : unresolvedBase;
  return [
    ...(extension ? [unresolvedBase] : []),
    ...PRODUCTION_EXTENSIONS.map((candidateExtension) => `${base}${candidateExtension}`),
    ...PRODUCTION_EXTENSIONS.map((candidateExtension) => join(base, `index${candidateExtension}`)),
  ].map((candidate) => resolve(candidate));
}

function scriptKindFor(path: string): ts.ScriptKind {
  if (/\.tsx$/i.test(path)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(path)) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/i.test(path)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function toWorkspacePath(workspaceRoot: string, path: string): string {
  return relative(workspaceRoot, resolve(path)).replaceAll("\\", "/");
}
