import { describe, expect, it, vi } from "vitest";
import { assessModelRequest } from "../src/runtime/pi/model-request-policy.js";
import modelRequestGuard, { compactRequestText, boundTaskOutput } from "../src/runtime/pi/model-request-guard.js";
import { compactPromptContext, expandPromptContext } from "../src/runtime/pi/prompt-context-codec.js";

const model = { contextWindow: 200_000, maxTokens: 32_000, reasoning: true };
const source = Array.from({ length: 400 }, (_, i) => `Criterion ${i}\n${"Qualified historical evidence; missing browser execution is not a pass. ".repeat(6)}`).join("\n");

describe("installation-wide model request policy", () => {
  it("omits unsupported output fields on Codex subscription requests and reserves the real maximum", () => {
    vi.stubEnv("HEPHA_PI_OUTPUT_TOKEN_LIMIT", "16384");
    try {
      const codex = { ...model, api: "openai-codex-responses", maxTokens: 128000 };
      const payload = boundTaskOutput({ input: "hello", max_output_tokens: 128000 }, codex);
      expect(payload).toEqual({ input: "hello" });
      expect(assessModelRequest(payload, codex, "high").outputReserveTokens).toBe(128000);
      expect(boundTaskOutput({ input: "hello" }, codex)).toEqual({ input: "hello" });
    } finally { vi.unstubAllEnvs(); }
  });
  it("round trips repeated context exactly, including ordering and Unicode", () => {
    const original = `${source}\nUnicode café 🐳; literal HEPHA_REF_123.END; do not discard unresolved clauses`;
    const compact = compactPromptContext(original);
    expect(compact.length).toBeLessThan(original.length / 3);
    expect(expandPromptContext(compact)).toBe(original);
    expect(compactPromptContext("short prompt")).toBe("short prompt");
  });

  it("does not mutate tool call arguments, system instructions or signed thinking blocks", () => {
    const messages = [ { role: "system", content: source }, { role: "assistant", content: source, tool_calls: [{ arguments: source }] },
      { role: "user", content: [{ type: "text", text: source }, { type: "image_url", image_url: "exact-image" }] } ];
    const compact = compactRequestText({ messages }) as { messages: typeof messages };
    expect(compact.messages[0]).toBe(messages[0]); expect(compact.messages[1]).toBe(messages[1]);
    expect(messages[2]!.content).toEqual([{ type: "text", text: source }, { type: "image_url", image_url: "exact-image" }]);
    expect(compact.messages[2]).not.toBe(messages[2]);
  });

  it("reserves provider output and framing space and adapts to smaller models", () => {
    const payload = { messages: [{ role: "user", content: "word ".repeat(30_000) }], max_tokens: 8000 };
    expect(assessModelRequest(payload, model, "high").inputTokens).toBeGreaterThan(30_000);
    expect(() => assessModelRequest(payload, { ...model, contextWindow: 32_000 }, "high")).toThrow("CONTEXT_BUDGET_EXCEEDED");
    expect(() => assessModelRequest(payload, undefined, "high")).toThrow("CONTEXT_UNKNOWN");
  });

  it("enforces explicitly configured spending limits and rejects non-High reasoning", () => {
    expect(assessModelRequest("word ".repeat(100_000), { ...model, contextWindow: 1_000_000 }, "high").contextUsagePercent).toBeLessThan(50);
    for (const level of ["off", "minimal", "low", "medium", "xhigh", "max"]) expect(() => assessModelRequest("small", model, level)).toThrow("HIGH_REASONING_REQUIRED");
    expect(() => assessModelRequest("small", { ...model, reasoning: false }, "high")).toThrow("HIGH_REASONING_REQUIRED");
    vi.stubEnv("HEPHA_PI_MAX_ATTEMPT_INPUT_TOKENS", "512000");
    try { expect(() => assessModelRequest("small", model, "high", 512_000)).toThrow("INPUT_USAGE_BUDGET_EXCEEDED"); }
    finally { vi.unstubAllEnvs(); }
  });

  it("does not mistake repeated input across turns for a context limit or implicit spending grant", () => {
    vi.stubEnv("HEPHA_PI_MAX_ATTEMPT_INPUT_TOKENS", "");
    try {
      for (const contextWindow of [200_000, 1_000_000]) {
        expect(assessModelRequest("small", { ...model, contextWindow }, "high", 900_000).cumulativeInputTokens).toBeGreaterThan(900_000);
      }
    } finally { vi.unstubAllEnvs(); }
  });

  it("rejects malformed operator budgets rather than silently disabling the guard", () => {
    for (const value of ["0", "-1", "NaN", "1.5", "100k"]) {
      vi.stubEnv("HEPHA_PI_MAX_ATTEMPT_INPUT_TOKENS", value);
      try { expect(() => assessModelRequest("small", model, "high")).toThrow("SPENDING_CONFIGURATION_INVALID"); }
      finally { vi.unstubAllEnvs(); }
    }
  });

  it("guards every provider turn, including context appended after the initial prompt", () => {
    let handler!: (event: { payload: unknown }, ctx: { model: typeof model }) => unknown;
    modelRequestGuard({ getThinkingLevel: () => "high", setThinkingLevel: vi.fn(), on: (_event, callback) => { handler = callback; } });
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const exit = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("worker terminated"); });
    try {
      expect(handler({ payload: { messages: [{ role: "user", content: source }] } }, { model })).toBeDefined();
      expect(write.mock.calls.map(x => String(x[0])).join("")).not.toContain("Qualified historical");
      expect(() => handler({ payload: { messages: [{ role: "system", content: "word ".repeat(180_000) }] } }, { model })).toThrow("worker terminated");
      expect(exit).toHaveBeenCalledWith(78);
    } finally { write.mockRestore(); exit.mockRestore(); }
  });

  it("binds the task output allowance on the actual provider payload without increasing a smaller limit", () => {
    vi.stubEnv("HEPHA_PI_OUTPUT_TOKEN_LIMIT", "16384");
    try {
      for (const key of ["max_tokens", "max_output_tokens", "max_completion_tokens"]) {
        const original = { [key]: 128000, messages: [] };
        expect(boundTaskOutput(original, { ...model, maxTokens: 128000 })).toEqual({ ...original, [key]: 16384 });
        expect(original[key]).toBe(128000);
        expect(boundTaskOutput({ [key]: 8000 }, model)).toEqual({ [key]: 8000 });
      }
    } finally { vi.unstubAllEnvs(); }
  });
});
