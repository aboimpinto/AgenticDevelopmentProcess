// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../approval-queue.js", () => ({ ApprovalQueue: () => <div data-testid="approvals" /> }));
vi.mock("../boards/completed-features-view.js", () => ({ CompletedFeaturesView: () => <div data-testid="completed" /> }));
vi.mock("../boards/epic-board.js", () => ({ EpicBoard: () => <div data-testid="epics" /> }));
vi.mock("../boards/feat-board.js", () => ({ FeatBoard: () => <div data-testid="features" /> }));
vi.mock("../boards/work-board.js", () => ({ WorkBoard: () => <div data-testid="work" /> }));
vi.mock("../deep-dive/deep-dive-overlay.js", () => ({ DeepDiveOverlay: () => <div data-testid="deep-dive" /> }));
vi.mock("../details/detail-blade-router.js", () => ({ DetailBlade: () => <div data-testid="detail" /> }));
vi.mock("../governance/GovernanceDashboard.js", () => ({ GovernanceDashboard: () => <div data-testid="governance" /> }));
vi.mock("../projects/projects-view.js", () => ({ ProjectsView: () => <div data-testid="projects" /> }));
vi.mock("../models/ModelsDestination.js", () => ({ ModelsDestination: () => <div data-testid="models" /> }));
vi.mock("../submissions/epic-submission-overlay.js", () => ({ SubmitEpicOverlay: () => <div data-testid="submit-epic" /> }));
vi.mock("../submissions/feature-submission-overlay.js", () => ({ SubmitFeatOverlay: () => <div data-testid="submit-feature" /> }));
vi.mock("./app-chrome.js", () => ({
  ConnectionBanner: () => <div data-testid="error-banner" />,
  MemoryBankBanner: () => <div data-testid="memory-bank-banner" />,
  NoticeBanner: () => <div data-testid="notice-banner" />,
  Sidebar: () => <div data-testid="sidebar" />,
  Topbar: () => <div data-testid="topbar" />,
}));

import { AppShellView, type AppShellViewProps } from "./app-shell-view.js";

const specification = readFileSync(resolve(import.meta.dirname, "generic-app-shell-view.feature"), "utf8");
const fn = vi.fn;

function props(overrides: Partial<AppShellViewProps> = {}): AppShellViewProps {
  const workspace = {
    createProject: fn(), documentDetail: null, documentDetailLoading: false, errorMessage: null,
    form: {}, initializeMemoryBank: fn(), isLoadingItems: false, isLoadingProjects: false,
    noticeMessage: null, pendingActionId: null, pendingDeepDiveAction: null, projects: [],
    refreshDocument: fn(), refreshProjects: fn(), refreshWorkItems: fn(), scannedAt: null,
    scanStatus: null, selectedItem: null, selectedItemId: null, selectedProject: null,
    selectedProjectId: null, selectedSourceIssue: null, selectedSourceIssueId: null,
    setErrorMessage: fn(), setForm: fn(), setNoticeMessage: fn(), setWorkItems: fn(),
    sourceIssues: [], workItems: [],
  } as unknown as AppShellViewProps["workspace"];
  const navigation = {
    closeDetailSurface: fn(), openCompletedFeaturesView: fn(), openProjectBlade: fn(),
    openProjectBoard: fn(), openSubmitEpicOverlay: fn(), openSubmitFeatOverlay: fn(),
    selectExpandedItem: fn(), selectItem: fn(), selectPrimaryView: fn(), selectProject: fn(),
    selectSourceIssue: fn(), toggleDetailExpanded: fn(),
  } as unknown as AppShellViewProps["navigation"];
  return {
    activeView: "work-board",
    deepDive: { isOpen: false, session: null } as AppShellViewProps["deepDive"],
    epicSubmission: { isOpen: false } as AppShellViewProps["epicSubmission"],
    featureActions: {} as AppShellViewProps["featureActions"],
    featureEpicLink: {} as AppShellViewProps["featureEpicLink"],
    featureSubmission: { isOpen: false } as AppShellViewProps["featureSubmission"],
    isAddingProject: false,
    isBladeOpen: false,
    isDetailExpanded: false,
    liveActivity: {} as AppShellViewProps["liveActivity"],
    manualTests: {} as AppShellViewProps["manualTests"],
    missingFeatures: {} as AppShellViewProps["missingFeatures"],
    navigation,
    workspace,
    ...overrides,
  };
}

afterEach(cleanup);

describe("generic application shell view Gherkin integration", () => {
  it("specifies four product-blind composition behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it.each([
    ["projects", "projects"], ["completed-features", "completed"], ["epic-board", "epics"],
    ["feat-board", "features"], ["models", "models"],
    ["governance", "governance"], ["approvals", "approvals"], ["work-board", "work"],
  ] as const)("renders the %s route through its owning surface", (activeView, marker) => {
    render(<AppShellView {...props({ activeView })} />);
    expect(screen.getByTestId(marker)).toBeTruthy();
    expect(screen.getByTestId("sidebar")).toBeTruthy();
    expect(screen.getByTestId("topbar")).toBeTruthy();
  });

  it("renders controller-requested detail and modal surfaces", () => {
    const project = { id: "project", needsInitialization: false };
    const workspace = { ...props().workspace, selectedProject: project } as AppShellViewProps["workspace"];
    render(<AppShellView {...props({
      deepDive: { isOpen: true, session: {} } as AppShellViewProps["deepDive"],
      epicSubmission: { isOpen: true } as AppShellViewProps["epicSubmission"],
      featureSubmission: { isOpen: true } as AppShellViewProps["featureSubmission"],
      isBladeOpen: true,
      workspace,
    })} />);
    expect(screen.getByTestId("detail")).toBeTruthy();
    expect(screen.getByTestId("deep-dive")).toBeTruthy();
    expect(screen.getByTestId("submit-epic")).toBeTruthy();
    expect(screen.getByTestId("submit-feature")).toBeTruthy();
  });

  it("prioritizes workspace errors and presents initialization state", () => {
    const base = props().workspace;
    const workspace = {
      ...base,
      errorMessage: "Unavailable",
      noticeMessage: "Recovered",
      selectedProject: { id: "project", needsInitialization: true },
    } as AppShellViewProps["workspace"];
    render(<AppShellView {...props({ workspace })} />);
    expect(screen.getByTestId("error-banner")).toBeTruthy();
    expect(screen.queryByTestId("notice-banner")).toBeNull();
    expect(screen.getByTestId("memory-bank-banner")).toBeTruthy();
  });
});
