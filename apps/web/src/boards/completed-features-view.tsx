import type { WorkItemCard } from "@hepha/shared";
import { getCompletedFeatureTimestamp } from "./board-types.js";
import { formatDateTime } from "./board-helpers.js";
import { ChevronLeft, CheckCircle2, FolderOpen } from "lucide-react";

interface CompletedFeaturesViewProps {
  completedFeatures: WorkItemCard[];
  isLoading: boolean;
  onOpenWorkBoard: () => void;
  onSelectFeature: (itemId: string) => void;
  selectedItemId: string | null;
}

export function CompletedFeaturesView({
  completedFeatures,
  isLoading,
  onOpenWorkBoard,
  onSelectFeature,
  selectedItemId,
}: CompletedFeaturesViewProps) {
  return (
    <section className="completed-page" aria-label="Completed FEATs">
      <div className="completed-page-header">
        <button className="back-link" onClick={onOpenWorkBoard} type="button">
          <ChevronLeft size={16} aria-hidden="true" />
          Go to Work Board
        </button>
        <div>
          <span>Completed</span>
          <h2>Completed FEATs</h2>
          <p>All completed feature work for the selected project, newest first.</p>
        </div>
        <strong>{completedFeatures.length}</strong>
      </div>

      {!isLoading && completedFeatures.length === 0 ? (
        <div className="completed-empty-state">
          <CheckCircle2 size={22} aria-hidden="true" />
          <span>No completed FEATs found for this project.</span>
        </div>
      ) : null}

      <div className="completed-feature-list">
        {completedFeatures.map((item) => (
          <button
            className={item.id === selectedItemId ? "completed-feature-row selected" : "completed-feature-row"}
            key={item.id}
            onClick={() => onSelectFeature(item.id)}
            type="button"
          >
            <span className="completed-feature-id">{item.externalId}</span>
            <div>
              <strong>{item.title || item.folderName}</strong>
              <small>{item.summary || "Specification document not found."}</small>
            </div>
            <span className="completed-feature-date">
              {formatDateTime(getCompletedFeatureTimestamp(item))}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
