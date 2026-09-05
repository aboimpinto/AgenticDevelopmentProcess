import { useRef, useState, type KeyboardEvent, type Ref } from "react";
import type { CatalogModelIdentity } from "@hepha/shared";
import { catalogIdentityKey, sameCatalogIdentity } from "./catalog-presentation.js";
import type { CatalogPresentationRow } from "./types.js";

interface CatalogModelListProps {
  readonly rows: readonly CatalogPresentationRow[];
  readonly selectedIdentity: CatalogModelIdentity | null;
  readonly onSelect: (identity: CatalogModelIdentity) => void;
  readonly listboxRef?: Ref<HTMLDivElement>;
}

/** Renders the current selectable catalog as a keyboard-operable immutable-identity listbox. */
export function CatalogModelList(props: CatalogModelListProps) {
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  function selectAt(index: number) {
    const row = props.rows[index];
    if (row) props.onSelect(row.identity);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (props.rows.length === 0) return;
    const currentIndex = Math.min(activeIndex, props.rows.length - 1);
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = Math.min(currentIndex + 1, props.rows.length - 1);
    if (event.key === "ArrowUp") nextIndex = Math.max(currentIndex - 1, 0);
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = props.rows.length - 1;
    if (nextIndex !== null) {
      event.preventDefault();
      setActiveIndex(nextIndex);
      optionRefs.current[nextIndex]?.focus();
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectAt(currentIndex);
    }
  }

  if (props.rows.length === 0) {
    return <p className="catalog-empty">No current models match this view.</p>;
  }

  return (
    <div
      aria-activedescendant={`catalog-model-${catalogIdentityKey(props.rows[Math.min(activeIndex, props.rows.length - 1)]!.identity)}`}
      aria-label="Available models"
      className="catalog-model-list"
      onKeyDown={handleKeyDown}
      ref={props.listboxRef}
      role="listbox"
      tabIndex={0}
    >
      {props.rows.map((row, index) => {
        const selected = sameCatalogIdentity(row.identity, props.selectedIdentity);
        return (
          <div
            aria-selected={selected}
            className={selected ? "catalog-model-option is-selected" : "catalog-model-option"}
            id={`catalog-model-${catalogIdentityKey(row.identity)}`}
            key={catalogIdentityKey(row.identity)}
            onClick={() => { setActiveIndex(index); props.onSelect(row.identity); }}
            onKeyDown={handleKeyDown}
            ref={(element) => { optionRefs.current[index] = element; }}
            role="option"
            tabIndex={selected ? 0 : -1}
          >
            <strong>{row.connectionLabel} · {row.identity.modelId}</strong>
            {row.model.displayName ? <span>{row.model.displayName}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
