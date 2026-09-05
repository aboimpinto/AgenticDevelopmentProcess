import type React from "react";
import { useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import type { WorkItemCard } from "@hepha/shared";
import { formatDateTime } from "./app-shell-utils.js";

export function EpicRefinementPanel({
  item,
  onSubmit,
  pendingAction,
}: {
  item: WorkItemCard;
  onSubmit: (item: WorkItemCard, request: string) => void;
  pendingAction: string | null;
}) {
  const [requestDraft, setRequestDraft] = useState("");
  const isSubmitting = pendingAction === `epic-refinement-${item.id}`;

  function submitRefinement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const request = requestDraft.trim();

    if (!request) {
      return;
    }

    onSubmit(item, request);
    setRequestDraft("");
  }

  return (
    <section className="epic-refinement-panel" aria-labelledby="epic-refinement-title">
      <header>
        <div>
          <span>
            <Sparkles size={14} aria-hidden="true" />
            EPIC Refinements
          </span>
          <h3 id="epic-refinement-title">Requested Changes</h3>
        </div>
        <strong>{item.epicRefinements.length}</strong>
      </header>

      {item.epicRefinements.length > 0 ? (
        <div className="epic-refinement-history">
          {item.epicRefinements
            .slice()
            .reverse()
            .map((refinement) => (
              <details className="epic-refinement-entry" key={refinement.id}>
                <summary>
                  <span>{refinement.summary}</span>
                  <em>{formatDateTime(refinement.createdAt)}</em>
                </summary>
                <div>
                  <strong>User request</strong>
                  <p>{refinement.request}</p>
                  <strong>Agent summary</strong>
                  <p>{refinement.summary}</p>
                  {refinement.changedSections.length > 0 ? (
                    <>
                      <strong>Changed sections</strong>
                      <ul>
                        {refinement.changedSections.map((section) => (
                          <li key={section}>{section}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              </details>
            ))}
        </div>
      ) : (
        <p className="epic-refinement-empty">No requested EPIC changes recorded yet.</p>
      )}

      <form className="epic-refinement-form" onSubmit={submitRefinement}>
        <label>
          <span>Refinement Request</span>
          <textarea
            disabled={isSubmitting}
            onChange={(event) => setRequestDraft(event.currentTarget.value)}
            placeholder="Describe what should change in this EPIC: add FEATs, clarify a FEAT, add acceptance criteria, adjust risks, or expand the scope details."
            rows={5}
            value={requestDraft}
          />
        </label>
        <button className="mini-button validation-action" disabled={isSubmitting || !requestDraft.trim()} type="submit">
          {isSubmitting ? <Loader2 className="spin-icon" size={14} aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
          {isSubmitting ? "Refining EPIC" : "Submit Refinement"}
        </button>
      </form>
    </section>
  );
}
