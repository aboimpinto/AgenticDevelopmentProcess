import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templateRoot = resolve(repositoryRoot, "examples", "supervised-demo", "template");
const inventoryPath = resolve(repositoryRoot, "docs", "architecture", "project-hepha-asset-inventory.json");
const target = readTarget();

if (target === repositoryRoot || target.startsWith(`${repositoryRoot}/`)) {
  throw new Error("The demo target must be outside the HEPHA repository.");
}

if (existsSync(target) && readdirSync(target).length > 0) {
  throw new Error(`The demo target must be absent or empty: ${target}`);
}

mkdirSync(target, { recursive: true });
copyDirectory(templateRoot, target);
createMemoryBankDirectories(target);
copyManagedAssets(target);

console.log(`Created the HEPHA supervised demo at ${target}`);
console.log("Next: initialize it as a Git repository, then register it in HEPHA with MemoryBank Path set to MemoryBank.");

function readTarget() {
  const index = process.argv.indexOf("--target");
  const value = index >= 0 ? process.argv[index + 1] : null;
  if (!value || value.startsWith("--")) {
    throw new Error("Usage: pnpm demo:create -- --target <empty-directory-outside-repository>");
  }
  return resolve(value);
}

function copyManagedAssets(targetRoot) {
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
  for (const group of inventory.managedAssetGroups) {
    for (const file of group.files) {
      copyRegularFile(
        resolve(repositoryRoot, group.sourceDirectory, file),
        resolve(targetRoot, group.destinationDirectory, file),
      );
    }
  }
}

function copyDirectory(source, destination) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = resolve(source, entry.name);
    const destinationPath = resolve(destination, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing to copy symbolic link: ${sourcePath}`);
    if (entry.isDirectory()) {
      mkdirSync(destinationPath, { recursive: true });
      copyDirectory(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      copyRegularFile(sourcePath, destinationPath);
    }
  }
}

function copyRegularFile(source, destination) {
  const stats = lstatSync(source);
  if (!stats.isFile()) throw new Error(`Expected a regular file: ${source}`);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

function createMemoryBankDirectories(targetRoot) {
  const directories = [
    "Features/00_EPICS",
    "Features/01_SUBMITTED",
    "Features/02_READY_TO_DEVELOP",
    "Features/03_IN_PROGRESS",
    "Features/04_COMPLETED",
    "Features/05_CANCELLED",
    "Overview",
    "CodeGuidelines",
    "Architecture",
    "LessonsLearned",
    "Tools",
  ];
  for (const directory of directories) {
    mkdirSync(resolve(targetRoot, "MemoryBank", directory), { recursive: true });
  }
}
