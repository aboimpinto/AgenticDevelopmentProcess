import { describe, expect, it } from "vitest";
import {
  scanSafeContent,
  scanSafeParsedStringValues,
} from "../src/review-governance/content-safety.js";

describe("review governance content safety", () => {
  it("accepts ordinary Unicode text and benign credential vocabulary", () => {
    expect(() => scanSafeContent("Tokenizer follows password-policy 😀.\nNext line."))
      .not.toThrow();
  });

  it.each([
    "",
    "unsafe\0value",
    "unsafe\x07value",
    "unsafe\x1bvalue",
    "password = exposed-value",
    "api_key: exposed-value",
    "-----BEGIN RSA PRIVATE KEY-----",
    `ghp_${"a".repeat(36)}`,
    `sk-${"a".repeat(30)}`,
  ])("rejects unsafe transport content", (content) => {
    expect(() => scanSafeContent(content)).toThrow(/^SECURITY_VIOLATION$/);
  });

  it("accepts paired surrogate Unicode and rejects lone surrogates", () => {
    expect(() => scanSafeContent("paired 😀 value")).not.toThrow();
    expect(() => scanSafeContent(`lone ${String.fromCharCode(0xd800)}`))
      .toThrow(/^SECURITY_VIOLATION$/);
    expect(() => scanSafeContent(`lone ${String.fromCharCode(0xdc00)}`))
      .toThrow(/^SECURITY_VIOLATION$/);
  });

  it("recursively scans decoded arrays and objects", () => {
    expect(() => scanSafeParsedStringValues({ nested: ["safe", { value: "token: exposed" }] }))
      .toThrow(/^SECURITY_VIOLATION$/);
    expect(() => scanSafeParsedStringValues({ nested: ["safe", { value: 42 }] }))
      .not.toThrow();
  });
});
