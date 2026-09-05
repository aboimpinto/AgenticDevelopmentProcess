import type { RoutingMatrixAttentionV1, RoutingMatrixSnapshotV1 } from "@hepha/shared";
import { routeIdentityKey } from "./routing-matrix-presentation.js";
import { routingMatrixRows } from "./routing-matrix-drafts.js";

export interface RoutingMatrixAttentionProps {
  readonly snapshot: RoutingMatrixSnapshotV1;
  readonly mutationBusy: boolean;
  readonly onAcknowledge: (attention: RoutingMatrixAttentionV1) => void;
}

/** Presents durable reset attention without claiming that acknowledgement repairs a route. */
export function RoutingMatrixAttention({ snapshot, mutationBusy, onAcknowledge }: RoutingMatrixAttentionProps) {
  const unresolved = snapshot.attention.filter((item) => item.acknowledgedAt === null);
  if (unresolved.length === 0) return null;
  const rows = [...routingMatrixRows(snapshot).values()];
  return (
    <section aria-labelledby="routing-attention-heading" className="routing-matrix-attention is-unresolved">
      <h3 id="routing-attention-heading">Routing attention required</h3>
      <p>Review these durable route-reset notices. Acknowledging a notice does not repair or change policy.</p>
      <ul>
        {unresolved.map((item) => {
          const identity = routeIdentityKey(item.affectedRoute);
          const connection = snapshot.connectionStates.find((state) => state.connectionId === item.affectedRoute.connectionId);
          const row = rows.find((candidate) => candidate.configured.kind === "route" && routeIdentityKey(candidate.configured.route) === identity
            || routeIdentityKey(candidate.effectiveRoute.route) === identity);
          return (
            <li key={item.attentionId}>
              <div>
                <strong>{connection?.label ?? "Unavailable connection"} · {item.affectedRoute.modelId}</strong>
                <span>Route reset recorded at <time dateTime={item.occurredAt}>{item.occurredAt}</time>.</span>
                {row ? <a href={`#routing-${row.scopeKey.replace(/[^a-z0-9]+/gi, "-")}`}>Review {row.label}</a> : null}
              </div>
              <button disabled={mutationBusy} onClick={() => onAcknowledge(item)} type="button">Acknowledge notice</button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
