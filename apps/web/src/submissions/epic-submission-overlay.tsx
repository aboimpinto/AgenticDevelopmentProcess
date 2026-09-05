import type React from "react";
import { BookOpen, Loader2, Send, X } from "lucide-react";
import type { ProjectSummary, SubmitEpicInput } from "@hepha/shared";

export type SubmitEpicForm = Omit<SubmitEpicInput, "projectId">;

export const initialSubmitEpicForm: SubmitEpicForm = {
  description: "",
  externalReference: "",
  ideaText: "",
  mode: "structured",
  owner: "",
  priority: "High",
  problemStatement: "",
  successCriteria: "",
  targetCompletion: "",
  title: "",
};

export function SubmitEpicOverlay({
  form,
  isSubmitting,
  onClose,
  onFormChange,
  onSubmit,
  project,
}: {
  form: SubmitEpicForm;
  isSubmitting: boolean;
  onClose: () => void;
  onFormChange: React.Dispatch<React.SetStateAction<SubmitEpicForm>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  project: ProjectSummary;
}) {
  const isIdeaMode = form.mode === "idea";

  function updateForm<Key extends keyof SubmitEpicForm>(key: Key, value: SubmitEpicForm[Key]) {
    onFormChange((current) => ({ ...current, [key]: value }));
  }

  function setMode(mode: NonNullable<SubmitEpicForm["mode"]>) {
    onFormChange((current) => ({ ...current, mode }));
  }

  return (
    <div className="submit-epic-backdrop" role="dialog" aria-modal="true" aria-label="Submit EPIC">
      <section className="submit-epic-modal">
        <header className="submit-epic-header">
          <div>
            <span className="submit-epic-kicker">
              <BookOpen size={15} aria-hidden="true" />
              EPIC
            </span>
            <h2>Submit EPIC</h2>
            <p>{project.name}</p>
          </div>
          <button className="icon-button" disabled={isSubmitting} onClick={onClose} type="button" aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <form className="agent-form submit-epic-form" onSubmit={onSubmit}>
          <label className="submit-epic-mode-control">
            <span>Submission Mode</span>
            <select
              disabled={isSubmitting}
              onChange={(event) => setMode(event.target.value as NonNullable<SubmitEpicForm["mode"]>)}
              value={form.mode}
            >
              <option value="structured">Structured fields</option>
              <option value="idea">Idea text</option>
            </select>
            <p>
              Use structured fields when the EPIC is already clear, or idea text when Hepha should draft the EPIC from
              your rough description.
            </p>
          </label>

          {isIdeaMode ? (
            <label className="submit-epic-wide">
              <span>Idea</span>
              <textarea
                autoFocus
                className="submit-epic-idea"
                disabled={isSubmitting}
                onChange={(event) => updateForm("ideaText", event.target.value)}
                placeholder="Describe the EPIC as best you can. Include the pain, desired outcome, users, constraints, links, risks, or rough feature ideas if you know them."
                required
                value={form.ideaText}
              />
            </label>
          ) : (
            <>
              <label className="submit-epic-wide">
                <span>Title</span>
                <input
                  autoFocus
                  disabled={isSubmitting}
                  onChange={(event) => updateForm("title", event.target.value)}
                  placeholder="Persistent Lessons Learned Memory"
                  required
                  type="text"
                  value={form.title}
                />
              </label>

              <label className="submit-epic-wide">
                <span>Executive Summary</span>
                <textarea
                  disabled={isSubmitting}
                  onChange={(event) => updateForm("description", event.target.value)}
                  placeholder="What should this EPIC achieve, who benefits, and why does it matter?"
                  required
                  value={form.description}
                />
              </label>

              <label className="submit-epic-wide">
                <span>Problem Statement</span>
                <textarea
                  disabled={isSubmitting}
                  onChange={(event) => updateForm("problemStatement", event.target.value)}
                  placeholder="Current pain, missed opportunity, or workflow limitation."
                  value={form.problemStatement}
                />
              </label>

              <label className="submit-epic-wide">
                <span>Success Criteria</span>
                <textarea
                  disabled={isSubmitting}
                  onChange={(event) => updateForm("successCriteria", event.target.value)}
                  placeholder="One measurable criterion per line."
                  value={form.successCriteria}
                />
              </label>

              <div className="submit-epic-grid">
                <label>
                  <span>Priority</span>
                  <select
                    disabled={isSubmitting}
                    onChange={(event) => updateForm("priority", event.target.value as SubmitEpicForm["priority"])}
                    value={form.priority}
                  >
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
                    onChange={(event) => updateForm("owner", event.target.value)}
                    placeholder="TBD"
                    type="text"
                    value={form.owner}
                  />
                </label>

                <label>
                  <span>Target Completion</span>
                  <input
                    disabled={isSubmitting}
                    onChange={(event) => updateForm("targetCompletion", event.target.value)}
                    placeholder="TBD"
                    type="text"
                    value={form.targetCompletion}
                  />
                </label>

                <label>
                  <span>External Reference</span>
                  <input
                    disabled={isSubmitting}
                    onChange={(event) => updateForm("externalReference", event.target.value)}
                    placeholder="GitHub issue, client request, or N/A"
                    type="text"
                    value={form.externalReference}
                  />
                </label>
              </div>
            </>
          )}

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
              {isIdeaMode ? "Generate EPIC" : "Submit EPIC"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
