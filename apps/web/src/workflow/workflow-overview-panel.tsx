/**
 * FEAT-056: Workflow overview panel.
 *
 * Displays authoritative readiness state, active run status, and last run trace.
 * Receives a pre-built OverviewDisplay model — does not evaluate policy.
 */

import React from "react";
import { AlertTriangle, BadgeCheck, Loader2 } from "lucide-react";

import { normalizeDisplayWhitespace } from "../presentation/display-text.js";
import type { OverviewDisplay } from "./workflow-presentation.js";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface WorkflowOverviewPanelProps {
  readonly overview: OverviewDisplay;
}

// ─── Component ──────────────────────────────────────────────────────────────

type WorkflowMessageField = { readonly label: string; readonly value: string };

const DENSE_WORKFLOW_FIELD_LABELS = [
  "Last run",
  "Latest report",
  "Current finding",
  "Location",
  "Finding",
  "Required change",
  "Decision requirement",
] as const;

function WorkflowMessage({ message }: { readonly message: string }) {
  const displayMessage = normalizeDisplayWhitespace(message);

  if (displayMessage.includes("## Previous Workflow Failure Brief")) {
    const fields = displayMessage
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*-\s*/, "").trim())
      .filter((line) => line.includes(":"))
      .map(toWorkflowMessageField);

    return (
      <section className="workflow-failure-brief" aria-label="Workflow failure details">
        <strong>Implementation stopped</strong>
        <WorkflowMessageFieldList fields={fields} />
      </section>
    );
  }

  const { fields, unstructuredText } = splitDenseWorkflowMessage(displayMessage);

  if (fields.length === 0) {
    return <p className="workflow-message-text">{displayMessage}</p>;
  }

  return (
    <section className="workflow-message-details" aria-label="Workflow details">
      {unstructuredText ? <p className="workflow-message-text">{unstructuredText}</p> : null}
      <WorkflowMessageFieldList fields={fields} />
    </section>
  );
}

function WorkflowMessageFieldList({ fields }: { readonly fields: readonly WorkflowMessageField[] }) {
  return (
    <dl>
      {fields.map((field, index) => (
        <div key={`${field.label}-${index}`}>
          <dt>{field.label}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function toWorkflowMessageField(line: string): WorkflowMessageField {
  const separator = line.indexOf(":");
  return {
    label: line.slice(0, separator).replace(/^\*+|\*+$/g, "").trim(),
    value: line.slice(separator + 1).replace(/^\*+|\*+$/g, "").trim(),
  };
}

function splitDenseWorkflowMessage(message: string): {
  readonly fields: readonly WorkflowMessageField[];
  readonly unstructuredText: string;
} {
  const labelPattern = DENSE_WORKFLOW_FIELD_LABELS.join("|");
  const pattern = new RegExp(
    `(?:^|\\s)(?:[-*]\\s+)?(?:\\*{1,2})?(${labelPattern})(?:\\*{1,2})?\\s*:`,
    "gi",
  );
  const matches = [...message.matchAll(pattern)];

  if (matches.length === 0) {
    return { fields: [], unstructuredText: message };
  }

  const fields = matches.map((match, index) => {
    const nextMatch = matches[index + 1];
    const valueStart = (match.index ?? 0) + match[0].length;
    const valueEnd = nextMatch?.index ?? message.length;
    return { label: match[1], value: message.slice(valueStart, valueEnd).trim() };
  });

  return {
    fields,
    unstructuredText: message.slice(0, matches[0].index ?? 0).trim(),
  };
}

export function WorkflowOverviewPanel({
  overview,
}: WorkflowOverviewPanelProps) {
  if (overview.readinessLabel === "Not available") {
    return (
      <section className="validation-panel" aria-labelledby="wo-title">
        <div className="validation-heading">
          <BadgeCheck size={15} aria-hidden="true" />
          <strong id="wo-title">Workflow</strong>
        </div>
        <p className="empty-inline">No workflow data available for this item.</p>
      </section>
    );
  }

  const icon =
    overview.readinessIcon === "success" ? (
      <BadgeCheck size={15} aria-hidden="true" />
    ) : overview.readinessIcon === "blocked" ? (
      <AlertTriangle size={15} aria-hidden="true" />
    ) : (
      <BadgeCheck size={15} aria-hidden="true" />
    );

  return (
    <section
      className={`validation-panel ${
        overview.readinessIcon === "blocked" ? "validation-panel-blocked" : ""
      }`}
      aria-labelledby="wo-title"
    >
      <div className="validation-heading">
        <span>
          {icon}
          <strong id="wo-title">Current workflow</strong>
        </span>
        <em>{overview.readinessLabel}</em>
      </div>

      {overview.workflowMessage && <WorkflowMessage message={overview.workflowMessage} />}

      {(overview.blockingReasons?.length ?? 0) > 0 && (
        <div className="readiness-reasons" role="status" aria-live="polite">
          {overview.blockingReasons!.map((reason, index) => (
            <p className="readiness-reason" key={`${reason.code}-${index}`}>
              {reason.detail ? <strong>{reason.detail}</strong> : null}
              {reason.detail ? " " : null}
              {reason.message}
            </p>
          ))}
        </div>
      )}

      {overview.hasActiveRun && (
        <div className="workflow-run-status" role="status" aria-live="polite">
          <Loader2 className="spin-icon" size={14} aria-hidden="true" />
          <strong>{overview.activeRunCommand ?? "Running"}</strong>
          {overview.activeRunStep && (
            <span>{overview.activeRunStep}</span>
          )}
        </div>
      )}

      {overview.hasActiveRun && overview.workflowSteps && overview.workflowSteps.length > 0 && (
        <section className="workflow-run-steps" aria-label="Start Feature workflow progress">
          <strong>Workflow progress</strong>
          <ol>
            {overview.workflowSteps.map((step) => (
              <li className={`workflow-run-step workflow-run-step-${step.status}`} key={step.id}>
                <span>{step.label}</span>
                <em>{step.status}</em>
                {step.detail && <small>{step.detail}</small>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {overview.lastRunStatus && (
        <div className="workflow-last-run">
          <small>
            Last run: {overview.lastRunCommand ?? "Unknown"} &mdash;{" "}
            {overview.lastRunStatus}
            {overview.lastRunSummary && (
              <>
                :{" "}
                <span className="workflow-last-run-summary">
                  {normalizeDisplayWhitespace(overview.lastRunSummary)}
                </span>
              </>
            )}
          </small>
        </div>
      )}
    </section>
  );
}
