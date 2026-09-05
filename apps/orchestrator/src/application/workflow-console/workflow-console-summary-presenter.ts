import type { FeatureWorkflowConsoleResponse } from "@hepha/shared";

/** Renders bounded workflow console evidence for failure and recovery prompts. */
export class WorkflowConsoleSummaryPresenter {
  constructor(private readonly readConsole: (runId: string) => FeatureWorkflowConsoleResponse) {}

  render(runId: string): string {
    try {
      const consoleOutput = this.readConsole(runId);
      if (consoleOutput.files.length === 0) return "No workflow console files were found for this run.";

      return consoleOutput.files
        .map((file) => [
          `### ${file.name}`,
          `Updated: ${file.updatedAt}`,
          file.truncated ? "Note: content is truncated to the latest retained output." : null,
          "",
          truncate(file.content, 6000),
        ].filter((line): line is string => line !== null).join("\n"))
        .join("\n\n---\n\n");
    } catch (error) {
      return `Unable to read workflow console files: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}
