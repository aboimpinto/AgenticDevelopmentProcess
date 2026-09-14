import { execFileSync } from "node:child_process";
import type { ExecutionReceiptScope } from "./execution-receipt-binding.js";
import { verificationCheckSourceRoots } from "./verification-source-roots.js";

/** A multi-repository source claim is admissible only with host-bound source
 * owners. Never choose an arbitrary hash from legacy prose or an alternative. */
export function verifiedLinkedRevisionClaim(value: unknown, id: unknown, scope?: ExecutionReceiptScope): boolean {
  if (!scope || typeof value !== "string" || value.length > 2000 || /\bor\b/i.test(value)) return false;
  const hashes = [...value.matchAll(/\b[a-f\d]{7,40}\b/gi)].map(m => m[0].toLowerCase());
  // Accept the same qualified spellings as a single-repository receipt. Each
  // hash still needs an explicit source claim and an independently bound owner.
  const claims = [...value.matchAll(/\bworking[ -]tree\s*@\s*([a-f\d]{40})\b|\b([a-f\d]{40})\s*@\s*working[ -]tree\b|\b([a-f\d]{40})\s*\+\s*[^;\n]*?\bworking[ -]tree\b/gi)]
    .map(m => (m[1] ?? m[2] ?? m[3])!.toLowerCase());
  if (hashes.length < 2 || claims.length !== hashes.length || hashes.some((hash, index) => hash !== claims[index])) return false;
  const selected = scope.checks.find(c => c.id === id);
  if (!selected?.configurationFiles?.length) return false;
  try {
    const roots = verificationCheckSourceRoots({ cwd: selected.cwd, configurationFiles: [...selected.configurationFiles] });
    const heads = roots.map(root => execFileSync("git", ["-C", root, "rev-parse", "HEAD"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10000 }).trim().toLowerCase());
    return heads.length > 1 && hashes.length === heads.length && hashes[0] === heads[0] && new Set(hashes).size === hashes.length
      && hashes.every(hash => heads.includes(hash));
  } catch { return false; }
}
