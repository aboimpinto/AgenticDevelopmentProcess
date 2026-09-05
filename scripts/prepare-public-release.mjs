import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { isPublicReleasePath, loadPublicReleasePolicy, repositoryRoot } from "./public-release-policy.mjs";

const target = readTarget();
const policy = loadPublicReleasePolicy(repositoryRoot);
const trackedPaths = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).split("\0").filter(Boolean);
const publicPaths = trackedPaths.filter((path) => isPublicReleasePath(path, policy));

if (resolve(target) === repositoryRoot || resolve(target).startsWith(`${repositoryRoot}/`)) {
  throw new Error("The preparation target must be outside the source repository.");
}

if (existsSync(target) && readdirSync(target).length > 0) {
  throw new Error(`The preparation target must be absent or empty: ${target}`);
}

mkdirSync(target, { recursive: true });

for (const path of publicPaths) {
  const sourcePath = resolve(repositoryRoot, path);
  const targetPath = resolve(target, path);
  const sourceStats = lstatSync(sourcePath);
  if (sourceStats.isSymbolicLink()) throw new Error(`Refusing to copy symbolic link: ${path}`);
  mkdirSync(dirname(targetPath), { recursive: true });
  copyFileSync(sourcePath, targetPath);
  chmodSync(targetPath, sourceStats.mode & 0o777);
}

execFileSync(process.execPath, [resolve(repositoryRoot, "scripts", "public-release-audit.mjs"), "--root", target], {
  cwd: repositoryRoot,
  stdio: "inherit",
});

console.log(`Prepared ${publicPaths.length} public files at ${target}`);

function readTarget() {
  const index = process.argv.indexOf("--target");
  const value = index >= 0 ? process.argv[index + 1] : null;
  if (!value || value.startsWith("--")) {
    throw new Error("Usage: pnpm release:prepare -- --target <empty-directory-outside-repository>");
  }
  return resolve(value);
}
