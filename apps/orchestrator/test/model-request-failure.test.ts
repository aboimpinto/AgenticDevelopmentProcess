import { expect, it } from "vitest";
import { presentModelRequestFailure } from "../src/runtime/pi/model-request-failure.js";
it("keeps the actionable policy error without putting request telemetry on the feature card", () => {
  const raw = 'HEPHA_MODEL_REQUEST {"inputTokens":42}\nHEPHA_INPUT_USAGE_BUDGET_EXCEEDED: scope=attempt; consumed=480963; next=74000; limit=512000. No request was sent.';
  const message = presentModelRequestFailure(raw);
  expect(message).toContain("HEPHA_INPUT_USAGE_BUDGET_EXCEEDED");
  expect(message).toContain("480963"); expect(message).toContain("512000");
  expect(message).not.toContain("HEPHA_MODEL_REQUEST {");
  expect(presentModelRequestFailure("actual database error")).toBe("actual database error");
});
