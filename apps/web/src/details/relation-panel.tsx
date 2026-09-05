import type { WorkItemRelation } from "@hepha/shared";

interface RelationPanelProps {
  emptyLabel: string;
  onSelectItem: (itemId: string) => void;
  relations: WorkItemRelation[];
  title: string;
}

export function RelationPanel({
  emptyLabel,
  onSelectItem,
  relations,
  title,
}: RelationPanelProps) {
  return (
    <section
      className="relation-panel"
      aria-labelledby={`${title.replace(/\s+/g, "-").toLowerCase()}-title`}
    >
      <h3 id={`${title.replace(/\s+/g, "-").toLowerCase()}-title`}>{title}</h3>
      {relations.length > 0 ? (
        <div className="relation-list">
          {relations.map((relation) => (
            <button
              className="relation-row"
              key={relation.id}
              onClick={() => onSelectItem(relation.id)}
              type="button"
            >
              <span className="relation-id">{relation.externalId}</span>
              <span className="relation-title">{relation.title}</span>
              <span className="relation-state">{relation.stateLabel}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-inline">{emptyLabel}</div>
      )}
    </section>
  );
}
