import { Bell, Bot, CheckCircle2, Columns, Database, GitBranch, Grip, HardDrive, LayoutDashboard, ListChecks, RefreshCw, Search, Settings, Terminal } from "lucide-react";
import type { LiveActivityStatus, ProjectSummary } from "@hepha/shared";
import { formatDateTime } from "../boards/board-helpers.js";

export type PrimaryView = "work-board" | "feat-board" | "epic-board" | "projects" | "completed-features" | "approvals" | "models" | "governance";

export function Sidebar({
  activeView,
  onSelectView,
}: {
  activeView: PrimaryView;
  onSelectView: (view: PrimaryView) => void;
}) {
  const navItems = [
    { label: "Work Board", icon: LayoutDashboard, view: "work-board" as const },
    { label: "FEAT Board", icon: Columns, view: "feat-board" as const },
    { label: "EPIC Board", icon: Grip, view: "epic-board" as const },
    { label: "Approvals", icon: Bell, view: "approvals" as const },
    { label: "Governance", icon: ListChecks, view: "governance" as const },
    { label: "Runs", icon: Bot, view: null },
    { label: "Projects", icon: HardDrive, view: "projects" as const },
    { label: "Git", icon: GitBranch, view: null },
    { label: "Models", icon: Settings, view: "models" as const },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <img src="/brand/hepha-logo-mark-transparent.png" alt="" />
        </div>
        <div>
          <h1>Hepha</h1>
          <p>v0.3.0-local</p>
        </div>
      </div>

      <nav className="nav-list" aria-label="Primary navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.view === activeView;
          return (
            <button
              className={isActive ? "nav-item nav-item-active" : "nav-item"}
              key={item.label}
              onClick={() => {
                if (item.view) {
                  onSelectView(item.view);
                }
              }}
              type="button"
            >
              <Icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export function Topbar({
  hasError,
  onRefresh,
  onSelectProject,
  projects,
  scannedAt,
  selectedProjectId,
  liveActivityStatus,
  liveActivityAnnouncement,
}: {
  hasError: boolean;
  onRefresh: () => void;
  onSelectProject: (projectId: string) => void;
  projects: ProjectSummary[];
  scannedAt: string | null;
  selectedProjectId: string | null;
  liveActivityStatus?: LiveActivityStatus | null;
  liveActivityAnnouncement?: string | null;
}) {
  const liveState = liveActivityStatus?.connectionState ?? "disabled";
  const isLiveActive = liveState === "live" || liveState === "reconnecting" || liveState === "degraded";

  // Compact live status label (color-independent)
  const liveLabel: Record<string, string> = {
    disabled: "-",
    connecting: "...",
    live: "Live",
    reconnecting: "↻",
    degraded: "!",
    offline: "✗",
  };

  const liveTitle: Record<string, string> = {
    disabled: "Live updates disabled",
    connecting: "Connecting to live updates",
    live: "Live",
    reconnecting: "Reconnecting",
    degraded: "Live (degraded)",
    offline: "Offline",
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <label className="search-box">
          <Search size={17} aria-hidden="true" />
          <input type="search" placeholder="Search MemoryBank..." />
        </label>
        <label className="project-select">
          <HardDrive size={15} aria-hidden="true" />
          <select
            disabled={projects.length === 0}
            onChange={(event) => onSelectProject(event.target.value)}
            value={selectedProjectId ?? ""}
          >
            {projects.length === 0 ? <option value="">No projects</option> : null}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="topbar-right">
        <button className="toolbar-action" onClick={onRefresh} type="button">
          <RefreshCw size={15} aria-hidden="true" />
          Rescan
        </button>
        <div className={hasError ? "status-pill status-pill-error" : "status-pill"}>
          <span className="live-dot" />
          {hasError ? "Orchestrator Offline" : scannedAt ? "MemoryBank Live" : "Local Orchestrator"}
        </div>
        <div
          className={
            liveState === "degraded" || liveState === "offline"
              ? "live-status-badge live-status-badge-warn"
              : isLiveActive
                ? "live-status-badge live-status-badge-active"
                : "live-status-badge"
          }
          title={`Live activity: ${liveTitle[liveState]}${liveActivityStatus?.lastEventTimestamp ? ` — Last event: ${liveActivityStatus.lastEventTimestamp}` : ""}`}
          role="status"
          aria-label={`Live activity: ${liveTitle[liveState]}`}
        >
          <span className="live-status-dot" />
          <span className="live-status-label">{liveLabel[liveState]}</span>
          {liveActivityStatus?.lastEventTimestamp ? (
            <span className="live-status-time">
              {new Date(liveActivityStatus.lastEventTimestamp).toLocaleTimeString()}
            </span>
          ) : null}
        </div>
        {/* Visually hidden aria-live region for announcements */}
        <div
          aria-live="polite"
          aria-atomic="true"
          className="visually-hidden"
        >
          {liveActivityAnnouncement ?? ""}
        </div>
        <button className="icon-button" type="button" aria-label="Notifications">
          <Bell size={18} />
        </button>
        <button className="icon-button" type="button" aria-label="Terminal">
          <Terminal size={18} />
        </button>
        <div className="avatar" aria-label="Current user">
          PA
        </div>
      </div>
    </header>
  );
}

export function ConnectionBanner({ message }: { message: string }) {
  return (
    <div className="connection-banner" role="status">
      <Terminal size={15} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function NoticeBanner({ message }: { message: string }) {
  return (
    <div className="notice-banner" role="status">
      <CheckCircle2 size={15} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function MemoryBankBanner({
  isPending,
  onInitialize,
  project,
}: {
  isPending: boolean;
  onInitialize: () => void;
  project: ProjectSummary;
}) {
  return (
    <div className="memory-bank-banner" role="status">
      <Database size={17} aria-hidden="true" />
      <div>
        <strong>MemoryBank feature folders are missing</strong>
        <span>{project.memoryBankPath}</span>
      </div>
      <button disabled={isPending} onClick={onInitialize} type="button">
        {isPending ? "Initializing" : "Initialize"}
      </button>
    </div>
  );
}
