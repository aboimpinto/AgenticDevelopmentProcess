import { featureVerificationTargets } from "./feature-verification-targets.js";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import ts from "typescript";
import type { CoverageExecutionRequirement } from "@hepha/shared";
export interface ConfiguredVerificationTarget { id: string; command: string; testPaths: string[]; configurationFiles: string[] }
export interface VerificationTargetCatalog { targets: ConfiguredVerificationTarget[]; diagnostics: string[]; fingerprint: string }
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const inside = (root: string, path: string) => { const part = relative(root, path); return !isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`); };

export function assertConfiguredExecutionsCurrent(root: string, requirements: readonly CoverageExecutionRequirement[], folder?: string) {
  if (!requirements.some(value => value.targetId)) return;
  const catalog = discoverVerificationTargets(root, folder);
  for (const requirement of requirements.filter(value => value.targetId)) {
    const target = catalog.targets.find(target => target.id === requirement.targetId);
    if (!target || requirement.configurationFingerprint !== catalog.fingerprint || target.command !== requirement.command || JSON.stringify(target.testPaths) !== JSON.stringify(requirement.testPaths))
      throw new Error("Test configuration changed or the execution target is invalid. Refresh Completion Readiness before running verification.");
  }
}

/** Static configuration discovery only. Never imports project code, runs a command,
 * reads environment values, or treats configured/discovered tests as executed proof. */
export function discoverVerificationTargets(root: string, folder?: string): VerificationTargetCatalog {
  const declared = folder ? featureVerificationTargets(root, folder) : null;
  if (declared) return declared;
  const targets: ConfiguredVerificationTarget[] = [], diagnostics: string[] = [];
  const finish = () => ({ targets, diagnostics, fingerprint: hash(["configured-targets/v1", targets, diagnostics]) });
  if (!existsSync(resolve(root, "package.json"))) return finish();
  const canonical = realpathSync(root);
  const read = (path: string) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 200_000 || !inside(canonical, realpathSync(path))) throw new Error("unsafe configuration");
    return readFileSync(path, "utf8");
  };
  try {
    const scripts = JSON.parse(read(resolve(root, "package.json"))).scripts;
    if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) return finish();
    const entries = Object.entries(scripts).filter(([, command]) => typeof command === "string" && /\bplaywright\s+test\b/.test(command));
    if (entries.length > 40) throw new Error("too many test scripts");
    for (const [name, command] of entries) {
      if (!/^[\w:-]{1,100}$/.test(name)) { diagnostics.push("A test script has an unsupported name; inspect package.json."); continue; }
      try {
        // Unsupported shell composition is a setup question, not shell authority.
        const match = /^(?:npx\s+)?playwright\s+test(?:\s+--config(?:=|\s+)([\w./-]+\.(?:ts|js|mts|mjs|cts|cjs)))?$/.exec(String(command).trim());
        if (!match) throw new Error("unsupported command");
        const configName = match[1] ?? ["ts", "js", "mts", "mjs", "cts", "cjs"].map(ext => `playwright.config.${ext}`).find(path => existsSync(resolve(root, path)));
        if (!configName) throw new Error("missing configuration");
        const configPath = resolve(root, configName);
        if (!inside(canonical, configPath)) throw new Error("outside configuration");
        const paths = configuredPaths(read(configPath), configName);
        const testPaths = paths.map(path => {
          if (!path || path.length > 1000 || /[\x00-\x1f]/.test(path) || isAbsolute(path)) throw new Error("unsupported test path");
          const base = resolve(dirname(configPath), path.split(/[?*{[]/, 1)[0]! || ".");
          if (!inside(canonical, base) || !existsSync(base) || !inside(canonical, realpathSync(base))) throw new Error("unavailable test path");
          return relative(root, resolve(dirname(configPath), path)).split(sep).join("/") || ".";
        });
        if (!testPaths.length || testPaths.length > 100) throw new Error("missing test paths");
        const target = { command: `npm run ${name}`, testPaths: [...new Set(testPaths)], configurationFiles: ["package.json", relative(root, configPath).split(sep).join("/")] };
        targets.push({ id: `target-${hash(target).slice(0, 24)}`, ...target });
      } catch { diagnostics.push(`Script ${name}: inspect its package.json command and test configuration; static test paths could not be established. Do not infer absent tests or execute guessed paths.`); }
    }
  } catch { diagnostics.push("Test configuration could not be read safely; inspect package.json and its configured test files."); }
  return finish();
}

function configuredPaths(content: string, name: string): string[] {
  const source = ts.createSourceFile(name, content, ts.ScriptTarget.Latest, true);
  const variables = new Map<string, ts.Expression>(), calls = new Map<string, string>();
  let exported: ts.Expression | undefined;
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) {
        const symbol = binding.propertyName?.text ?? binding.name.text;
        if ((statement.moduleSpecifier.text === "@playwright/test" && symbol === "defineConfig") || (statement.moduleSpecifier.text === "playwright-bdd" && symbol === "defineBddConfig")) calls.set(binding.name.text, symbol);
      }
    } else if (ts.isVariableStatement(statement) && statement.declarationList.flags & ts.NodeFlags.Const) {
      for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name) && declaration.initializer) variables.set(declaration.name.text, declaration.initializer);
    } else if (ts.isExportAssignment(statement) && !statement.isExportEquals) exported = statement.expression;
    else throw new Error("dynamic configuration statement");
  }
  const unwrap = (node: ts.Expression | undefined, depth = 0): ts.Expression => {
    if (!node || depth > 12) throw new Error("unresolved expression");
    if (ts.isIdentifier(node)) return unwrap(variables.get(node.text), depth + 1);
    if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) return unwrap(node.expression, depth + 1);
    return node;
  };
  const object = (node: ts.Expression): ts.ObjectLiteralExpression => {
    const value = unwrap(node);
    if (!ts.isObjectLiteralExpression(value)) throw new Error("dynamic object");
    return value;
  };
  const mayDefine = (expression: ts.Expression, key: string, depth = 0): boolean => {
    if (depth > 12) return true;
    const value = unwrap(expression);
    if (ts.isConditionalExpression(value)) return mayDefine(value.whenTrue, key, depth + 1) || mayDefine(value.whenFalse, key, depth + 1);
    if (!ts.isObjectLiteralExpression(value)) return true;
    return value.properties.some(p => ts.isSpreadAssignment(p) ? mayDefine(p.expression, key, depth + 1)
      : !p.name || (!ts.isIdentifier(p.name) && !ts.isStringLiteral(p.name)) || p.name.text === key);
  };
  const property = (node: ts.ObjectLiteralExpression, key: string) => {
    if (node.properties.some(p => ts.isSpreadAssignment(p) && mayDefine(p.expression, key))) throw new Error("dynamic property override");
    const matches = node.properties.filter(p => p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === key);
    if (matches.length !== 1) throw new Error("missing or repeated property");
    const p = matches[0]!;
    return ts.isPropertyAssignment(p) ? p.initializer : ts.isShorthandPropertyAssignment(p) ? p.name : undefined;
  };
  let config = unwrap(exported);
  if (ts.isCallExpression(config) && ts.isIdentifier(config.expression) && calls.get(config.expression.text) === "defineConfig" && config.arguments.length === 1) config = unwrap(config.arguments[0]);
  let path = unwrap(property(object(config), "testDir"));
  if (ts.isCallExpression(path) && ts.isIdentifier(path.expression) && calls.get(path.expression.text) === "defineBddConfig" && path.arguments.length === 1) path = unwrap(property(object(unwrap(path.arguments[0])), "features"));
  const values = ts.isArrayLiteralExpression(path) ? path.elements.map(item => unwrap(item as ts.Expression)) : [path];
  return values.map(value => { if (!ts.isStringLiteral(value) && !ts.isNoSubstitutionTemplateLiteral(value)) throw new Error("dynamic path"); return value.text; });
}
