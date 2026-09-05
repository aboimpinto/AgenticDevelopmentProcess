/**
 * FEAT-058: Provider Connections — Connection List
 *
 * Lists all provider connections with summary info.
 * No secret values rendered.
 */

import React from "react";
import type { ActiveCatalogConnectionState } from "@hepha/shared";
import { CatalogScanStateBadge } from "../models/CatalogScanStateBadge.js";
import type { ConnectionSummaryDTO } from "./types.js";
import { formatEndpointDisplay, formatLifecycleStateDisplay } from "./presentation.js";

interface ConnectionListProps {
  readonly connections: ConnectionSummaryDTO[];
  readonly catalogStates?: readonly ActiveCatalogConnectionState[];
  readonly catalogStateUnavailable?: boolean;
  readonly selectedId?: string;
  readonly onSelect: (id: string) => void;
  readonly onCreateNew: () => void;
  readonly loading?: boolean;
}

export function ConnectionList({
  connections,
  catalogStates = [],
  catalogStateUnavailable = false,
  selectedId,
  onSelect,
  onCreateNew,
  loading,
}: ConnectionListProps) {
  if (loading) {
    return <div className="provider-connections-loading" role="status">Loading connections...</div>;
  }

  const catalogStateByConnection = new Map(catalogStates.map((state) => [state.connectionId, state]));

  return (
    <div className="provider-connections-list">
      <div className="provider-connections-list-header">
        <h2>Provider Connections</h2>
        <button
          className="provider-connections-create-btn"
          onClick={onCreateNew}
          aria-label="Create new provider connection"
        >
          + New Connection
        </button>
      </div>

      {connections.length === 0 ? (
        <p className="provider-connections-empty">No provider connections configured.</p>
      ) : (
        <ul className="provider-connections-items" role="listbox" aria-label="Provider connections">
          {connections.map((conn) => (
            <li
              key={conn.connectionId}
              className={`provider-connections-item ${selectedId === conn.connectionId ? "selected" : ""}`}
              role="option"
              aria-selected={selectedId === conn.connectionId}
              onClick={() => onSelect(conn.connectionId)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(conn.connectionId); }}
              tabIndex={0}
            >
              <div className="provider-connections-item-header">
                <span className="provider-connections-item-label">{conn.label}</span>
                <span className={`provider-connections-item-badge kind-${conn.kind}`}>
                  {conn.kind === "known" ? "Known" : conn.kind === "custom" ? "Custom" : "Pi Session"}
                </span>
              </div>
              <div className="provider-connections-item-detail">
                <span className="provider-connections-item-provider">{conn.providerLabel}</span>
                <span className="provider-connections-item-separator">·</span>
                <span className="provider-connections-item-endpoint">
                  {formatEndpointDisplay(conn.endpointUrl, conn.endpointLocal)}
                </span>
              </div>
              <div className="provider-connections-item-meta">
                <span className={`provider-connections-item-state state-${conn.lifecycleState}`}>
                  {formatLifecycleStateDisplay(conn.lifecycleState)}
                </span>
                {conn.lifecycleState === "active" ? (
                  <CatalogScanStateBadge
                    state={catalogStateUnavailable
                      ? "unavailable"
                      : catalogStateByConnection.get(conn.connectionId)?.scanState ?? "unavailable"}
                  />
                ) : null}
                {conn.hasSecret && (
                  <span className="provider-connections-item-secret-badge">Secret configured</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
