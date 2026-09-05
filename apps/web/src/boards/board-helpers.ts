import type { WorkItemCard } from "@hepha/shared";
import { getCompletedFeatureTimestamp } from "./board-types.js";

// ─── Card display helpers ────────────────────────────────────────────────

export function getEpicDeliveryStatus(item: WorkItemCard) {
  if (item.kind !== "epic") {
    return null;
  }

  if (item.epicState === "cancelled") {
    return {
      label: "Cancelled",
      status: "cancelled" as const,
      title: "Read from the EPIC document State field.",
    };
  }

  if (item.epicState === "completed") {
    return {
      label: "Completed",
      status: "completed" as const,
      title: "Read from the EPIC document State field.",
    };
  }

  if (item.epicState === "in-progress") {
    return {
      label: "In Progress",
      status: "in-progress" as const,
      title: "Read from the EPIC document State field.",
    };
  }

  return {
    label: "Not Started",
    status: "not-started" as const,
    title: item.epicState
      ? "Read from the EPIC document State field."
      : "The EPIC document State field is missing or unknown; defaulting to Not Started.",
  };
}

export function getRelationshipHint(item: WorkItemCard) {
  const hints: string[] = [];

  if (item.kind === "epic") {
    if (item.linkedFeatureIds.length > 0) {
      hints.push(`${item.linkedFeatureIds.length} linked FEAT${item.linkedFeatureIds.length === 1 ? "" : "s"}`);
    }

    if (item.missingFeatureIds.length > 0) {
      hints.push(`${item.missingFeatureIds.length} missing FEAT${item.missingFeatureIds.length === 1 ? "" : "s"}`);
    }
  } else if (item.kind === "feature") {
    if (item.linkedEpics.length > 0) {
      const epicNames = item.linkedEpics.map((rel) => rel.title || rel.externalId).join(", ");
      hints.push(`Parent: ${epicNames}`);
    } else if (item.linkedEpicIds.length > 0) {
      hints.push(`Parent: ${item.linkedEpicIds.join(", ")}`);
    }
  }

  return hints.length > 0 ? hints.join(" · ") : null;
}

export function centerSelectedItemInBoard(boardElement: HTMLElement, selectedCardElement: HTMLElement) {
  const boardRect = boardElement.getBoundingClientRect();
  const selectedCardRect = selectedCardElement.getBoundingClientRect();
  const selectedCardCenter =
    boardElement.scrollLeft + selectedCardRect.left - boardRect.left + selectedCardRect.width / 2;
  const maxScrollLeft = Math.max(0, boardElement.scrollWidth - boardElement.clientWidth);
  const targetScrollLeft = clamp(
    selectedCardCenter - boardElement.clientWidth / 2,
    0,
    maxScrollLeft,
  );

  boardElement.scrollTo({
    behavior: "smooth",
    left: targetScrollLeft,
    top: boardElement.scrollTop,
  });
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export { getCompletedFeatureTimestamp };
