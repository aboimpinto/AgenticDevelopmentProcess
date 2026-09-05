export type SharedStateCategory = "shared_state" | "safe" | "unknown";

export type SerializationDecisionCode =
  | "ALLOWED_NO_CONFLICT"
  | "BLOCKED_SERIALIZATION_CONFLICT";

export interface SerializationDecision {
  readonly allowed: boolean;
  readonly code: SerializationDecisionCode;
  readonly reason: string;
  readonly conflictActiveCommand?: string;
  readonly conflictResourceScope?: string;
}
