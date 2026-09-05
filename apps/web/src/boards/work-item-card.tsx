import type { WorkItemCard } from "@hepha/shared";
import { getEpicDeliveryStatus, getRelationshipHint } from "./board-helpers.js";
import { WorkflowPositionCardStack } from "../workflow-position-card-stack.js";
import { ValidationBadges } from "./board-validation.js";
import type { Ref } from "react";

interface WorkItemCardViewProps {
  cardRef?: Ref<HTMLElement>;
  isSelected: boolean;
  item: WorkItemCard;
  onSelectItem: (itemId: string) => void;
}

export function WorkItemCardView({
  cardRef,
  isSelected,
  item,
  onSelectItem,
}: WorkItemCardViewProps) {
  function handleKeyboardSelect(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectItem(item.id);
    }
  }

  const epicDelivery = getEpicDeliveryStatus(item);
  const relationshipHint = getRelationshipHint(item);
  const cardClassName = [
    "feature-card",
    isSelected ? "selected-card" : null,
    epicDelivery ? `epic-delivery-${epicDelivery.status}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article
      className={cardClassName}
      onClick={() => onSelectItem(item.id)}
      onKeyDown={handleKeyboardSelect}
      ref={cardRef}
      role="button"
      tabIndex={0}
    >
      <div className="card-topline">
        <span className={isSelected ? "card-id active-id" : "card-id"}>{item.externalId}</span>
        <div className="card-badges">
          <span className={item.kind === "epic" ? "badge badge-live" : "badge badge-muted"}>
            {item.kind.toUpperCase()}
          </span>
          {epicDelivery ? (
            <span className={`badge epic-delivery-badge ${epicDelivery.status}`} title={epicDelivery.title}>
              {epicDelivery.label}
            </span>
          ) : null}
        </div>
      </div>

      <h3>{item.title || item.folderName}</h3>
      <p className="card-activity">{item.summary || "Specification document not found."}</p>
      {relationshipHint ? <p className="card-activity">Relationships: {relationshipHint}</p> : null}

      <ValidationBadges item={item} />
      <WorkflowPositionCardStack item={item} />
    </article>
  );
}
