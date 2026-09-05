import { Database, GitBranch, HardDrive, Plus, RefreshCw, Terminal } from "lucide-react";
import type { ProjectSummary, WorkItemCard } from "@hepha/shared";
import { formatDateTime } from "../boards/board-helpers.js";
import { calculateProjectRuntimeStats, formatDurationGain, formatNullableDuration, getProjectFeatureCount, getProjectOpenFeatureCount } from "./project-runtime-analytics.js";

export function ProjectsView({
  isLoading,
  onAddProject,
  onInitializeProject,
  onOpenBoard,
  onRefresh,
  onSelectProject,
  pendingActionId,
  projects,
  projectWorkItems,
  selectedProjectId,
}: {
  isLoading: boolean;
  onAddProject: () => void;
  onInitializeProject: (projectId: string) => void;
  onOpenBoard: (projectId: string) => void;
  onRefresh: () => void;
  onSelectProject: (projectId: string) => void;
  pendingActionId: string | null;
  projects: ProjectSummary[];
  projectWorkItems: WorkItemCard[];
  selectedProjectId: string | null;
}) {
  return (
    <section className="projects-page" aria-label="Projects">
      <div className="projects-header">
        <div>
          <span>Project Registry</span>
          <h2>Projects</h2>
          <p>Registered local repositories, MemoryBank paths, workflow counts, and operational health.</p>
        </div>
        <div className="projects-header-actions">
          <button className="toolbar-action" onClick={onRefresh} type="button">
            <RefreshCw size={15} aria-hidden="true" />
            Refresh
          </button>
          <button className="primary-button project-add-button" onClick={onAddProject} type="button">
            <Plus size={15} aria-hidden="true" />
            Add Project
          </button>
        </div>
      </div>

      {projects.length === 0 && !isLoading ? (
        <div className="projects-empty-state">
          <HardDrive size={22} aria-hidden="true" />
          <div>
            <strong>No projects registered</strong>
            <span>Add a local project root and MemoryBank path to start using Hepha.</span>
          </div>
        </div>
      ) : null}

      <div className="projects-list">
        {projects.map((project) => {
          const isSelected = project.id === selectedProjectId;

          return (
            <ProjectCard
              isInitializing={pendingActionId === `init-${project.id}`}
              isSelected={isSelected}
              key={project.id}
              onInitializeProject={onInitializeProject}
              onOpenBoard={onOpenBoard}
              onSelectProject={onSelectProject}
              project={project}
              projectWorkItems={isSelected ? projectWorkItems : null}
            />
          );
        })}
      </div>
    </section>
  );
}

