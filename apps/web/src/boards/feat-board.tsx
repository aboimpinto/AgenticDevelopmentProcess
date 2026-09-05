import type { FeatBoardModel } from "@hepha/shared";
import { WorkItemCardView } from "./work-item-card.js";
import { InvalidSourceCard } from "./invalid-source-card.js";
import { AlertTriangle, FolderOpen, MoreHorizontal, Plus } from "lucide-react";

interface FeatBoardProps {
  boardModel: FeatBoardModel;
  isLoading: boolean;
  onAddFeat: () => void;
  onSelectItem: (itemId: string) => void;
  selectedItemId: string | null;
}

export function FeatBoard({
  boardModel,
  isLoading,
  onAddFeat,
  onSelectItem,
  selectedItemId,
}: FeatBoardProps) {
  return (
    <section className="kanban feat-board" aria-label="Selected project FEAT board">
      {!isLoading && boardModel.hasInvalidSources ? (
        <div className="board-empty-state" role="status">
          <AlertTriangle size={22} aria-hidden="true" />
          <span>{boardModel.sourceIssues.length} invalid FEAT source file(s) need inspection.</span>
        </div>
      ) : null}
      {boardModel.columns.map((column) => (
        <div className="kanban-column" key={column.id}>
          <div className="column-header">
            <h2>
              {column.title}
              <span>{column.count}</span>
            </h2>
            <button disabled type="button" aria-label={`${column.title} FEAT actions`}>
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
                isSelected={false}
                issue={issue}
                key={issue.id}
                onSelectIssue={() => {}}
              />
            ))}
            {!isLoading && column.count === 0 ? (
              <div className="empty-column">{column.id === "invalid-sources" ? "No invalid sources" : "No FEATs"}</div>
            ) : null}
            {column.id === "01_SUBMITTED" ? (
              <button className="add-epic-card" onClick={onAddFeat} type="button">
                <Plus size={17} aria-hidden="true" />
                <span>FEAT</span>
              </button>
            ) : null}
          </div>
        </div>
      ))}
      {!isLoading && boardModel.empty ? (
        <div className="board-empty-state" role="status">
          <FolderOpen size={22} aria-hidden="true" />
          <span>No FEAT documents found in the configured MemoryBank.</span>
        </div>
      ) : null}
    </section>
  );
}
