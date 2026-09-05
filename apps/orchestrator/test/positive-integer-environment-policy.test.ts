import { describe, expect, it } from "vitest";
import {
  readOptionalPositiveIntegerEnvironment,
  readPositiveIntegerEnvironment,
} from "../src/runtime/positive-integer-environment-policy.js";

describe("positive integer environment policy", () => {
  it("reads a positive base-10 integer", () => expect(readPositiveIntegerEnvironment("42", 7)).toBe(42));
  it.each([undefined, "", "0", "-3", "invalid"])("uses the fallback for %s", (value) => {
    expect(readPositiveIntegerEnvironment(value, 7)).toBe(7);
  });
  it("keeps an unset optional safety maximum disabled", () => {
    expect(readOptionalPositiveIntegerEnvironment(undefined)).toBeNull();
    expect(readOptionalPositiveIntegerEnvironment(" ")).toBeNull();
    expect(readOptionalPositiveIntegerEnvironment("42")).toBe(42);
  });
});
