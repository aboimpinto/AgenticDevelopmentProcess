import { describe, expect, it } from "vitest";

import { normalizeDisplayWhitespace } from "./display-text.js";

describe("normalizeDisplayWhitespace", () => {
  it("decodes only literal CRLF, LF, CR, and tab whitespace escapes", () => {
    expect(normalizeDisplayWhitespace("first\\r\\nsecond\\nthird\\rfourth\\tfifth"))
      .toBe("first\nsecond\nthird\nfourth\tfifth");
  });

  it("does not parse JSON or decode unrelated escape sequences", () => {
    const value = '{"message":"line\\nnext","quote":"\\\"","unicode":"\\u0041"}';

    expect(normalizeDisplayWhitespace(value))
      .toBe('{"message":"line\nnext","quote":"\\\"","unicode":"\\u0041"}');
  });
});
