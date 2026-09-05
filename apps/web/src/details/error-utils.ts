/**
 * Extracts a human-readable error message from an unknown error value.
 *
 * Handles Error instances, objects with a message property, and fallback
 * string coercion. Extracted from app-shell.tsx inline definition.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error !== null && typeof error === "object" && "message" in error) {
    return String(error.message);
  }

  return String(error);
}