export function ProjectCard({
  isInitializing,
  isSelected,
  onInitializeProject,
  onOpenBoard,
  onSelectProject,
  project,
  projectWorkItems,
}: {
  isInitializing: boolean;
  isSelected: boolean;
  onInitializeProject: (projectId: string) => void;
  onOpenBoard: (projectId: string) => void;
  onSelectProject: (projectId: string) => void;
  project: ProjectSummary;
  projectWorkItems: WorkItemCard[] | null;
}) {
  const totalFeatures = getProjectFeatureCount(project);
  const openFeatures = getProjectOpenFeatureCount(project);
  const runtimeStats = projectWorkItems ? calculateProjectRuntimeStats(projectWorkItems) : null;
  const stackLabel = project.detectedStack.length > 0 ? project.detectedStack.join(", ") : "Unknown";

  return (
    <article className={isSelected ? "project-card project-card-selected" : "project-card"}>
      <div className="project-card-header">
        <div>
          <span className="agent-icon">
            <HardDrive size={15} aria-hidden="true" />
          </span>
          <div>
            <h3>{project.name}</h3>
            <span>{project.needsInitialization ? "Needs MemoryBank setup" : "Ready"}</span>
          </div>
        </div>
      </div>

      <div className="project-card-body">
        <div className="project-card-main">
          <dl className="project-path-list">
            <div>
              <dt>Canonical Project Root</dt>
              <dd title={project.rootPath}>{project.rootPath}</dd>
            </div>
            <div>
              <dt>Canonical MemoryBank</dt>
              <dd title={project.memoryBankPath}>{project.memoryBankPath}</dd>
            </div>
            {project.originalRootPathInput ? (
              <div>
                <dt>Entered Project Root</dt>
                <dd title={project.originalRootPathInput}>{project.originalRootPathInput}</dd>
              </div>
            ) : null}
            {project.originalMemoryBankPathInput ? (
              <div>
                <dt>Entered MemoryBank</dt>
                <dd title={project.originalMemoryBankPathInput}>{project.originalMemoryBankPathInput}</dd>
              </div>
            ) : null}
          </dl>

          <div className="project-meta-strip">
            <span title={project.defaultBranch}>
              <GitBranch size={13} aria-hidden="true" />
              {project.defaultBranch}
            </span>
            <span title={project.memoryBankRelativePath}>
              <Database size={13} aria-hidden="true" />
              {project.memoryBankRelativePath}
            </span>
            <span title={stackLabel}>
              <Terminal size={13} aria-hidden="true" />
              {stackLabel}
            </span>
          </div>
        </div>

        <div className="project-card-metrics">
          <section className="project-metric-group" aria-label={`${project.name} portfolio status`}>
            <header className="project-metric-group-heading">
              <div>
                <strong>Portfolio status</strong>
                <span>Current delivery queue and lifecycle distribution</span>
              </div>
            </header>
            <div className="project-stat-grid">
              <ProjectMetric label="EPICs" value={`${project.counts["00_EPICS"]}`} detail={runtimeStats ? `${runtimeStats.epicsNeedingValidation} need validation` : "Show stats to inspect"} />
              <ProjectMetric label="FEATs" value={`${totalFeatures}`} detail={`${openFeatures} open`} />
              <ProjectMetric label="Submitted" value={`${project.counts["01_SUBMITTED"]}`} detail="Awaiting planning" />
              <ProjectMetric label="Ready" value={`${project.counts["02_READY_TO_DEVELOP"]}`} detail="Can implement" />
              <ProjectMetric label="In Progress" value={`${project.counts["03_IN_PROGRESS"]}`} detail={runtimeStats ? `${runtimeStats.activeRuns} running workflows` : "Show stats to inspect"} />
              <ProjectMetric label="Completed" value={`${project.counts["04_COMPLETED"]}`} detail={`${project.counts["05_CANCELLED"]} cancelled`} />
            </div>
          </section>

          <section className="project-metric-group project-delivery-metrics" aria-label={`${project.name} delivery performance`}>
            <header className="project-metric-group-heading">
              <div>
                <strong>Delivery performance</strong>
                <span>Measured AI execution, quality load, and estimated human delivery gain</span>
              </div>
              {runtimeStats ? <small>{runtimeStats.timingSampleCount} comparable completed FEATs</small> : null}
            </header>
            <div className="project-ops-grid">
              <ProjectMetric
                label="Average Phase Runtime"
                value={formatNullableDuration(runtimeStats?.averagePhaseDurationMs ?? null)}
                detail={runtimeStats ? `${runtimeStats.completedPhaseRuns} completed phase runs` : "Show stats to calculate"}
              />
              <ProjectMetric
                label="Average FEAT AI Runtime"
                value={formatNullableDuration(runtimeStats?.averageFeatureImplementationDurationMs ?? null)}
                detail={runtimeStats ? `${runtimeStats.completedFeatureImplementations} completed implementations` : "Show stats to calculate"}
              />
              <ProjectMetric
                label="Review And Failure Load"
                value={runtimeStats ? `${runtimeStats.openFindings}` : "-"}
                detail={runtimeStats ? `${runtimeStats.blockedOrFailedPhases} blocked or failed phases` : "Show stats to inspect"}
              />
              <ProjectMetric
                label="Validation Attention"
                value={runtimeStats ? `${runtimeStats.itemsNeedingValidation}` : "-"}
                detail={runtimeStats ? `${runtimeStats.itemsNeedingValidation} items with unresolved validation markers` : "Show stats to inspect"}
              />
              <ProjectMetric
                label="Estimated Human Delivery Gain"
                value={formatDurationGain(runtimeStats?.estimatedHumanTimeSavedMs ?? null)}
                detail={runtimeStats ? `Midpoint gain across ${runtimeStats.timingSampleCount} comparable completed FEATs` : "Show stats to calculate"}
              />
              <ProjectMetric
                label="Delivery Acceleration"
                value={runtimeStats?.humanAccelerationMidpoint === null || runtimeStats?.humanAccelerationMidpoint === undefined
                  ? "-"
                  : `${runtimeStats.humanAccelerationMidpoint.toFixed(1)}×`}
                detail={runtimeStats?.humanAccelerationMidpoint === null || runtimeStats?.humanAccelerationMidpoint === undefined
                  ? "Human-versus-AI comparison unavailable"
                  : "Measured AI runtime versus the original human estimate midpoint"}
              />
            </div>
          </section>
        </div>

        <div className="project-card-side">
          {project.needsInitialization ? (
            <button
              className="submit-button"
              disabled={isInitializing}
              onClick={() => onInitializeProject(project.id)}
              type="button"
            >
              <Database size={15} aria-hidden="true" />
              {isInitializing ? "Initializing" : "Initialize MemoryBank"}
            </button>
          ) : null}

          <div className="project-card-actions">
            <button
              className="mini-button"
              disabled={isSelected}
            onClick={() => onSelectProject(project.id)}
            type="button"
          >
            {isSelected ? "Stats Shown" : "Show Stats"}
          </button>
            <button className="mini-button" onClick={() => onOpenBoard(project.id)} type="button">
              Open Board
            </button>
          </div>

          <p className="project-updated">Updated {formatDateTime(project.updatedAt)}</p>
        </div>
      </div>
    </article>
  );
}

function ProjectMetric({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div className="project-metric" aria-label={`${label}: ${value}. ${detail}`}>
      <span>{label}</span>
      <strong title={value}>{value}</strong>
      <small title={detail}>{detail}</small>
    </div>
  );
}
