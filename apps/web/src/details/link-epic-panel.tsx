import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { WorkItemCard } from "@hepha/shared";

export function LinkEpicPanel({
  item,
  isLinkingEpic,
  linkEpicResult,
  linkEpicError,
  onLinkFeatureToEpic,
}: {
  item: WorkItemCard;
  isLinkingEpic: boolean;
  linkEpicResult: string | null;
  linkEpicError: string | null;
  onLinkFeatureToEpic: (item: WorkItemCard, operation: "link" | "relink" | "unlink", targetEpicCardId?: string) => void;
}) {
  const [selectedEpicId, setSelectedEpicId] = useState("");

  const currentParentEpicIds = item.linkedEpics.length > 0
    ? item.linkedEpics.map((rel) => rel.externalId)
    : item.linkedEpicIds;

  const hasParent = currentParentEpicIds.length > 0;

  return (
    <section className="relation-panel" aria-labelledby="link-epic-title">
      <h3 id="link-epic-title">EPIC Relationship</h3>

      {hasParent ? (
        <div className="relation-list">
          {currentParentEpicIds.map((epicId) => (
            <div className="relation-row" key={epicId}>
              <span className="relation-id">{epicId}</span>
              <span className="relation-state">Current Parent</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-inline">No parent EPIC linked.</div>
      )}

      <div style={{ marginTop: "8px" }}>
        <label>
          <span style={{ fontSize: "0.85em", color: "#666" }}>Target EPIC ID:</span>
          <input
            className="field-input"
            disabled={isLinkingEpic}
            onChange={(event) => setSelectedEpicId(event.target.value)}
            placeholder="e.g. EPIC-004"
            style={{ marginTop: "4px", width: "100%" }}
            type="text"
            value={selectedEpicId}
          />
        </label>

        <div className="feature-workflow-button-row" style={{ marginTop: "8px" }}>
          <button
            className="mini-button validation-action"
            disabled={isLinkingEpic || !selectedEpicId.trim()}
            onClick={() => onLinkFeatureToEpic(item, "link", selectedEpicId.trim())}
            title="Link this FEAT to the selected EPIC"
            type="button"
          >
            {isLinkingEpic ? <Loader2 className="spin-icon" size={14} aria-hidden="true" /> : null}
            {isLinkingEpic ? "Linking..." : "Link"}
          </button>
          <button
            className="mini-button validation-action"
            disabled={isLinkingEpic || !selectedEpicId.trim() || !hasParent}
            onClick={() => onLinkFeatureToEpic(item, "relink", selectedEpicId.trim())}
            title="Relink this FEAT from its current EPIC to the selected EPIC"
            type="button"
          >
            {isLinkingEpic ? <Loader2 className="spin-icon" size={14} aria-hidden="true" /> : null}
            Relink
          </button>
          <button
            className="mini-button validation-action"
            disabled={isLinkingEpic || !hasParent}
            onClick={() => onLinkFeatureToEpic(item, "unlink")}
            title="Unlink this FEAT from its parent EPIC"
            type="button"
          >
            {isLinkingEpic ? <Loader2 className="spin-icon" size={14} aria-hidden="true" /> : null}
            Unlink
          </button>
        </div>

        {linkEpicResult ? (
          <p style={{ fontSize: "0.85em", color: "#166534", marginTop: "4px" }}>{linkEpicResult}</p>
        ) : null}
        {linkEpicError ? (
          <p style={{ fontSize: "0.85em", color: "#b91c1c", marginTop: "4px" }}>{linkEpicError}</p>
        ) : null}
      </div>
    </section>
  );
}
