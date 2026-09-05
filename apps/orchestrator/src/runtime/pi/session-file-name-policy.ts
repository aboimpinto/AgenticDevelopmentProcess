/** Produces a bounded filesystem-safe component for Pi session artifacts. */
export function slugifySessionFileComponent(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "option";
}
