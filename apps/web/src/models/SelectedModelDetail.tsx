import type { CatalogPresentationRow } from "./types.js";

interface SelectedModelDetailProps {
  readonly row: CatalogPresentationRow | null;
}

/** Renders only the selected record's safe catalog facts and explicit unknown values. */
export function SelectedModelDetail({ row }: SelectedModelDetailProps) {
  if (!row) {
    return <aside className="selected-model-detail"><h3>Selected Model</h3><p>Select a current model to inspect its safe supplier facts.</p></aside>;
  }
  const { model } = row;
  return (
    <aside aria-live="polite" className="selected-model-detail">
      <h3>Selected Model</h3>
      <p className="catalog-identity">{row.connectionLabel} · {model.identity.modelId}</p>
      <p>{model.description ?? "Not supplied"}</p>
      <dl>
        <Detail label="Availability" value="Available" />
        <Detail label="Endpoint identity" value={row.endpointUrl ?? "Not supplied"} />
        <Detail label="Last scan" value={model.lastSuccessfulScanAt} />
        <Detail label="Context window" value={model.contextWindowTokens?.toLocaleString() ?? "Not supplied"} />
        <Detail label="Maximum output" value={model.maxOutputTokens?.toLocaleString() ?? "Not supplied"} />
        <Detail label="Input modalities" value={model.inputModalities.length ? model.inputModalities.join(", ") : "Not supplied"} />
        <Detail label="Reasoning controls" value={fact(model.capabilities.reasoning)} />
        <Detail label="Tool compatibility" value={fact(model.capabilities.tools)} />
        <Detail label="API compatibility" value={fact(model.capabilities.api)} />
        <Detail label="Input pricing" value={price(model.pricing?.inputPerMillionUsd, model.pricing?.currency)} />
        <Detail label="Output pricing" value={price(model.pricing?.outputPerMillionUsd, model.pricing?.currency)} />
      </dl>
    </aside>
  );
}

function Detail({ label, value }: { readonly label: string; readonly value: string }) {
  return <><dt>{label}</dt><dd>{value}</dd></>;
}

function fact(value: boolean | null): string {
  return value === null ? "Not supplied" : value ? "Supported" : "Not supported";
}

function price(value: number | null | undefined, currency: "USD" | null | undefined): string {
  return value === null || value === undefined || currency === null || currency === undefined
    ? "Not supplied" : `${currency} ${value} per million tokens`;
}
