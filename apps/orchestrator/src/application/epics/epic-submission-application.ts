import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SubmitEpicInput, SubmitEpicResponse, WorkItemCard } from "@hepha/shared";
import { buildSubmitEpicFinalizerPrompt, buildSubmitEpicIdeaPrompt, normalizeSubmitEpicInput, parseSubmitEpicFinalizerResponse, parseSubmitEpicIdeaResponse, renderSubmittedEpicDocument } from "../../epic-submission.js";
import type { StoredProject } from "../../projects/stored-project.js";
import { toProjectSummary } from "../../projects/project-summary.js";
import type { PiPromptRunOptions } from "../../runtime/pi/pi-argument-builder.js";
import type { WorkItemIdAllocator } from "../work-items/work-item-id-allocator.js";

export interface EpicSubmissionDependencies {
  chooseModel(): import("@hepha/shared").HandoffPlanV1;
  currentDate(): string;
  findProject(projectId: string): StoredProject | null;
  idAllocator: Pick<WorkItemIdAllocator, "nextEpic">;
  notifyChanged(projectId: string, eventType: string, externalId: string): void;
  runPrompt(prompt: string, plan: import("@hepha/shared").HandoffPlanV1, options: PiPromptRunOptions): Promise<string>;
  scanProject(project: StoredProject): Promise<WorkItemCard[]>;
}

/** Turns structured scope or a raw idea into one canonical submitted EPIC document. */
export class EpicSubmissionApplication {
  constructor(private readonly dependencies: EpicSubmissionDependencies) {}

  async submit(input: SubmitEpicInput): Promise<SubmitEpicResponse> {
    const project = this.dependencies.findProject(input.projectId);
    if (!project) throw new Error("Project not found.");
    const normalizedInput = await this.resolveInput(project, input);
    const epicId = this.dependencies.idAllocator.nextEpic(project);
    const folderPath = resolve(project.memoryBankPath, "Features", "00_EPICS", `${epicId}-${slugify(normalizedInput.title)}`);
    const documentPath = resolve(folderPath, "EpicDescription.md");
    if (existsSync(folderPath) || existsSync(documentPath)) throw new Error(`${epicId} already exists. Refresh the project and try again.`);
    mkdirSync(folderPath, { recursive: true });
    writeFileSync(documentPath, renderSubmittedEpicDocument({ createdDate: this.dependencies.currentDate(), epicId, input: normalizedInput }), "utf8");
    this.dependencies.notifyChanged(project.id, "epic.submitted", epicId);
    const items = await this.dependencies.scanProject(project);
    const epic = items.find((item) => item.kind === "epic" && item.externalId === epicId);
    if (!epic) throw new Error(`${epicId} was created but could not be loaded from the MemoryBank scan.`);
    return { epic, filesCreated: [documentPath], items, project: toProjectSummary(project), summary: `Submitted ${epicId}: ${normalizedInput.title}.` };
  }

  async resolveInput(project: StoredProject, input: SubmitEpicInput) {
    const workItems = await this.dependencies.scanProject(project);
    const existingEpics = workItems.filter((item) => item.kind === "epic").map(({ externalId, summary, title }) => ({ externalId, summary, title }));
    const existingFeatures = workItems.filter((item) => item.kind === "feature").map(({ externalId, stateLabel: state, summary, title }) => ({ externalId, state, summary, title }));
    const draft = (input.mode ?? "structured") === "idea"
      ? await this.resolveIdeaDraft(project, input, existingEpics)
      : normalizeSubmitEpicInput(input);
    return parseSubmitEpicFinalizerResponse(await this.dependencies.runPrompt(buildSubmitEpicFinalizerPrompt({ draft, existingEpics, existingFeatures, projectName: project.name }), this.dependencies.chooseModel(), { cwd: project.rootPath, timeoutLabel: "Submit EPIC finalizer Pi run" }), draft);
  }

  async resolveIdeaDraft(project: StoredProject, input: SubmitEpicInput, existingEpics: Array<{ externalId: string; summary: string; title: string }>) {
    const ideaText = input.ideaText?.trim();
    if (!ideaText) throw new Error("EPIC idea text is required.");
    const generated = parseSubmitEpicIdeaResponse(await this.dependencies.runPrompt(buildSubmitEpicIdeaPrompt({ existingEpics, ideaText, projectName: project.name }), this.dependencies.chooseModel(), { cwd: project.rootPath, timeoutLabel: "Submit EPIC idea Pi run" }));
    return normalizeSubmitEpicInput({ ...generated, externalReference: generated.externalReference || input.externalReference, owner: generated.owner || input.owner, priority: generated.priority || input.priority, projectId: input.projectId, targetCompletion: generated.targetCompletion || input.targetCompletion });
  }
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "option";
}
