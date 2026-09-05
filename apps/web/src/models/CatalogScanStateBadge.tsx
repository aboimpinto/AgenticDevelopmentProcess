import type { PresentedCatalogScanState } from "./catalog-scan-state-presentation.js";
import { catalogScanStateLabel } from "./catalog-scan-state-presentation.js";

interface CatalogScanStateBadgeProps {
  readonly state: PresentedCatalogScanState;
}

/** Renders one consistent accessible label for authoritative or explicitly unavailable scan state. */
export function CatalogScanStateBadge({ state }: CatalogScanStateBadgeProps) {
  const label = catalogScanStateLabel(state);
  return (
    <span
      aria-label={`Catalog scan state: ${label}`}
      className={`catalog-scan-state-badge state-${state}`}
    >
      {label}
    </span>
  );
}
