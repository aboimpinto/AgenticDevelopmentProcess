import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import type { ProjectLessonsLearnedContextOptions } from "./project-lessons-learned-context-reader.js";

export interface FeatureWorkflowContextOptions {
  contextMode?: "default" | "code-review" | "plan-review";
  includeUiLanguageDocuments: boolean;
  lessonContext: ProjectLessonsLearnedContextOptions;
}

interface FeatureWorkflowContextCollectorDependencies {
  acceptanceTestsFileName: string;
  createPreviousFailureBrief(feature: WorkItemCard): string | null;
  getNumberedPhases(feature: Pick<WorkItemCard, "folderPath" | "phases">): Array<PhaseSummary & { number: number }>;
  getPlanningArtifactPath(feature: Pick<WorkItemCard, "folderPath">): string;
  readCurrentBranch(rootPath: string): string;
  renderLessons(project: StoredProject, options: ProjectLessonsLearnedContextOptions): string;
  renderPhaseTaskLedger(
    project: StoredProject,
    feature: WorkItemCard,
    phase: (PhaseSummary & { number: number }) | null,
  ): string;
  selectCodeReviewFiles(project: StoredProject, feature: WorkItemCard, phaseNumber: number): string[];
}

export class FeatureWorkflowContextCollector {
  constructor(private readonly dependencies: FeatureWorkflowContextCollectorDependencies) {}

  collect(
    project: StoredProject,
    feature: WorkItemCard,
    workItems: WorkItemCard[],
    options: FeatureWorkflowContextOptions,
    previousFailureBrief: string | null = null,
  ): string {
    const sections: string[] = [];
    const failureBrief = previousFailureBrief ?? this.dependencies.createPreviousFailureBrief(feature);
    const contextMode = options.contextMode ?? "default";
    const phaseTaskLedgerPhase = this.#findPhase(feature, options.lessonContext.phase ?? null);

    if (failureBrief) sections.push(failureBrief);

    if (contextMode === "code-review") {
      sections.push(this.#renderCodeReviewScope(project, feature, options.lessonContext.phase ?? null));
      sections.push(renderContextSection(
        "Current Phase Status Context",
        this.#collectCurrentPhaseStatusDocuments(project, feature, options.lessonContext.phase ?? null),
      ));
      sections.push(this.dependencies.renderPhaseTaskLedger(project, feature, phaseTaskLedgerPhase));
      sections.push(this.dependencies.renderLessons(project, options.lessonContext));
      return sections.join("\n\n");
    }

    sections.push(renderContextSection(
      "Feature Folder Documents",
      collectMarkdownDocuments(feature.folderPath, project.rootPath, 6),
    ));
    sections.push(this.dependencies.renderPhaseTaskLedger(project, feature, phaseTaskLedgerPhase));
    sections.push(this.#renderPlanningArtifact(project, feature));
    const linkedEpicDocuments = feature.linkedEpicIds
      .map((externalId) => workItems.find((item) => item.kind === "epic" && item.externalId === externalId))
      .filter((item): item is WorkItemCard => Boolean(item))
      .map((epic) => ({
        content: epic.specMarkdown,
        path: epic.documentRelativePath ?? epic.documentPath ?? epic.externalId,
      }));

    sections.push(renderContextSection("Linked EPIC Documents", linkedEpicDocuments));
    sections.push(renderContextSection(
      "Linked EPIC Acceptance Tests",
      this.#collectLinkedEpicAcceptanceTests(project, feature, workItems),
    ));
    sections.push(this.dependencies.renderLessons(project, options.lessonContext));

    const projectDocuments = [
      ...collectMarkdownDocuments(resolve(project.memoryBankPath, "Overview"), project.rootPath, 4),
      ...collectMarkdownDocuments(resolve(project.memoryBankPath, "Architecture"), project.rootPath, 4),
      ...collectMarkdownDocuments(resolve(project.memoryBankPath, "CodeGuidelines"), project.rootPath, 4),
    ];
    sections.push(renderContextSection("Project MemoryBank Context", projectDocuments.slice(0, 8)));

    if (options.includeUiLanguageDocuments) {
      sections.push(renderContextSection(
        "MemoryBank UI Language And Design Context",
        collectUiLanguageDocuments(project).slice(0, 10),
      ));
    }

    return sections.join("\n\n");
  }

  #findPhase(feature: WorkItemCard, phase: Pick<PhaseSummary, "number" | "title"> | null) {
    if (!phase || phase.number === null) return null;
    return this.dependencies.getNumberedPhases(feature).find((candidate) => candidate.number === phase.number) ?? null;
  }

  #renderCodeReviewScope(
    project: StoredProject,
    feature: WorkItemCard,
    phase: Pick<PhaseSummary, "number" | "title"> | null,
  ) {
    const branch = this.dependencies.readCurrentBranch(project.rootPath).trim();
    const changedFiles = phase
      ? this.dependencies.selectCodeReviewFiles(project, feature, Number(phase.number))
      : [];

    return [
      "## Scoped Code Review Context",
      "",
      `Project root: ${project.rootPath}`,
      `Feature folder: ${feature.folderPath}`,
      `Phase: ${phase ? `Phase ${phase.number} - ${phase.title}` : "unknown"}`,
      `Git branch: ${branch || "(unknown)"}`,
      "",
      "### Production Code Review Target",
      "",
      changedFiles.length > 0
        ? changedFiles.map((file) => `- ${file}`).join("\n")
        : "- No phase-attributed production-code changes were detected. Do not run code review or broaden the scope to documentation, tests, or another phase's working-tree changes.",
      "",
      "### Scope Rule",
      "",
      "- Review only the Production Code Review Target files.",
      "- Do not add documentation, tests, TestProjects, test-only helpers, MemoryBank artifacts, generated files, or another phase's working-tree changes to the review target.",
      "- Context documents may explain contracts but are never review targets and never receive review findings.",
    ].join("\n");
  }

