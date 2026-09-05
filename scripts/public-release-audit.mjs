import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { isPublicReleasePath, loadPublicReleasePolicy, repositoryRoot } from "./public-release-policy.mjs";

const rootArgument = readArgument("--root");
const auditRoot = resolve(rootArgument ?? repositoryRoot);
const isTrackedProjection = !rootArgument;
const policy = loadPublicReleasePolicy(isTrackedProjection ? repositoryRoot : auditRoot);
const paths = isTrackedProjection ? readSourcePaths(repositoryRoot) : readTreePaths(auditRoot);
const publicPaths = isTrackedProjection ? paths.filter((path) => isPublicReleasePath(path, policy)) : paths;
const publicPathSet = new Set(publicPaths);
const failures = [];
const warnings = [];
const reviewedFixtures = [];

for (const requiredPath of policy.requiredPaths) {
  if (!publicPathSet.has(requiredPath)) {
    failures.push(`Required public path is missing: ${requiredPath}`);
  }
}

for (const path of publicPaths) {
  const absolutePath = resolve(auditRoot, path);
  const stats = lstatSync(absolutePath);

  if (stats.isSymbolicLink()) {
    failures.push(`Symbolic links require explicit review: ${path}`);
    continue;
  }

  if (isTrackedProjection && !isPublicReleasePath(path, policy)) {
    failures.push(`Excluded path entered the public projection: ${path}`);
  }

  if (stats.size > 2_000_000) {
    warnings.push(`Large public file (${stats.size} bytes): ${path}`);
  }

  if (isBinaryExtension(path) || stats.size > 2_000_000) {
    continue;
  }

  const content = readFileSync(absolutePath);
  if (content.includes(0)) {
    continue;
  }

  const text = content.toString("utf8");
  if (path !== "docs/public-release-manifest.json") {
    for (const marker of policy.forbiddenTextMarkers) {
      if (text.toLowerCase().includes(marker.toLowerCase())) {
        failures.push(`Forbidden private marker ${JSON.stringify(marker)} in ${path}`);
      }
    }
  }

  scanSecretShapes(path, text, policy, failures, reviewedFixtures);
}

if (!isTrackedProjection) {
  checkMarkdownLinks(auditRoot, publicPaths, publicPathSet, failures);
}

console.log(`Public release audit root: ${auditRoot}`);
console.log(`Mode: ${isTrackedProjection ? "tracked projection" : "prepared tree"}`);
console.log(`Files considered public: ${publicPaths.length}`);
console.log(`Files excluded by policy: ${isTrackedProjection ? paths.length - publicPaths.length : 0}`);

printFindings("Warnings", warnings);
printFindings("Reviewed synthetic secret fixtures", reviewedFixtures);
printFindings("Failures", failures);

if (failures.length > 0) {
  process.exitCode = 1;
} else {
  console.log("Public release audit: PASS");
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function readSourcePaths(root) {
  return execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
}

function readTreePaths(root, current = root) {
  const paths = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const absolutePath = resolve(current, entry.name);
    if (entry.isDirectory()) paths.push(...readTreePaths(root, absolutePath));
    else paths.push(relative(root, absolutePath).replaceAll("\\", "/"));
  }
  return paths.sort();
}

function isBinaryExtension(path) {
  return new Set([".gif", ".ico", ".jpeg", ".jpg", ".png", ".webp"]).has(extname(path).toLowerCase());
}

function scanSecretShapes(path, text, policy, failures, reviewedFixtures) {
  const patterns = [
    ["AWS access key", /AKIA[0-9A-Z]{16}/g],
    ["GitHub token", /gh[pousr]_[A-Za-z0-9]{20,}/g],
    ["OpenAI-style token", /sk-(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{20,}/g],
    ["Google API key", /AIza[0-9A-Za-z_-]{35}/g],
    ["Slack token", /xox[baprs]-[0-9A-Za-z-]{10,}/g],
    ["Stripe live key", /sk_live_[0-9A-Za-z]{16,}/g],
    ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ];
  const allowedFingerprints = new Set(policy.reviewedSyntheticSecretFingerprints?.[path] ?? []);

  for (const [label, pattern] of patterns) {
    const matches = text.match(pattern) ?? [];
    for (const match of matches) {
      const fingerprint = createHash("sha256").update(match).digest("hex");
      if (allowedFingerprints.has(fingerprint)) {
        reviewedFixtures.push(`${label} fixture in ${path} (${fingerprint.slice(0, 12)}...)`);
      } else {
        failures.push(`${label} shape in ${path}; value redacted; fingerprint ${fingerprint}`);
      }
    }
  }
}

function checkMarkdownLinks(root, paths, pathSet, failures) {
  for (const path of paths.filter((candidate) => candidate.endsWith(".md"))) {
    const text = readFileSync(resolve(root, path), "utf8");
    const targets = [
      ...[...text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]),
      ...[...text.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]),
    ];

    for (const rawTarget of targets) {
      const target = rawTarget.split("#")[0];
      if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
      const resolvedTarget = relative(root, resolve(root, dirname(path), decodeURIComponent(target))).replaceAll("\\", "/");
      if (!pathSet.has(resolvedTarget) && !existsSync(resolve(root, resolvedTarget))) {
        failures.push(`Broken local link in ${path}: ${rawTarget}`);
      }
    }
  }
}

function printFindings(label, findings) {
  const uniqueFindings = [...new Set(findings)].sort();
  console.log(`${label}: ${uniqueFindings.length}`);
  for (const finding of uniqueFindings) console.log(`- ${finding}`);
}
