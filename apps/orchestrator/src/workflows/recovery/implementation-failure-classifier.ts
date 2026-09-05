import type { WorkItemCard } from "@hepha/shared";

export function isRecoverableImplementationFailure(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return normalized.includes("worker returned without completing the phase document")
    || isProviderPromptRefusalFailure(errorMessage)
    || isCodeReviewAgentFailure(errorMessage)
    || isCodeReviewBlockedFailure(errorMessage)
    || isIncompleteFixerResponseFailure(errorMessage)
    || isUnsafeCargoExecutionFailure(normalized)
    || isMissingLocalToolingFailure(normalized)
    || normalized.includes("validation blocker")
    || normalized.includes("blocked pending")
    || /phase\s+\d+\s+is blocked\b/i.test(errorMessage)
    || normalized.includes("timed out after");
}

/** Recognizes a provider-side rejection of the accumulated model input. */
export function isProviderPromptRefusalFailure(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return normalized.includes("invalid prompt")
    && normalized.includes("prompt was flagged")
    && normalized.includes("usage policy");
}

export function isCodeReviewAgentFailure(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return normalized.includes("code review agent failed")
    || normalized.includes("this failure came from the code-review model");
}

export function isIncompleteFixerResponseFailure(errorMessage: string): boolean {
  return /cannot request a code-review rerun until fixer response entries are complete/i.test(errorMessage);
}

export function isFixerResponseRepairCapFailure(errorMessage: string): boolean {
  return /fixer response repair cap reached/i.test(errorMessage);
}

export function isReviewContractPredecessorRequiredFailure(errorMessage: string): boolean {
  return errorMessage.includes("REVIEW_CONTRACT_PREDECESSOR_REQUIRED:");
}

export function isAuthoritativeV1ReviewFailure(errorMessage: string): boolean {
  return errorMessage.includes("REVIEW_CONTRACT_V1_");
}

export function isReviewFindingResolutionFailure(feature: WorkItemCard, errorMessage: string): boolean {
  const currentStep = feature.featureWorkflow?.lastRun?.currentStep ?? "";
  return /Resolve Code Review Findings Phase \d+ failed/i.test(currentStep)
    || (/Node\/TypeScript Developer Agent failed/i.test(errorMessage)
      && /review findings resolution failed/i.test(currentStep));
}

export function isUnsafeCargoExecutionFailure(normalizedError: string): boolean {
  return normalizedError.includes("hepha blocked unsafe cargo execution")
    || normalizedError.includes("multiple cargo commands")
    || normalizedError.includes("more than one cargo command");
}

export function isMissingLocalToolingFailure(normalizedError: string): boolean {
  return isMissingPiCliFailure(normalizedError)
    || /\b(cargo|rustc|pnpm|npm|node|npx|yarn|bun|python|python3|uv|pytest|make): command not found\b/.test(normalizedError)
    || normalizedError.includes("cargo.exe")
    || normalizedError.includes("could not find cargo")
    || normalizedError.includes("not found in current bash path")
    || (normalizedError.includes("cannot find module") && normalizedError.includes("node_modules"))
    || (normalizedError.includes("no such file or directory") && normalizedError.includes("node_modules"));
}

export function isMissingPiCliFailure(normalizedError: string): boolean {
  return normalizedError.includes("pi cli is not available")
    || normalizedError.includes("failed to start pi")
    || (normalizedError.includes("enoent") && normalizedError.includes("/bin/pi"))
    || (normalizedError.includes("spawn") && normalizedError.includes("pi") && normalizedError.includes("enoent"));
}

export function isCodeReviewBlockedFailure(errorMessage: string): boolean {
  return /phase\s+\d+\s+code review blocked autonomous implementation/i.test(errorMessage)
    || /^##\s+Code Review Blocker\b/im.test(errorMessage);
}

export function extractWorkflowFailurePhaseNumber(text: string): number | null {
  return extractCodeReviewBlockedPhaseNumber(text) ?? extractGenericWorkflowFailedPhaseNumber(text);
}

export function extractGenericWorkflowFailedPhaseNumber(text: string): number | null {
  const match = text.match(/-\s*Failed step:\s*Phase\s+(\d+)\s+failed\b/i)
    ?? text.match(/\bPhase\s+(\d+)\s+failed\b/i)
    ?? text.match(/\bCurrent phase:\s*Phase\s+(\d+)\b/i)
    ?? text.match(/\bPhase\s+(\d+)\s+cannot request a code-review rerun\b/i);
  return match ? Number.parseInt(match[1] ?? "", 10) || null : null;
}

export function extractCodeReviewBlockedPhaseNumber(text: string): number | null {
  const match = text.match(/phase\s+(\d+)\s+code review blocked autonomous implementation/i)
    ?? text.match(/-\s*Phase:\s*Phase\s+(\d+)/i);
  return match ? Number.parseInt(match[1] ?? "", 10) || null : null;
}
