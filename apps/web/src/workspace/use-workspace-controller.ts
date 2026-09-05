import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type {
  CreateProjectInput,
  InitializeProjectResponse,
  ProjectListResponse,
  ProjectResponse,
  ProjectSummary,
  WorkItemCard,
  WorkItemDocumentDetail,
  WorkItemListResponse,
  WorkItemScanStatus,
  WorkItemSourceIssue,
} from "@hepha/shared";
import { apiGet, apiPost, getErrorMessage } from "../api/http-client.js";

const initialProjectForm: CreateProjectInput = { memoryBankPath: "", name: "", rootPath: "" };

export interface WorkspaceControllerOptions {
  onProjectAvailability(hasProjects: boolean): void;
  onProjectCreated(projectId: string): void;
}

export function useWorkspaceController(options: WorkspaceControllerOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [documentDetail, setDocumentDetail] = useState<WorkItemDocumentDetail | null>(null);
  const [documentDetailLoading, setDocumentDetailLoading] = useState(false);
  const [documentDetailRefreshKey, setDocumentDetailRefreshKey] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [form, setForm] = useState<CreateProjectInput>(initialProjectForm);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [pendingDeepDiveAction, setPendingDeepDiveAction] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<WorkItemScanStatus | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedSourceIssueId, setSelectedSourceIssueId] = useState<string | null>(null);
  const [sourceIssues, setSourceIssues] = useState<WorkItemSourceIssue[]>([]);
  const [workItems, setWorkItems] = useState<WorkItemCard[]>([]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const selectedItem = useMemo(
    () => workItems.find((item) => item.id === selectedItemId) ?? null,
    [selectedItemId, workItems],
  );
  const selectedSourceIssue = useMemo(
    () => sourceIssues.find((issue) => issue.id === selectedSourceIssueId) ?? null,
    [selectedSourceIssueId, sourceIssues],
  );

  const refreshProjects = useCallback(async () => {
    try {
      const response = await apiGet<ProjectListResponse>("/api/projects");
      setProjects(response.projects);
      setErrorMessage(null);
      optionsRef.current.onProjectAvailability(response.projects.length > 0);
      setSelectedProjectId((current) =>
        current && response.projects.some((project) => project.id === current)
          ? current
          : response.projects[0]?.id ?? null,
      );
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  const refreshWorkItems = useCallback(async (projectId: string) => {
    setIsLoadingItems(true);
    try {
      const response = await apiGet<WorkItemListResponse>(
        `/api/projects/${encodeURIComponent(projectId)}/work-items`,
      );
      const nextSourceIssues = response.sourceIssues ?? [];
      setWorkItems(response.items);
      setSourceIssues(nextSourceIssues);
      setScanStatus(response.scanStatus ?? null);
      setScannedAt(response.scannedAt);
      setErrorMessage(null);
      setSelectedItemId((current) =>
        !current || response.items.some((item) => item.id === current) ? current : null,
      );
      setSelectedSourceIssueId((current) =>
        !current || nextSourceIssues.some((issue) => issue.id === current) ? current : null,
      );
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoadingItems(false);
    }
  }, []);

  const upsertProject = useCallback((project: ProjectSummary) => {
    setProjects((current) => [project, ...current.filter((candidate) => candidate.id !== project.id)]
      .sort((left, right) => left.name.localeCompare(right.name)));
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setWorkItems([]);
      setSourceIssues([]);
      setScanStatus(null);
      setSelectedItemId(null);
      setSelectedSourceIssueId(null);
      return undefined;
    }
    void refreshWorkItems(selectedProjectId);
    if (!selectedProject || selectedProject.needsInitialization) return undefined;

    const eventSource = new EventSource(
      `/api/projects/${encodeURIComponent(selectedProjectId)}/memory-bank-events`,
    );
    const handleChanged = () => void refreshWorkItems(selectedProjectId);
    const handleError = (event: Event) => {
      const data = parseSseData<{ message?: string }>((event as MessageEvent<string>).data);
      if (data?.message) setErrorMessage(data.message);
    };
    eventSource.addEventListener("memorybank.changed", handleChanged);
    eventSource.addEventListener("memorybank.error", handleError);
    return () => {
      eventSource.removeEventListener("memorybank.changed", handleChanged);
      eventSource.removeEventListener("memorybank.error", handleError);
      eventSource.close();
    };
  }, [refreshWorkItems, selectedProject, selectedProjectId]);

  useEffect(() => {
    if (!selectedItemId || !selectedProjectId) return;
    let cancelled = false;
    setDocumentDetailLoading(true);
    apiGet<WorkItemDocumentDetail>(
      `/api/projects/${encodeURIComponent(selectedProjectId)}/work-items/${encodeURIComponent(selectedItemId)}/document`,
    ).then((detail) => {
      if (!cancelled) {
        setDocumentDetail(detail);
        setDocumentDetailLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setDocumentDetail(null);
        setDocumentDetailLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [documentDetailRefreshKey, selectedItemId, selectedProjectId]);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingActionId("create-project");
    try {
      const response = await apiPost<ProjectResponse>("/api/projects", form);
      upsertProject(response.project);
      setSelectedProjectId(response.project.id);
      setSelectedItemId(null);
      setNoticeMessage(null);
      setForm(initialProjectForm);
      setErrorMessage(null);
      optionsRef.current.onProjectCreated(response.project.id);
    } catch (error: unknown) {
      setNoticeMessage(null);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setPendingActionId(null);
    }
  }

  async function initializeMemoryBank(projectId: string) {
    setPendingActionId(`init-${projectId}`);
    try {
      const response = await apiPost<InitializeProjectResponse>(
        `/api/projects/${encodeURIComponent(projectId)}/initialize-memory-bank`,
        {},
      );
      upsertProject(response.project);
      await refreshWorkItems(projectId);
      setNoticeMessage(null);
      setErrorMessage(null);
    } catch (error: unknown) {
      setNoticeMessage(null);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setPendingActionId(null);
    }
  }

  return {
    createProject,
    documentDetail,
    documentDetailLoading,
    errorMessage,
    form,
    initializeMemoryBank,
    isLoadingItems,
    isLoadingProjects,
    noticeMessage,
    pendingActionId,
    pendingDeepDiveAction,
    projects,
    refreshDocument: () => setDocumentDetailRefreshKey((current) => current + 1),
    refreshProjects,
    refreshWorkItems,
    scannedAt,
    scanStatus,
    selectedItem,
    selectedItemId,
    selectedProject,
    selectedProjectId,
    selectedSourceIssue,
    selectedSourceIssueId,
    setDocumentDetail,
    setDocumentDetailLoading,
    setErrorMessage,
    setForm,
    setNoticeMessage,
    setPendingActionId,
    setPendingDeepDiveAction,
    setSelectedItemId,
    setSelectedProjectId,
    setSelectedSourceIssueId,
    setWorkItems,
    sourceIssues,
    upsertProject,
    workItems,
  };
}

function parseSseData<T>(value: string) {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
