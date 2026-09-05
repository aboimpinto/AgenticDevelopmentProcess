import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "..");
const shellPath = resolve(sourceRoot, "app-shell.tsx");
const shell = readFileSync(shellPath, "utf8");
const shellView = readFileSync(resolve(import.meta.dirname, "app-shell-view.tsx"), "utf8");
const specification = readFileSync(
  resolve(import.meta.dirname, "generic-app-shell-reachability.feature"),
  "utf8",
);

function findUnreachableLocalFunctions(source: string): string[] {
  const sourceFile = ts.createSourceFile(
    shellPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declarations = new Map<string, ts.FunctionDeclaration>();

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, statement);
    }
  }

  const references = new Map<string, Set<string>>();

  for (const [name, declaration] of declarations) {
    const referencedFunctions = new Set<string>();
    const visit = (node: ts.Node) => {
      if (
        ts.isIdentifier(node) &&
        node !== declaration.name &&
        declarations.has(node.text)
      ) {
        referencedFunctions.add(node.text);
      }
      ts.forEachChild(node, visit);
    };

    visit(declaration);
    references.set(name, referencedFunctions);
  }

  const roots = [...declarations]
    .filter(([, declaration]) =>
      declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
    )
    .map(([name]) => name);
  const reachable = new Set<string>();
  const visitFunction = (name: string) => {
    if (reachable.has(name)) return;
    reachable.add(name);
    references.get(name)?.forEach(visitFunction);
  };

  roots.forEach(visitFunction);
  return [...declarations.keys()].filter((name) => !reachable.has(name)).sort();
}

function findUnreachableProductionModules(): string[] {
  const modules: string[] = [];
  const visitDirectory = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "test-support") continue;
        visitDirectory(path);
      } else if (
        entry.isFile()
        && /\.tsx?$/.test(entry.name)
        && !/\.(?:spec|test)\.tsx?$/.test(entry.name)
        && !entry.name.endsWith(".d.ts")
      ) {
        modules.push(path);
      }
    }
  };
  visitDirectory(sourceRoot);

  const moduleSet = new Set(modules);
  const dependencies = new Map(modules.map((path) => [path, new Set<string>()]));
  const resolveImport = (owner: string, specifier: string): string | null => {
    if (!specifier.startsWith(".")) return null;
    const raw = resolve(dirname(owner), specifier).replace(/\.jsx?$/, "");
    return [
      `${raw}.ts`,
      `${raw}.tsx`,
      join(raw, "index.ts"),
      join(raw, "index.tsx"),
    ].find((candidate) => moduleSet.has(candidate)) ?? null;
  };

  for (const path of modules) {
    const sourceFile = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visitNode = (node: ts.Node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        && node.moduleSpecifier
        && ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const dependency = resolveImport(path, node.moduleSpecifier.text);
        if (dependency) dependencies.get(path)?.add(dependency);
      }
      ts.forEachChild(node, visitNode);
    };
    visitNode(sourceFile);
  }

  const reachable = new Set<string>();
  const pending = [resolve(sourceRoot, "main.tsx")];
  while (pending.length > 0) {
    const path = pending.pop()!;
    if (reachable.has(path)) continue;
    reachable.add(path);
    dependencies.get(path)?.forEach((dependency) => pending.push(dependency));
  }

  return modules
    .filter((path) => !reachable.has(path))
    .map((path) => relative(sourceRoot, path).replaceAll("\\", "/"))
    .sort();
}

describe("generic application-shell reachability Gherkin integration", () => {
  it("specifies five product-blind composition behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(5);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("keeps every local function reachable from an exported shell surface", () => {
    expect(findUnreachableLocalFunctions(shell)).toEqual([]);
  });

  it("keeps every web production module reachable from the browser entry point", () => {
    expect(findUnreachableProductionModules()).toEqual([]);
  });

  it("retains bounded production replacements and removes superseded locals", () => {
    expect(shell).toContain('from "./composition/app-shell-view.js"');
    expect(shell).toContain('from "./deep-dive/use-deep-dive-controller.js"');
    expect(shell).toContain('from "./workspace/use-dashboard-live-activity.js"');
    expect(shell).toContain('from "./workspace/use-workspace-controller.js"');
    expect(shell).toContain('from "./composition/use-app-navigation.js"');
    expect(shell).toContain('from "./workflow/use-feature-actions.js"');
    expect(shell).toContain('from "./manual-tests/use-manual-test-actions.js"');
    expect(shell).toContain('from "./submissions/use-epic-submission.js"');
    expect(shell).toContain('from "./submissions/use-feature-submission.js"');
    expect(shell).toContain('from "./missing-features/use-missing-feature-preview.js"');
    expect(shell).toContain('from "./relationships/use-feature-epic-link.js"');
    expect(shell).toContain("<AppShellView");
    expect(shellView).toContain('from "../details/detail-blade-router.js"');
    expect(shellView).toContain('from "../deep-dive/deep-dive-overlay.js"');
    expect(shellView).toContain("<DetailBlade");
    expect(shellView).toContain("<DeepDiveOverlay");
    expect(shell).not.toMatch(
      /function (?:DeepDiveOverlay|DetailBlade|FeatureDeliveryPanel|EpicRefinementPanel|LinkEpicPanel|WorkflowConsole|FeatureWorkflowHistory|ImplementationEvidencePanel|PhasePanel|getValidationBadges)\b/,
    );
    expect(shellView).not.toContain("<WorkItemDetailBlade");
    expect(shell).not.toContain("/api/deep-dive-sessions");
    expect(shell).not.toContain("setDeepDiveSession");
    expect(shell).not.toMatch(/\/api\/(?:start-implementing|continue-implementing|complete-feature|cancel-feature-workflow|feature-findings)/);
    expect(shell).not.toContain("/api/manual-test-verification");
    expect(shell).not.toMatch(/\/api\/(?:submit-epic|submit-feature|epic-refinements)/);
    expect(shell).not.toContain("/api/missing-features");
    expect(shell).not.toContain("/link-epic");
    expect(shell).not.toMatch(/\b(?:apiGet|apiPost|getErrorMessage)\b/);
    expect(shell).not.toContain('window.addEventListener("keydown"');
    expect(shell).not.toMatch(/function (?:selectItem|selectProject|selectPrimaryView|openProjectBlade)\b/);
  });
});
