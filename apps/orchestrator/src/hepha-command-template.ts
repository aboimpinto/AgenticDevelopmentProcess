import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export type HephaCommandTemplateVariables = Record<string, string | number | boolean | null | undefined>;

export function renderHephaCommandTemplate({
  commandPath,
  variables,
  workspaceRoot,
}: {
  commandPath: string;
  variables: HephaCommandTemplateVariables;
  workspaceRoot: string;
}) {
  const templatePath = resolveHephaCommandTemplatePath(workspaceRoot, commandPath);
  const template = stripYamlFrontmatter(readFileSync(templatePath, "utf8"));

  return template.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(variables, key)) {
      throw new Error(`Missing Hepha command template variable: ${key}`);
    }

    const value = variables[key];

    return value === undefined || value === null ? "" : String(value);
  });
}

function resolveHephaCommandTemplatePath(workspaceRoot: string, commandPath: string) {
  if (isAbsolute(commandPath)) {
    throw new Error(`Hepha command template path must be relative to .hepha, got ${commandPath}.`);
  }

  const hephaRoot = resolve(workspaceRoot, ".hepha");
  const absolutePath = resolve(hephaRoot, commandPath);
  const relativePath = relative(hephaRoot, absolutePath);

  if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`Hepha command template path must stay under .hepha, got ${commandPath}.`);
  }

  return absolutePath;
}

function stripYamlFrontmatter(markdown: string) {
  if (!markdown.startsWith("---")) {
    return markdown.trimStart();
  }

  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(markdown);

  return match ? markdown.slice(match[0].length).trimStart() : markdown.trimStart();
}
