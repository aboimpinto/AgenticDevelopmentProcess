/** Returns a strictly positive base-10 integer or the declared fallback. */
export function readPositiveIntegerEnvironment(value: string | undefined, fallback: number): number {
  return readOptionalPositiveIntegerEnvironment(value) ?? fallback;
}

/** Returns a strictly positive base-10 integer, or null when the policy is unset or invalid. */
export function readOptionalPositiveIntegerEnvironment(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
