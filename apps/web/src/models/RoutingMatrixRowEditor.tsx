import type { RouteIdentityV1, RoutingMatrixRouteV1, RoutingMatrixRowV1 } from "@hepha/shared";
import type { RoutingMatrixDraftState } from "./routing-matrix-drafts.js";
import {
  failurePolicyLabel,
  policySourceLabel,
  routeIdentityKey,
  routeLabel,
} from "./routing-matrix-presentation.js";

export interface RoutingMatrixRowEditorProps {
  readonly row: RoutingMatrixRowV1;
  readonly draft: RoutingMatrixDraftState | null;
  readonly mutationBusy: boolean;
  readonly saving: boolean;
  readonly onChange: (row: RoutingMatrixRowV1, patch: Partial<RoutingMatrixDraftState>, focusId: string) => void;
  readonly onDiscard: (scopeKey: string) => void;
  readonly onSave: (scopeKey: string) => void;
}

/** Presents one routing scope and emits local draft edits without calculating routing policy. */
export function RoutingMatrixRowEditor({ row, draft, mutationBusy, saving, onChange, onDiscard, onSave }: RoutingMatrixRowEditorProps) {
  const id = `routing-${row.scopeKey.replace(/[^a-z0-9]+/gi, "-")}`;
  const selectedRoute = draft?.selectedRoute ?? (row.configured.kind === "route" ? row.configured.route : null);
  const selectedKey = selectedRoute === null ? "inherit" : routeIdentityKey(selectedRoute);
  const selectedChoice = selectedRoute === null ? null : row.routeChoices.find((choice) => routeIdentityKey(choice.route) === selectedKey)
    ?? (routeIdentityKey(row.effectiveRoute.route) === selectedKey ? row.effectiveRoute : null);
  const displayedChoices = selectedChoice && !row.routeChoices.some((choice) => routeIdentityKey(choice.route) === selectedKey)
    ? [selectedChoice, ...row.routeChoices] : row.routeChoices;
  const effectiveLabel = routeLabel(row.effectiveRoute);
  const explicit = selectedRoute !== null;
  const failureMode = draft?.failureMode ?? row.configuredFailurePolicy?.kind ?? "fail_immediately";
  const fallbackChoices = draft?.preview?.allowedFallbackRoutes ?? [];
  const requestReady = draft !== null && draft.issue === null && !draft.previewPending
    && (draft.selectedRoute === null || draft.preview !== null)
    && (draft.failureMode !== "reroute_route_once" || draft.fallbackRoute !== null);
  const errorId = `${id}-error`;

  const nextDraft = (patch: Partial<RoutingMatrixDraftState>, focusId: string) => {
    onChange(row, { ...patch, preview: null, issue: null, errorMessage: null }, focusId);
  };

  return (
    <article aria-busy={saving || undefined} aria-labelledby={`${id}-heading`} className={`routing-matrix-row${draft ? " is-dirty" : ""}${saving ? " is-saving" : ""}${draft?.issue ? " has-error" : ""}`} id={id}>
      <header>
        <div>
          <h4 id={`${id}-heading`}>{row.label}</h4>
          <span className="routing-scope-kind">{scopeKindLabel(row.kind)}</span>
        </div>
        {saving ? <strong className="routing-draft-state">Saving</strong> : draft ? <strong className="routing-draft-state">Unsaved</strong> : null}
      </header>

      <div className="routing-row-controls">
        <label htmlFor={`${id}-route`}>Configured route for {row.label}</label>
        <select
          aria-describedby={`${id}-route-guidance${draft?.issue ? ` ${errorId}` : ""}`}
          disabled={saving}
          id={`${id}-route`}
          onChange={(event) => {
            const value = event.target.value;
            const route = value === "inherit" ? null : row.routeChoices.find((choice) => routeIdentityKey(choice.route) === value)?.route ?? null;
            nextDraft({ selectedRoute: route, failureMode: "fail_immediately", fallbackRoute: null }, `${id}-route`);
          }}
          value={selectedKey}
        >
          {row.kind !== "global" ? <option value="inherit">Inherit</option> : null}
          {displayedChoices.map((choice) => (
            <option disabled={!choice.eligible} key={routeIdentityKey(choice.route)} value={routeIdentityKey(choice.route)}>
              {routeLabel(choice)}{choice.eligible ? "" : ` — ${choice.reasons.map((reason) => reason.message).join(" ")}`}
            </option>
          ))}
        </select>
        <small id={`${id}-route-guidance`}>Route changes remain local until this row is saved.</small>
      </div>

      <dl className="routing-effective-facts">
        <div><dt>Effective route</dt><dd>{effectiveLabel}</dd></div>
        <div><dt>Policy source</dt><dd>{policySourceLabel(row.policySource)}</dd></div>
        <div><dt>Effective failure policy</dt><dd>{failurePolicyLabel(row.effectiveFailurePolicy)}</dd></div>
        <div><dt>Availability</dt><dd>{row.effectiveRoute.availability === "available" ? "Available" : "Unavailable"}</dd></div>
      </dl>

      {row.kind === "global" ? (
        <p className="routing-failure-summary"><strong>Failure policy:</strong> Fail immediately (fixed for Global Default).</p>
      ) : !explicit ? (
        <p className="routing-failure-summary"><strong>Failure policy:</strong> {failurePolicyLabel(row.effectiveFailurePolicy)} (inherited, read-only).</p>
      ) : (
        <fieldset className="routing-failure-editor">
          <legend>Failure behavior for {row.label}</legend>
          <label htmlFor={`${id}-failure`}>Failure policy for {row.label}</label>
          <select
            disabled={saving}
            id={`${id}-failure`}
            onChange={(event) => nextDraft({ failureMode: event.target.value as RoutingMatrixDraftState["failureMode"], fallbackRoute: null }, `${id}-failure`)}
            value={failureMode}
          >
            <option value="fail_immediately">Fail immediately</option>
            <option value="reroute_global_once">Reroute once to Global Default</option>
            <option value="reroute_route_once">Reroute once to a selected route</option>
          </select>
          {failureMode === "reroute_route_once" ? (
            <>
              <label htmlFor={`${id}-fallback`}>Fallback route for {row.label}</label>
              <select
                disabled={saving || draft?.previewPending || fallbackChoices.length === 0}
                id={`${id}-fallback`}
                onChange={(event) => nextDraft({ fallbackRoute: findRoute(fallbackChoices, event.target.value) }, `${id}-fallback`)}
                value={draft?.fallbackRoute ? routeIdentityKey(draft.fallbackRoute) : ""}
              >
                <option value="">Select an eligible fallback</option>
                {fallbackChoices.map((choice) => (
                  <option disabled={!choice.eligible} key={routeIdentityKey(choice.route)} value={routeIdentityKey(choice.route)}>
                    {routeLabel(choice)}{choice.eligible ? "" : ` — ${choice.reasons.map((reason) => reason.message).join(" ")}`}
                  </option>
                ))}
              </select>
            </>
          ) : null}
        </fieldset>
      )}

      <details className="routing-eligibility">
        <summary>Route eligibility and immutable identity</summary>
        <p>Effective identity: <code>{row.effectiveRoute.route.connectionId} / {row.effectiveRoute.route.modelId}</code></p>
        {selectedChoice?.reasons.length ? <ul>{selectedChoice.reasons.map((reason) => <li key={reason.code}>{reason.message}</li>)}</ul> : <p>The selected route meets the server-supplied requirements for this scope.</p>}
        {row.routeChoices.some((choice) => choice.reasons.length > 0) ? (
          <ul>{row.routeChoices.filter((choice) => choice.reasons.length > 0).map((choice) => <li key={routeIdentityKey(choice.route)}><strong>{routeLabel(choice)}:</strong> {choice.reasons.map((reason) => reason.message).join(" ")}</li>)}</ul>
        ) : null}
      </details>

      {draft?.previewPending ? <p aria-live="polite">Checking this draft against the current routing policy…</p> : null}
      {draft?.issue ? <p className="routing-row-error" id={errorId} role="alert" tabIndex={-1}>{draft.errorMessage ?? draftIssueMessage(draft.issue)}</p> : null}
      {draft ? (
        <div className="routing-row-actions">
          <button disabled={saving} onClick={() => onDiscard(row.scopeKey)} type="button">Discard {row.label} changes</button>
          <button disabled={mutationBusy || !requestReady} onClick={() => onSave(row.scopeKey)} type="button">{saving ? `Saving ${row.label}` : `Save ${row.label}`}</button>
        </div>
      ) : null}
    </article>
  );
}

function findRoute(choices: readonly RoutingMatrixRouteV1[], key: string): RouteIdentityV1 | null {
  return choices.find((choice) => routeIdentityKey(choice.route) === key)?.route ?? null;
}
function scopeKindLabel(kind: RoutingMatrixRowV1["kind"]): string {
  return kind === "action_type" ? "Type default" : kind === "action" ? "Action" : "Installation default";
}
function draftIssueMessage(issue: NonNullable<RoutingMatrixDraftState["issue"]>): string {
  if (issue === "scope_removed") return "This scope is no longer registered. Discard this draft or keep it for comparison.";
  if (issue === "fallback_unavailable") return "The selected fallback is no longer eligible. Choose another fallback.";
  if (issue === "conflict") return "The policy changed. Reload the latest matrix to compare before retrying this draft.";
  if (issue === "validation") return "This draft could not be validated safely. Review the fields and try again.";
  return "The selected route is no longer eligible. Choose another route.";
}
