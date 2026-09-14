import { expect, it } from "vitest";
import { progressiveContextBudget, contextCompactionLevel } from "../src/runtime/pi/progressive-context-policy.js";
import { getModelTokenCounter } from "../src/runtime/pi/model-token-counter.js";

it("uses tokens and the complete model window, not the 64k cost cap or byte size", () => {
  const small = progressiveContextBudget({ contextWindow: 200_000, maxTokens: 128_000, reasoning: true });
  const large = progressiveContextBudget({ contextWindow: 1_000_000, maxTokens: 128_000, reasoning: true });
  expect(small.availableInputTokens).toBe(179_520);
  expect(large.availableInputTokens).toBe(979_520);
  expect(contextCompactionLevel(100_000, small)).toBe("light");
  expect(contextCompactionLevel(100_000, large)).toBe("none");
  expect(contextCompactionLevel(small.strongTokens, small)).toBe("strong");
});

it("tokenizes multilingual text and code instead of dividing characters or bytes", () => {
  const counter = getModelTokenCounter({ id: "gpt-5", provider: "openai" });
  expect(counter.count("hello world")).toBe(2);
  const text = "hello world ".repeat(30_000);
  expect(Buffer.byteLength(text)).toBeGreaterThan(300_000);
  expect(counter.count(text)).toBeLessThan(100_000);
  for (const text of ["你好世界", "🐳🐳🐳", "const x = { value: 123 };", "مرحبا بالعالم"]) {
    expect(counter.count(text)).toBeGreaterThan(0);
  }
});

it("does not invent a tokenizer or accept invalid output reservations", () => {
  expect(() => getModelTokenCounter({ id: "unknown-model" })).toThrow("TOKENIZER_UNAVAILABLE");
  const model = { contextWindow: 200_000, maxTokens: 32_000, reasoning: true };
  for (const output of [0, -1, NaN, 32_001]) expect(() => progressiveContextBudget(model, output)).toThrow("CONTEXT_UNKNOWN");
});
