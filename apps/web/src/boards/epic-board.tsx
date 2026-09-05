import type { EpicBoardModel } from "@hepha/shared";
import { WorkItemCardView } from "./work-item-card.js";
import { InvalidSourceCard } from "./invalid-source-card.js";
import { AlertTriangle, FolderOpen, MoreHorizontal, Plus } from "lucide-react";

interface EpicBoardProps {
  boardModel: EpicBoardModel;
  canAddEpic: boolean;
  isLoading: boolean;
  onAddEpic: () => void;
  onSelectItem: (itemId: string) => void;
  onSelectSourceIssue: (issueId: string) => void;
  selectedItemId: string | null;
  selectedSourceIssueId: string | null;
}

export function EpicBoard({
  boardModel,
  canAddEpic,
  isLoading,
  onAddEpic,
  onSelectItem,
  onSelectSourceIssue,
  selectedItemId,
  selectedSourceIssueId,
}: EpicBoardProps) {
  return (
    <section className="kanban epic-board" aria-label="Selected project EPIC board">
      {!isLoading && boardModel.failed ? (
        <div className="board-empty-state" role="status">
          <AlertTriangle size={22} aria-hidden="true" />
          <span>EPIC scan failed: {boardModel.message ?? "Hepha could not read the configured EPIC folder."}</span>
        </div>
      ) : null}
      {!isLoading && boardModel.hasInvalidSources ? (
        <div className="board-empty-state" role="status">
          <AlertTriangle size={22} aria-hidden="true" />
          <span>{boardModel.sourceIssues.length} invalid EPIC source file(s) need inspection.</span>
        </div>
      ) : null}
      {boardModel.columns.map((column) => (
        <div className="kanban-column" key={column.id}>
          <div className="column-header">
            <h2>
              {column.title}
              <span>{column.count}</span>
            </h2>
            <button disabled type="button" aria-label={`${column.title} EPIC actions`}>
              <MoreHorizontal size={17} />
            </button>
          </div>
          <div className="card-stack">
            {column.items.map((item) => (
              <WorkItemCardView
                isSelected={item.id === selectedItemId}
                item={item}
                key={item.id}
                onSelectItem={onSelectItem}
              />
            ))}
            {column.sourceIssues.map((issue) => (
              <InvalidSourceCard
                isSelected={issue.id === selectedSourceIssueId}
                issue={issue}
                key={issue.id}
                onSelectIssue={onSelectSourceIssue}
              />
            ))}
            {!isLoading && column.count === 0 ? (
              <div className="empty-column">{column.id === "invalid-sources" ? "No invalid sources" : "No epics"}</div>
            ) : null}
            {column.id === "not-started" ? (
              <button className="add-epic-card" disabled={!canAddEpic} onClick={onAddEpic} type="button">
                <Plus size={17} aria-hidden="true" />
                <span>EPIC</span>
              </button>
            ) : null}
          </div>
        </div>
      ))}
      {!isLoading && boardModel.empty ? (
        <div className="board-empty-state" role="status">
          <FolderOpen size={22} aria-hidden="true" />
          <span>No EPIC documents found in the configured MemoryBank EPIC folder.</span>
        </div>
      ) : null}
    </section>
  );
}
