import { ProjectRegistrationError } from "../../project-registration.js";

export interface OrchestratorErrorResponse {
  readonly body: Record<string, unknown>;
  readonly statusCode: number;
}
/** Map a known orchestrator failure to the safe JSON error boundary. */
export function toProjectErrorResponse(error: unknown): OrchestratorErrorResponse {
  const errorMessage = error instanceof Error ? error.message : "Unknown orchestrator error";
  const errorBody: Record<string, unknown> = { error: errorMessage };

  if (error instanceof ProjectRegistrationError) {
    errorBody.code = error.code;
    errorBody.field = error.field;
  }

  return { body: errorBody, statusCode: getHttpStatusCode(error) };
}

function getHttpStatusCode(error: unknown): number {
  if (!error || typeof error !== "object") {
    return 500;
  }

  const statusCode = (error as Record<string, unknown>).statusCode;

  return typeof statusCode === "number" && statusCode >= 400 && statusCode <= 599
    ? statusCode
    : 500;
}
