import React from "react";

/**
 * SummaryTile — renders a labeled key-value pair in a summary grid.
 *
 * @internal Extracted from app-shell.tsx inline definition.
 */
export function SummaryTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="summary-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
