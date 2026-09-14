import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { modelTokenizerEncoding, prepareModelTokenCounter } from "../src/runtime/pi/model-token-counter.js";
const roots: string[] = [];
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); roots.splice(0).forEach(root => rmSync(root, {recursive: true, force: true})); });
it.each(["deepseek-flash", "deepseek-v4.1-flash", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp"])("resolves official API model %s to its current tokenizer", id => {
  expect(modelTokenizerEncoding({provider: "deepseek", id})).toBe("deepseek-v4.1");
});
it("keeps pinned/self-hosted V4 and current Pro distinct from the moving Flash alias", () => {
  expect(modelTokenizerEncoding({provider:"deepseek", id:"deepseek-v4-pro"})).toBe("deepseek-v4");
  expect(modelTokenizerEncoding({provider:"local", id:"deepseek-v4-flash"})).toBe("deepseek-v4");
  expect(() => modelTokenizerEncoding({provider:"local", id:"deepseek-flash"})).toThrow("deepseek-flash");
  expect(() => modelTokenizerEncoding({provider:"deepseek", id:"deepseek-future"})).toThrow("deepseek-future");
});
it("downloads only pinned verified assets and rejects corrupt content instead of counting bytes", async () => {
  const root = mkdtempSync(join(tmpdir(), "hepha-tokenizer-")); roots.push(root);
  vi.stubEnv("HEPHA_TOKENIZER_CACHE_DIR",root);
  const download=vi.fn(async () => new Response("unverified tokenizer")); vi.stubGlobal("fetch",download);
  await expect(prepareModelTokenCounter({provider:"deepseek",id:"deepseek-flash"})).rejects.toThrow("invalid public tokenizer asset");
  expect(download).toHaveBeenCalledWith(expect.stringMatching(/DeepSeek-V4\.1-Flash\/resolve\/[a-f0-9]{40}\/tokenizer.json$/),expect.anything());
});
