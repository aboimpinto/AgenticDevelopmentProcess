import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createPromptUsageAudit } from "../src/runtime/pi/prompt-usage-audit.js";

it("records estimates separately from provider usage and never includes source content or credentials", () => {
  const dir = mkdtempSync(join(tmpdir(), "hepha-usage-"));
  try {
    const path = join(dir, "usage.jsonl"), audit = createPromptUsageAudit(path);
    audit.stderr('HEPHA_MODEL_REQUEST {"inputBytes":9000,"inputTokens":3000,');
    audit.stderr('"secret":"private"}\n');
    audit.event({ type: "message_update", message: { usage: { input: 99 } } });
    audit.event({ type: "message_end", message: { role: "assistant", content: "private", usage: { input: 2800, output: 300, cacheRead: 100, secret: "private" } } });
    const raw = readFileSync(path, "utf8"), rows = raw.trim().split("\n").map(line => JSON.parse(line));
    expect(rows).toHaveLength(2); expect(rows[0].kind).toBe("request-token-count"); expect(rows[1].kind).toBe("provider-usage");
    expect(rows[0].inputTokens).toBe(3000); expect(rows[1].input).toBe(2800);
    expect(raw).not.toContain("private"); expect(raw).not.toContain("secret");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
