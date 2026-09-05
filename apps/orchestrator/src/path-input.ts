import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

export function resolvePathInput(
  input: string,
  options: { basePath?: string; homeDirectory?: string } = {},
) {
  const expandedPath = expandHomePath(input, options.homeDirectory);

  if (isAbsolute(expandedPath)) {
    return resolve(expandedPath);
  }

  return options.basePath ? resolve(options.basePath, expandedPath) : resolve(expandedPath);
}

function expandHomePath(input: string, homeDirectory = homedir()) {
  const trimmedInput = input.trim();

  if (trimmedInput === "~") {
    return homeDirectory;
  }

  if (trimmedInput.startsWith("~/") || trimmedInput.startsWith("~\\")) {
    return resolve(homeDirectory, trimmedInput.slice(2));
  }

  return trimmedInput;
}
