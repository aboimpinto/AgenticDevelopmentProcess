import type { Ref } from "react";

interface CatalogToolbarProps {
  readonly query: string;
  readonly isScanningAll: boolean;
  readonly isScanningSelected: boolean;
  readonly selectedConnectionLabel: string | null;
  readonly scanAllRef?: Ref<HTMLButtonElement>;
  readonly scanSelectedRef?: Ref<HTMLButtonElement>;
  readonly onQueryChange: (query: string) => void;
  readonly onScanAll: () => void;
  readonly onScanSelected: () => void;
}

/** Renders local filtering and independently busy catalog scan controls. */
export function CatalogToolbar(props: CatalogToolbarProps) {
  return (
    <div className="catalog-toolbar">
      <label className="catalog-search">
        <span>Search model or connection</span>
        <input
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder="Search model or connection"
          type="search"
          value={props.query}
        />
      </label>
      <div className="catalog-toolbar-actions">
        <button aria-busy={props.isScanningAll} disabled={props.isScanningAll} onClick={props.onScanAll} ref={props.scanAllRef} type="button">
          {props.isScanningAll ? "Scanning Models…" : "Scan Models"}
        </button>
        {props.selectedConnectionLabel ? (
          <button
            aria-busy={props.isScanningSelected}
            disabled={props.isScanningSelected}
            onClick={props.onScanSelected}
            ref={props.scanSelectedRef}
            type="button"
          >
            {props.isScanningSelected ? "Scanning connection…" : "Scan selected connection"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
