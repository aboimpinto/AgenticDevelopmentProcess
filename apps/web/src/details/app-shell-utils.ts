/**
 * Format a timestamp string using the user's locale.
 *
 * Extracted from app-shell.tsx as a shared utility for detail modules.
 */
export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
