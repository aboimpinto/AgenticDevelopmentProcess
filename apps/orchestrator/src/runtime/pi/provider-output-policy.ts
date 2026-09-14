import type { RequestModelLimits } from "./model-request-policy.js";

/** Codex subscription transport is not the public Responses API. Its adapter
 * does not send an output cap; never claim to reserve an enforced task maximum. */
export function supportsTaskOutputLimit(model: Pick<RequestModelLimits, "api" | "provider">): boolean {
  return model.api !== "openai-codex-responses" && model.api !== "openai-codex" && model.provider !== "openai-codex";
}

export function taskOutputReservation(model: RequestModelLimits): number {
  return supportsTaskOutputLimit(model) ? Math.min(model.maxTokens, 16_384) : model.maxTokens;
}
