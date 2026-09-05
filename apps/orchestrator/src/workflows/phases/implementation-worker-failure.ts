export function formatImplementationWorkerFailure(input: {
  agentName: string;
  agentRole: string;
  error: unknown;
  modelContext: string;
}): string {
  const rawErrorMessage = input.error instanceof Error ? input.error.message : String(input.error);
  const modelScope = input.agentRole === "code-review"
    ? " This failure came from the code-review model, not the phase implementation model."
    : "";
  return `${input.agentName} failed using ${input.modelContext}.${modelScope} ${rawErrorMessage}`.trim();
}
