import { extractPhaseTaskLedger } from "../../workflows/phases/phase-task-ledger.js";

/** A stale checkbox is not new implementation work when its unique task section
 * already records terminal evidence. This only interprets state, never approves it. */
export function unresolvedCompletionTasks(markdown: string, phaseNumber: number | null = null) {
  const explicit = /^#{1,6}\s+Phase Task Ledger\s*$/im.test(markdown);
  return extractPhaseTaskLedger(markdown, phaseNumber).filter(task => {
    if (task.checked || (!explicit && !/\bwave\b/i.test(task.section))) return false;
    const contract = /\[contract:([^\]]+)\]/.exec(task.text)?.[1];
    if (!contract) return true;
    const sections = markdown.split(/(?=^###\s+Task\s)/m).slice(1);
    const legacy = /^phase-(\d+)-task-\1-(\d+)$/.exec(contract);
    const matches = sections.filter(section => section.includes(`[contract:${contract}]`) || (legacy && new RegExp(`^###\\s+Task\\s+${legacy[1]}\\.${legacy[2]}(?:\\s|$)`).test(section)));
    if (matches.length !== 1) return true;
    const body = matches[0]!.split(/^#{1,2}\s/m)[0]!;
    const status = /^\*\*Status(?:\*\*\s*:|:\*\*)\s*(COMPLETED|SKIPPED)\b/im.exec(body)?.[1]?.toUpperCase();
    const completed = status === "COMPLETED" && /^\*\*Work Completed(?:\*\*\s*:|:\*\*)\s*\d{4}-\d{2}-\d{2}/im.test(body);
    const deferred = status === "SKIPPED" && /(?:manual.test.deferral|manualtestobligations|skip reason|deferral reason)/i.test(body);
    return !completed && !deferred;
  });
}
