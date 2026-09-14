import type { IncomingMessage, ServerResponse } from "node:http";
import type { CompletionReadinessVerificationApplication } from "../../../application/features/completion-readiness-verification-application.js";
import { readJson } from "../read-json.js";
import { sendJson } from "../send-json.js";

export async function handleCompletionReadinessRoute(request: IncomingMessage, response: ServerResponse, url: URL,
  application: Pick<CompletionReadinessVerificationApplication, "refresh">) {
  const match = /^\/api\/projects\/([^/]+)\/completion-readiness$/.exec(url.pathname);
  if (request.method !== "POST" || !match) return false;
  try {
    const input = await readJson<{ cardId?: unknown; confirmProposalId?: unknown; confirm?: unknown; coveragePhaseNumber?: unknown; reassess?: unknown; verifyExisting?: unknown; verificationGuidance?: unknown }>(request);
    if (!input || typeof input.cardId !== "string" || !input.cardId.trim() || input.cardId.length > 1000
      || (input.confirmProposalId !== undefined && (typeof input.confirmProposalId !== "string" || input.confirmProposalId.length > 200))
      || (input.confirm !== undefined && input.confirm !== true) || (input.coveragePhaseNumber !== undefined && !Number.isSafeInteger(input.coveragePhaseNumber))
      || (input.reassess !== undefined && (input.reassess !== true || input.confirm !== undefined || input.confirmProposalId !== undefined || input.coveragePhaseNumber !== undefined))
      || (input.verifyExisting !== undefined && (input.verifyExisting !== true || input.reassess !== true))
      || (input.verificationGuidance !== undefined && (input.verifyExisting !== true || typeof input.verificationGuidance !== "string" || input.verificationGuidance.length > 4000))) throw new Error("Invalid readiness refresh request.");
    sendJson(response, 200, await application.refresh({ projectId: decodeURIComponent(match[1]!), cardId: input.cardId,
      ...(input.reassess === true ? { reassess: true } : {}),
      ...(input.verifyExisting === true ? { verifyExisting: true } : {}),
      ...(typeof input.verificationGuidance === "string" ? { verificationGuidance: input.verificationGuidance } : {}),
      confirmProposalId: input.confirmProposalId as string | undefined, confirm: input.confirm as true | undefined, ...(input.coveragePhaseNumber !== undefined ? { coveragePhaseNumber: input.coveragePhaseNumber as number } : {}) }));
  } catch (error) {
    sendJson(response, 400, { message: error instanceof Error ? error.message : "Readiness refresh failed. Existing evidence was preserved." });
  }
  return true;
}
