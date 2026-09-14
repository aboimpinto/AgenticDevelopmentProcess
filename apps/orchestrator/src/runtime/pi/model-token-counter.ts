import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
export interface ModelTokenIdentity { id?: string; provider?: string }
export interface ModelTokenCounter { readonly encoding: string; count(text: string): number }
const counters = new Map<string, ModelTokenCounter>();
// Official assets are immutable and independently checksum-verified. API aliases
// are distinct from versioned/self-hosted models; never infer a tokenizer by bytes.
const tokenizerAssets = {
  "deepseek-v4": { repository: "deepseek-ai/DeepSeek-V4-Flash", revision: "60d8d70770c6776ff598c94bb586a859a38244f1",
    files: { "tokenizer.json": "8f9f37ca37fdc4f5fd36d5cf4d3b0e8392edb4e894fd10cc0d70b4957c8633cf",
      "tokenizer_config.json": "6ac8c8dc065ed118161d02dd532749ae3f52c243deac27872134fae2f50d8547" } },
  "deepseek-v4.1": { repository: "deepseek-ai/DeepSeek-V4.1-Flash", revision: "dba1be0a40aa45a94ad051997016db3960a90277",
    files: { "tokenizer.json": "c90dfa01249db1be4245780a052ede752e1361c612ac6d08e2bdada7d599476b",
      "tokenizer_config.json": "6ac8c8dc065ed118161d02dd532749ae3f52c243deac27872134fae2f50d8547" } },
};
type PublicEncoding = keyof typeof tokenizerAssets;
const publicAsset = (encoding: string) => tokenizerAssets[encoding as PublicEncoding];
const cacheDirectory = (encoding: string) => join(process.env.HEPHA_TOKENIZER_CACHE_DIR ?? join(homedir(), ".cache", "hepha", "tokenizers"), publicAsset(encoding).revision);
const digest = (text: string) => createHash("sha256").update(text).digest("hex");

/** Capability preflight: no model request, tokenizer download or project access. */
export function modelTokenizerEncoding(model: ModelTokenIdentity): string {
  const id = (model.id ?? "").toLowerCase();
  const provider = model.provider?.toLowerCase();
  // Official API mapping verified 2026-09-13:
  // https://api-docs.deepseek.com/quick_start/pricing/
  if (id === "deepseek-v4.1-flash" || (id === "deepseek-flash" && (!provider || provider === "deepseek"))
    || (provider === "deepseek" && ["deepseek-v4-flash", "deepseek-v4-flash-vision-exp"].includes(id))) return "deepseek-v4.1";
  if (/^(?:deepseek-ai\/)?deepseek-v4-(?:flash|pro)(?:$|[-:])/.test(id)) return "deepseek-v4";
  if (/^(?:gpt-3\.5|gpt-4(?:-|$))/.test(id)) return "cl100k_base";
  if (!id || /^(?:gpt-(?:[5-9]|4o|4\.1)|o[134](?:-|$)|chatgpt-4o)/.test(id)) return "o200k_base";
  throw new Error(`HEPHA_TOKENIZER_UNAVAILABLE: no verified tokenizer mapping for model ${model.id ?? "(unspecified)"} on provider ${model.provider ?? "(unspecified)"}. No request sent. Configure a supported model/tokenizer; no byte-derived token count is substituted.`);
}

export function modelTokenizerNeedsPreparation(model: ModelTokenIdentity): boolean {
  return Boolean(publicAsset(modelTokenizerEncoding(model)));
}

/** Counts local text BPE tokens, not provider-billed chat framing or image tokens.
 * Full serialized requests and a separate framing margin cover text wire overhead. */
export function getModelTokenCounter(model: ModelTokenIdentity = {}): ModelTokenCounter {
  const encoding = modelTokenizerEncoding(model);
  const counterKey = publicAsset(encoding) ? cacheDirectory(encoding) : encoding;
  const existing = counters.get(counterKey);
  if (existing) return existing;
  let count: (text: string) => number;
  if (publicAsset(encoding)) {
    const data = Object.entries(publicAsset(encoding).files).map(([file, sha]) => {
      const text = readFileSync(join(cacheDirectory(encoding), file), "utf8");
      if (digest(text) !== sha) throw new Error("HEPHA_TOKENIZER_UNAVAILABLE: tokenizer checksum mismatch.");
      return JSON.parse(text);
    });
    const { Tokenizer } = require("@huggingface/tokenizers") as typeof import("@huggingface/tokenizers");
    const tokenizer = new Tokenizer(data[0], data[1]);
    count = text => tokenizer.encode(text, { add_special_tokens: false }).ids.length;
  } else {
    const tokenizer = require(`gpt-tokenizer/encoding/${encoding}`) as { countTokens(text: string, options: object): number };
    count = text => tokenizer.countTokens(text, { disallowedSpecial: new Set() });
  }
  // Bounded per-process memoization avoids repeatedly tokenizing identical
  // candidate prompts during compaction/partition planning.
  const memo = new Map<string, number>();
  const result = { encoding, count(text: string) {
    const key = digest(text), saved = memo.get(key); if (saved !== undefined) return saved;
    const tokens = count(text); if (memo.size >= 256) memo.delete(memo.keys().next().value!);
    memo.set(key, tokens); return tokens;
  } };
  counters.set(counterKey, result); return result;
}

/** Public tokenizer metadata only; no prompts or project data leave the machine. */
export async function prepareModelTokenCounter(model: ModelTokenIdentity): Promise<ModelTokenCounter> {
  const encoding = modelTokenizerEncoding(model);
  const asset = publicAsset(encoding);
  if (!asset) return getModelTokenCounter(model);
  try { return getModelTokenCounter(model); } catch { /* Fetch only pinned public assets, never arbitrary model URLs. */ }
  for (const [file, sha] of Object.entries(publicAsset(encoding).files)) {
    const response = await fetch(`https://huggingface.co/${asset.repository}/resolve/${asset.revision}/${file}`, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`HEPHA_TOKENIZER_UNAVAILABLE: public tokenizer download returned ${response.status}.`);
    const text = await response.text();
    if (text.length > 8_000_000 || digest(text) !== sha) throw new Error("HEPHA_TOKENIZER_UNAVAILABLE: invalid public tokenizer asset.");
    mkdirSync(cacheDirectory(encoding), { recursive: true });
    const temporary = join(cacheDirectory(encoding), `${file}.${randomUUID()}.tmp`);
    writeFileSync(temporary, text, "utf8"); renameSync(temporary, join(cacheDirectory(encoding), file));
  }
  return getModelTokenCounter(model);
}
