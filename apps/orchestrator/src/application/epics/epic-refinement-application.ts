import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { SubmitEpicRefinementInput, SubmitEpicRefinementResponse, WorkItemCard } from "@hepha/shared";
import { appendEpicRefinementHistory, buildEpicRefinementPrompt, parseEpicRefinementResponse } from "../../epic-refinement.js";
import type { StoredProject } from "../../projects/stored-project.js";
import { toProjectSummary } from "../../projects/project-summary.js";
import type { PiPromptRunOptions } from "../../runtime/pi/pi-argument-builder.js";

export interface EpicRefinementDependencies {
  chooseModel(): import("@hepha/shared").HandoffPlanV1;
  clock(): string;
  createId(): string;
  findProject(projectId: string): StoredProject | null;
  notifyChanged(projectId: string, eventType: string, externalId: string): void;
  runPrompt(prompt: string, plan: import("@hepha/shared").HandoffPlanV1, options: PiPromptRunOptions): Promise<string>;
  scanProject(project: StoredProject): Promise<WorkItemCard[]>;
}

/** Applies one operator-requested refinement to an existing EPIC and records its history. */
export class EpicRefinementApplication {
  constructor(private readonly dependencies: EpicRefinementDependencies) {}

  async submit(input: SubmitEpicRefinementInput): Promise<SubmitEpicRefinementResponse> {
    const project = this.dependencies.findProject(input.projectId);
    if (!project) throw new Error("Project not found.");
    const request = input.request.trim();
    if (!request) throw new Error("EPIC refinement request is required.");
    const workItems = await this.dependencies.scanProject(project);
    const epic = workItems.find((candidate) => candidate.id === input.cardId);
    if (!epic || epic.kind !== "epic") throw new Error("EPIC work item not found.");
    if (!epic.documentPath || !existsSync(epic.documentPath)) {
      throw new Error(`${epic.externalId} does not have an EpicDescription.md file to refine.`);
    }

    const currentMarkdown = readFileSync(epic.documentPath, "utf8");
    const parsed = parseEpicRefinementResponse(
      await this.dependencies.runPrompt(buildEpicRefinementPrompt({
        currentMarkdown,
        epicId: epic.externalId,
        previousRefinements: epic.epicRefinements,
        request,
        title: epic.title,
      }), this.dependencies.chooseModel(), {
        cwd: project.rootPath,
        timeoutLabel: "EPIC refinement Pi run",
      }),
      currentMarkdown,
    );
    if (!parsed.markdown.includes(epic.externalId)) {
      throw new Error(`EPIC refinement response did not preserve ${epic.externalId}.`);
    }
    writeFileSync(epic.documentPath, parsed.markdown, "utf8");
    const refinement = {
      changedSections: parsed.changedSections,
      createdAt: this.dependencies.clock(),
      id: `epic-refinement-${this.dependencies.createId()}`,
      request,
      summary: parsed.summary,
    };
    const historyPath = appendEpicRefinementHistory(epic.folderPath, refinement);
    this.dependencies.notifyChanged(project.id, "epic.refined", epic.externalId);
    const items = await this.dependencies.scanProject(project);
    const refreshedEpic = items.find((item) => item.kind === "epic" && item.externalId === epic.externalId);
    if (!refreshedEpic) throw new Error(`${epic.externalId} was refined but could not be loaded from the MemoryBank scan.`);
    return {
      epic: refreshedEpic,
      filesChanged: [epic.documentPath, historyPath],
      items,
      project: toProjectSummary(project),
      refinement,
      summary: `Refined ${epic.externalId}: ${parsed.summary}`,
    };
  }
}
