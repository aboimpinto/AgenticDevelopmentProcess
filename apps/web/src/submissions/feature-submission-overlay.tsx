import type React from "react";
import { FileText, Loader2, Send, X } from "lucide-react";
import type { ProjectSummary, SubmitFeatureInput } from "@hepha/shared";

export type SubmitFeatForm = Omit<SubmitFeatureInput, "projectId">;

export const initialSubmitFeatForm: SubmitFeatForm = {
  title: "",
  summary: "",
  acceptanceCriteria: undefined,
  parentEpicId: undefined,
  parentEpicTitle: undefined,
  priority: undefined,
  externalReference: undefined,
  owner: undefined,
};

export function SubmitFeatOverlay({
  form,
  isSubmitting,
  onClose,
  onFormChange,
  onSubmit,
  project,
}: {
  form: SubmitFeatForm;
  isSubmitting: boolean;
  onClose: () => void;
  onFormChange: React.Dispatch<React.SetStateAction<SubmitFeatForm>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  project: ProjectSummary;
}) {
  function updateForm<Key extends keyof SubmitFeatForm>(key: Key, value: SubmitFeatForm[Key]) {
    onFormChange((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="submit-epic-backdrop" role="dialog" aria-modal="true" aria-label="Submit FEAT">
      <section className="submit-epic-modal">
        <header className="submit-epic-header">
          <div>
            <span className="submit-epic-kicker">
              <FileText size={15} aria-hidden="true" />
              FEAT
            </span>
            <h2>Submit FEAT</h2>
            <p>{project.name}</p>
          </div>
          <button className="icon-button" disabled={isSubmitting} onClick={onClose} type="button" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <form className="agent-form submit-epic-form" onSubmit={onSubmit}>
          <label className="submit-epic-wide">
            <span>Title</span>
            <input
              autoFocus
              disabled={isSubmitting}
              onChange={(event) => updateForm("title", event.target.value)}
              placeholder="Native Submit Feature Command"
              required
              type="text"
              value={form.title}
            />
          </label>

          <label className="submit-epic-wide">
            <span>Summary</span>
            <textarea
              disabled={isSubmitting}
              onChange={(event) => updateForm("summary", event.target.value)}
              placeholder="What should this FEAT achieve? Describe the scope clearly."
              required
              value={form.summary}
            />
          </label>

          <label className="submit-epic-wide">
            <span>Parent EPIC ID (optional)</span>
            <input
              disabled={isSubmitting}
              onChange={(event) => updateForm("parentEpicId", event.target.value || undefined)}
              placeholder="EPIC-004"
              type="text"
              value={form.parentEpicId ?? ""}
            />
          </label>

          <label className="submit-epic-wide">
            <span>Parent EPIC Title (optional)</span>
            <input
              disabled={isSubmitting}
              onChange={(event) => updateForm("parentEpicTitle", event.target.value || undefined)}
              placeholder="FEAT Planning Lifecycle"
              type="text"
              value={form.parentEpicTitle ?? ""}
            />
          </label>

          <div className="submit-epic-grid">
            <label>
              <span>Priority</span>
              <select
                disabled={isSubmitting}
                onChange={(event) => updateForm("priority", event.target.value || undefined)}
                value={form.priority ?? ""}
              >
                <option value="">—</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </label>

            <label>
              <span>Owner</span>
              <input
                disabled={isSubmitting}
                onChange={(event) => updateForm("owner", event.target.value || undefined)}
                placeholder="TBD"
                type="text"
                value={form.owner ?? ""}
              />
            </label>

            <label>
              <span>External Reference</span>
              <input
                disabled={isSubmitting}
                onChange={(event) => updateForm("externalReference", event.target.value || undefined)}
                placeholder="GitHub issue, client request"
                type="text"
                value={form.externalReference ?? ""}
              />
            </label>
          </div>

          <footer className="submit-epic-footer">
            <button className="secondary-button" disabled={isSubmitting} onClick={onClose} type="button">
              Cancel
            </button>
            <button className="primary-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? (
                <Loader2 className="spin-icon" size={15} aria-hidden="true" />
              ) : (
                <Send size={15} aria-hidden="true" />
              )}
              Submit FEAT
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
