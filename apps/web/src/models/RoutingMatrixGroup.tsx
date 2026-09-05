import type { RoutingMatrixActionTypeGroupV1, RoutingMatrixRowV1 } from "@hepha/shared";
import type { RoutingMatrixDraftMap, RoutingMatrixDraftState } from "./routing-matrix-drafts.js";
import { RoutingMatrixRowEditor } from "./RoutingMatrixRowEditor.js";

export interface RoutingMatrixGroupProps {
  readonly group: RoutingMatrixActionTypeGroupV1;
  readonly drafts: RoutingMatrixDraftMap;
  readonly mutationBusy: boolean;
  readonly savingScopeKey: string | null;
  readonly onChange: (row: RoutingMatrixRowV1, patch: Partial<RoutingMatrixDraftState>, focusId: string) => void;
  readonly onDiscard: (scopeKey: string) => void;
  readonly onSave: (scopeKey: string) => void;
}

/** Preserves one server-ordered action-type hierarchy as a semantic presentation group. */
export function RoutingMatrixGroup(props: RoutingMatrixGroupProps) {
  const { group, drafts, mutationBusy, savingScopeKey, onChange, onDiscard, onSave } = props;
  const headingId = `routing-group-${group.actionType}`;
  return (
    <section aria-labelledby={headingId} className="routing-matrix-group">
      <header><h3 id={headingId}>{group.label}</h3><span>{group.actions.length} {group.actions.length === 1 ? "action" : "actions"}</span></header>
      <RoutingMatrixRowEditor draft={drafts.get(group.typeDefault.scopeKey) ?? null} mutationBusy={mutationBusy} onChange={onChange} onDiscard={onDiscard} onSave={onSave} row={group.typeDefault} saving={savingScopeKey === group.typeDefault.scopeKey} />
      <div className="routing-action-rows">
        {group.actions.map((row) => <RoutingMatrixRowEditor draft={drafts.get(row.scopeKey) ?? null} key={row.scopeKey} mutationBusy={mutationBusy} onChange={onChange} onDiscard={onDiscard} onSave={onSave} row={row} saving={savingScopeKey === row.scopeKey} />)}
      </div>
    </section>
  );
}
