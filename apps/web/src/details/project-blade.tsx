import React from "react";
import { ChevronRight, Database, FolderOpen, HardDrive, Plus, X } from "lucide-react";
import { SummaryTile } from "./summary-tile.js";
import { resolveMemoryBankPreview } from "./path-utils.js";
import type { CreateProjectInput, ProjectSummary } from "@hepha/shared";

/**
 * ProjectBlade — displays the selected project summary or the "Add Project" form.
 *
 * Shows project summary when a project is selected, and a form to create a
 * new project when isAddingProject or no project is selected.
 *
 * @see FEAT-055 Phase 5 — project-blade module
 */
export function ProjectBlade({
  form,
  isAddingProject,
  isCreating,
  onClose,
  onCreateProject,
  onFormChange,
  selectedProject,
}: {
  form: CreateProjectInput;
  isAddingProject: boolean;
  isCreating: boolean;
  onClose: () => void;
  onCreateProject: (event: React.FormEvent<HTMLFormElement>) => void;
  onFormChange: React.Dispatch<React.SetStateAction<CreateProjectInput>>;
  selectedProject: ProjectSummary | null;
}) {
  const resolvedMemoryBankPath = resolveMemoryBankPreview(form.rootPath, form.memoryBankPath);
  const shouldShowProjectSummary = Boolean(selectedProject && !isAddingProject);
  const shouldShowProjectForm = isAddingProject || !selectedProject;

  return (
    <aside className="detail-panel">
      <div className="detail-scroll">
        <div className="detail-header">
          <div className="breadcrumb">
            <span>PROJECT</span>
            <ChevronRight size={16} aria-hidden="true" />
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Close blade">
            <X size={18} />
          </button>
        </div>

        <h2>{shouldShowProjectSummary && selectedProject ? selectedProject.name : "Add Project"}</h2>

        {shouldShowProjectSummary && selectedProject ? <ProjectSummaryPanel project={selectedProject} /> : null}

        {shouldShowProjectForm ? (
          <form className="agent-form" onSubmit={onCreateProject}>
            <label>
              <span>Project Name</span>
              <input
                onChange={(event) =>
                  onFormChange((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Example Project"
                required
                type="text"
                value={form.name}
              />
            </label>

            <label>
              <span>Project Root</span>
              <input
                onChange={(event) =>
                  onFormChange((current) => ({ ...current, rootPath: event.target.value }))
                }
                placeholder="/workspace/example-project"
                required
                type="text"
                value={form.rootPath}
              />
            </label>

            <label>
              <span>MemoryBank Path</span>
              <input
                onChange={(event) =>
                  onFormChange((current) => ({ ...current, memoryBankPath: event.target.value }))
                }
                placeholder="MemoryBank or /workspace/example-memory-bank"
                required
                type="text"
                value={form.memoryBankPath}
              />
            </label>

            <div className="model-note">
              <Database size={14} aria-hidden="true" />
              Enter a path relative to the project root or an absolute full path.
            </div>

            {resolvedMemoryBankPath ? (
              <div className="path-preview">
                <span>Resolved MemoryBank</span>
                <strong>{resolvedMemoryBankPath}</strong>
              </div>
            ) : null}

            <button className="submit-button" disabled={isCreating} type="submit">
              <Plus size={15} aria-hidden="true" />
              {isCreating ? "Saving" : "Save Project"}
            </button>
          </form>
        ) : null}
      </div>
    </aside>
  );
}

/**
 * ProjectSummaryPanel — renders the selected project details summary.
 *
 * Shows counts for EPICs and Features, MemoryBank path, and detected stack.
 *
 * @internal Used by ProjectBlade.
 */
export function ProjectSummaryPanel({ project }: { project: ProjectSummary }) {
  const totalFeatures =
    project.counts["01_SUBMITTED"] +
    project.counts["02_READY_TO_DEVELOP"] +
    project.counts["03_IN_PROGRESS"] +
    project.counts["04_COMPLETED"] +
    project.counts["05_CANCELLED"];

  return (
    <section className="active-run project-panel" aria-label="Selected project">
      <div className="active-run-header">
        <div>
          <span className="agent-icon">
            <HardDrive size={15} aria-hidden="true" />
          </span>
          <h3>
            Project source <em>{project.defaultBranch}</em>
          </h3>
        </div>
        <strong>{project.needsInitialization ? "Setup" : "Ready"}</strong>
      </div>

      <div className="summary-grid">
        <SummaryTile label="Epics" value={`${project.counts["00_EPICS"]}`} />
        <SummaryTile label="Features" value={`${totalFeatures}`} />
        <SummaryTile label="MemoryBank" value={project.memoryBankRelativePath} />
        <SummaryTile label="Stack" value={project.detectedStack.join(", ")} />
      </div>

      <div className="file-meta">
        <span>
          <FolderOpen size={14} aria-hidden="true" />
          Canonical {project.rootPath}
        </span>
        {project.originalRootPathInput ? (
          <span>
            <FolderOpen size={14} aria-hidden="true" />
            Entered {project.originalRootPathInput}
          </span>
        ) : null}
        <span>
          <Database size={14} aria-hidden="true" />
          Canonical {project.memoryBankPath}
        </span>
        {project.originalMemoryBankPathInput ? (
          <span>
            <Database size={14} aria-hidden="true" />
            Entered {project.originalMemoryBankPathInput}
          </span>
        ) : null}
      </div>
    </section>
  );
}
