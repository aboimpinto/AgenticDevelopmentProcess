import type { WorkItemCard } from "@hepha/shared";
import { COLUMNS } from "./board-types.js";
import { getColumnItems, getColumnDisplayItems } from "./board-selectors.js";
import { centerSelectedItemInBoard } from "./board-helpers.js";
import { WorkItemCardView } from "./work-item-card.js";
import { MoreHorizontal, FolderOpen } from "lucide-react";
import { useRef, useLayoutEffect } from "react";

interface WorkBoardProps {
  isLoading: boolean;
  onOpenCompletedFeatures: () => void;
  onSelectItem: (itemId: string) => void;
  selectedItemId: string | null;
  shouldCenterSelectedItem: boolean;
  totalItems: number;
  workItems: WorkItemCard[];
}

export function WorkBoard({
  isLoading,
  onOpenCompletedFeatures,
  onSelectItem,
  selectedItemId,
  shouldCenterSelectedItem,
  totalItems,
  workItems,
}: WorkBoardProps) {
  const boardRef = useRef<HTMLElement | null>(null);
  const selectedCardRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!shouldCenterSelectedItem || !selectedItemId) {
      return undefined;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      const boardElement = boardRef.current;
      const selectedCardElement = selectedCardRef.current;

      if (!boardElement || !selectedCardElement) {
        return;
      }

      centerSelectedItemInBoard(boardElement, selectedCardElement);
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [selectedItemId, shouldCenterSelectedItem]);

  return (
    <section className="kanban" ref={boardRef} aria-label="MemoryBank work board">
      {COLUMNS.map((column) => {
        const columnItems = getColumnItems(workItems, column.id);
        const { displayItems, hiddenCount: hiddenCompletedCount } = getColumnDisplayItems(workItems, column.id);
        const hasCompletedItems = column.id === "04_COMPLETED" && columnItems.length > 0;

        return (
          <div className="kanban-column" key={column.id}>
            <div className="column-header">
              <h2>
                {column.title}
                <span>{columnItems.length}</span>
              </h2>
              <button
                disabled={!hasCompletedItems}
                onClick={hasCompletedItems ? onOpenCompletedFeatures : undefined}
                title={hasCompletedItems ? "Open completed FEATs" : `${column.title} actions`}
                type="button"
                aria-label={hasCompletedItems ? "Open completed FEATs" : `${column.title} actions`}
              >
                <MoreHorizontal size={17} />
              </button>
            </div>
            <div className="card-stack">
              {displayItems.map((item) => (
                <WorkItemCardView
                  isSelected={item.id === selectedItemId}
                  item={item}
                  key={item.id}
                  onSelectItem={onSelectItem}
                  cardRef={item.id === selectedItemId ? selectedCardRef : undefined}
                />
              ))}
              {hiddenCompletedCount > 0 ? (
                <button className="completed-overflow-card" onClick={onOpenCompletedFeatures} type="button">
                  <span>+{hiddenCompletedCount}</span>
                  <strong>More completed FEATs</strong>
                  <small>Open the completed history</small>
                </button>
              ) : null}
              {!isLoading && columnItems.length === 0 ? (
                <div className="empty-column">No cards</div>
              ) : null}
            </div>
          </div>
        );
      })}
      {!isLoading && totalItems === 0 ? (
        <div className="board-empty-state">
          <FolderOpen size={22} aria-hidden="true" />
          <span>No active EPIC or FEAT cards found in this project MemoryBank.</span>
        </div>
      ) : null}
    </section>
  );
}
