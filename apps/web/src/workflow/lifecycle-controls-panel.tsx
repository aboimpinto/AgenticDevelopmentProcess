/**
 * FEAT-056: Lifecycle controls panel.
 *
 * Renders supplied action descriptors as buttons.
 * The controller owns pending/busy state; this component renders what it receives.
 * Does NOT evaluate availability, eligibility, or policy predicates.
 */

import React from "react";
import { Loader2, GitBranch, CheckCircle2, X, Search, LayoutDashboard, ListChecks, Sparkles, Plus, BadgeCheck } from "lucide-react";

import type { WorkflowActionDescriptor, WorkflowActionId } from "./types.js";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface LifecycleControlsPanelProps {
  readonly actions: readonly WorkflowActionDescriptor[];
  readonly title?: string;
  readonly onAction: (actionId: WorkflowActionId) => void;
}

// ─── Icon mapping ───────────────────────────────────────────────────────────

function actionIcon(actionId: WorkflowActionId): React.ReactNode {
  const icons: Partial<Record<WorkflowActionId, React.ReactNode>> = {
    "start-implementing": <GitBranch size={14} aria-hidden="true" />,
    "continue-implementing": <GitBranch size={14} aria-hidden="true" />,
    "complete-feature": <CheckCircle2 size={14} aria-hidden="true" />,
    "cancel-workflow": <X size={14} aria-hidden="true" />,
    "check-ui-requirement": <Search size={14} aria-hidden="true" />,
    "create-ui-requirements": <LayoutDashboard size={14} aria-hidden="true" />,
    "refine-feature": <ListChecks size={14} aria-hidden="true" />,
    "record-user-code-review": <BadgeCheck size={14} aria-hidden="true" />,
    "submit-finding": <Plus size={14} aria-hidden="true" />,
  };
  return icons[actionId] ?? <Sparkles size={14} aria-hidden="true" />;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function LifecycleControlsPanel({
  actions,
  title = "Workflow Actions",
  onAction,
}: LifecycleControlsPanelProps) {
  const available = actions.filter((a) => a.available);
  if (available.length === 0 && !actions.some((a) => a.busy || a.completed)) {
    return null;
  }

  return (
    <section className="validation-panel" aria-labelledby="lc-title">
      <div className="validation-heading">
        <strong id="lc-title">{title}</strong>
      </div>
      <div className="feature-workflow-actions" role="group" aria-label="Workflow action buttons">
        {actions.map((action) => (
          <button
            key={action.id}
            className={action.completed ? "mini-button validation-action validation-action-complete" : "mini-button validation-action"}
            disabled={!action.available || action.busy || action.completed}
            onClick={() => onAction(action.id)}
            type="button"
            aria-busy={action.busy}
            title={action.reason ?? action.label}
          >
            {action.busy ? (
              <Loader2 className="spin-icon" size={14} aria-hidden="true" />
            ) : (
              actionIcon(action.id)
            )}
            {action.busy ? `${action.label}...` : action.label}
          </button>
        ))}
      </div>
      {actions.filter((a) => !a.available && a.reason).length > 0 && (
        <div className="readiness-reasons" role="status" aria-live="polite">
          {actions
            .filter((a) => !a.available && a.reason)
            .map((action) => (
              <p key={action.id} className="readiness-reason">
                {action.reason}
              </p>
            ))}
        </div>
      )}
    </section>
  );
}
