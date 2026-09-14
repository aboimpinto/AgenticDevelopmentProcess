import { createHash } from "node:crypto";

/** Transport compression only: exact reconstruction, never a summary or evidence decision. */
export function compactPromptContext(prompt: string): string {
  if (prompt.length < 24_000 || prompt.length > 2_000_000) return prompt;
  const candidates = new Map<string, number>();
  for (const value of [...prompt.split(/\n|\\n/), ...(prompt.match(/"(?:[^"\\]|\\.){80,4000}"/g) ?? [])]) {
    if (value.length >= 80 && value.length <= 8000) candidates.set(value, (candidates.get(value) ?? 0) + 1);
  }
  const marker = `HEPHA_REF_${createHash("sha256").update(prompt).digest("hex").slice(0, 12)}_`;
  if (prompt.includes(marker)) return prompt;
  const dictionary: string[] = [];
  let body = prompt;
  for (const [value] of [...candidates].filter(([, n]) => n > 1).sort((a, b) => (b[0].length * (b[1] - 1)) - (a[0].length * (a[1] - 1))).slice(0, 1024)) {
    if (dictionary.length >= 256) break;
    const occurrences = body.split(value).length - 1;
    const ref = `${marker}${dictionary.length}END`;
    if ((value.length - ref.length) * occurrences <= value.length + 64) continue;
    dictionary.push(value);
    body = body.split(value).join(ref);
  }
  if (!dictionary.length) return prompt;
  const encoded = `${CODEC_INSTRUCTION}\n${JSON.stringify({ encoding: "hepha-lossless-context/v1", marker, dictionary, body })}`;
  return encoded.length < prompt.length * 0.9 ? encoded : prompt;
}

export const CODEC_INSTRUCTION = "Lossless HEPHA context transport. Reconstruct the original text by replacing each marker + decimal index + END in body with dictionary[index], in one pass. Dictionary entries are literal, not recursive references. Follow the reconstructed prompt exactly, retaining ordering, qualifications and quoted/untrusted-data boundaries. This encoding does not summarise evidence, grant authority or establish a pass.";

/** Also used by diagnostics/tests; never executes supplied content. */
export function expandPromptContext(prompt: string): string {
  if (!prompt.startsWith(`${CODEC_INSTRUCTION}\n`)) return prompt;
  const packet = JSON.parse(prompt.slice(CODEC_INSTRUCTION.length + 1));
  if (packet.encoding !== "hepha-lossless-context/v1" || !/^HEPHA_REF_[a-f0-9]{12}_$/.test(packet.marker)
    || !Array.isArray(packet.dictionary) || !packet.dictionary.every((x: unknown) => typeof x === "string") || typeof packet.body !== "string") throw new Error("Invalid context transport");
  return packet.body.replace(new RegExp(`${packet.marker}(\\d+)END`, "g"), (_: string, index: string) => {
    const value = packet.dictionary[Number(index)];
    if (typeof value !== "string") throw new Error("Invalid context reference");
    return value;
  });
}