  #collectCurrentPhaseStatusDocuments(
    project: StoredProject,
    feature: WorkItemCard,
    phase: Pick<PhaseSummary, "number" | "title"> | null,
  ) {
    const documents: Array<{ content: string; path: string | null }> = [];
    const featureTasksPath = resolve(feature.folderPath, "FeatureTasks.md");
    if (isFile(featureTasksPath)) {
      documents.push({
        content: readDocumentSnippet(featureTasksPath, 8000),
        path: normalizeRelativePath(project.rootPath, featureTasksPath),
      });
    }

    if (phase) {
      const phaseDocuments = this.dependencies.getNumberedPhases(feature)
        .filter((candidate) => candidate.number === phase.number)
        .map((candidate) => candidate.documentPath)
        .filter(isFile);
      for (const path of phaseDocuments) {
        documents.push({
          content: readDocumentSnippet(path, 8000),
          path: normalizeRelativePath(project.rootPath, path),
        });
      }
    }
    return documents;
  }

  #collectLinkedEpicAcceptanceTests(project: StoredProject, feature: WorkItemCard, workItems: WorkItemCard[]) {
    return feature.linkedEpicIds
      .map((externalId) => workItems.find((item) => item.kind === "epic" && item.externalId === externalId))
      .filter((item): item is WorkItemCard => Boolean(item))
      .flatMap((epic) => {
        const acceptancePath = resolve(epic.folderPath, this.dependencies.acceptanceTestsFileName);
        if (!isFile(acceptancePath)) return [];
        return [{
          content: readFileSync(acceptancePath, "utf8").trim(),
          path: normalizeRelativePath(project.rootPath, acceptancePath),
        }];
      });
  }

  #renderPlanningArtifact(project: StoredProject, feature: WorkItemCard) {
    const path = this.dependencies.getPlanningArtifactPath(feature);
    const documents = isFile(path)
      ? [{ content: readDocumentSnippet(path, 8000), path: normalizeRelativePath(project.rootPath, path) }]
      : [];
    return renderContextSection("Feature Planning Artifact", documents);
  }
}

export function collectUiLanguageDocuments(project: StoredProject) {
  const pattern = /\b(ui|ux|design|frontend|front-end|visual|style|theme|component|screen|interaction|wireframe|layout|accessibility|brand|language)\b/i;
  return collectMarkdownDocuments(project.memoryBankPath, project.rootPath, 60)
    .filter((document) => pattern.test(document.path) || pattern.test(document.content))
    .slice(0, 12);
}

export function collectMarkdownDocuments(rootPath: string, relativeRoot: string, maxFiles: number) {
  if (!isDirectory(rootPath)) return [];
  return listMarkdownFiles(rootPath, maxFiles).map((path) => ({
    content: readDocumentSnippet(path, 5000),
    path: normalizeRelativePath(relativeRoot, path),
  }));
}

export function listMarkdownFiles(rootPath: string, maxFiles: number) {
  const results: string[] = [];
  const queue = [rootPath];
  while (queue.length > 0 && results.length < maxFiles) {
    const currentPath = queue.shift()!;
    for (const entry of readDirectory(currentPath)) {
      const entryPath = resolve(currentPath, entry);
      if (isDirectory(entryPath)) queue.push(entryPath);
      else if (/\.md$/i.test(entry)) results.push(entryPath);
      if (results.length >= maxFiles) break;
    }
  }
  return results;
}

export function renderContextSection(title: string, documents: Array<{ content: string; path: string | null }>) {
  if (documents.length === 0) return `## ${title}\n\nNo documents found.`;
  return [
    `## ${title}`,
    ...documents.map((document) => [
      "",
      `### ${document.path ?? "document"}`,
      "```markdown",
      document.content,
      "```",
    ].join("\n")),
  ].join("\n");
}

export function readDocumentSnippet(path: string, maxLength: number) {
  try {
    return truncate(readFileSync(path, "utf8").trim(), maxLength);
  } catch {
    return "";
  }
}

function readDirectory(path: string) {
  try { return existsSync(path) ? readdirSync(path) : []; } catch { return []; }
}

function isDirectory(path: string) {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

function isFile(path: string): path is string {
  try { return statSync(path).isFile(); } catch { return false; }
}

function normalizeRelativePath(fromPath: string, toPath: string) {
  const value = relative(fromPath, toPath);
  return value && !value.startsWith("..") ? value.replaceAll("\\", "/") : toPath;
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}
