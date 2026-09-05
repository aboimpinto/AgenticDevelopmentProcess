export interface ResilientErrorPathOptions {
  blockedEscalation: string;
  completionTarget: string;
}

/** Renders the shared diagnose, repair, verify, and bounded-escalation contract. */
export function renderResilientImplementationErrorPath(options: ResilientErrorPathOptions) {
  return [
    "Resilient error path:",
    "- When any command, check, file operation, git operation, or validation step fails, do not stop at the first failure.",
    "- Evaluate the exact error output, identify the likely root cause, and decide whether it is a project bug, missing dependency/tooling, environment issue, git conflict, transient failure, or user/external blocker.",
    "- Implement the smallest safe fix for recoverable failures, then rerun the smallest relevant verification that proves that specific error is resolved.",
    `- Keep looping through diagnose -> fix -> verify until the error is resolved and ${options.completionTarget}, while obeying all safety rules including command sequencing, concurrency, and tool safety rules from LessonsLearned.`,
    `- ${options.blockedEscalation} only when the error requires user input, unavailable credentials/permissions, unsafe destructive action, an unresolved merge conflict, or the same failure repeats after documented recovery attempts.`,
  ];
}
