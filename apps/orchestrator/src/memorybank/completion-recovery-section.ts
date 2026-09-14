/** Generated repair instructions are never acceptance or execution evidence. */
export const completionRecoveryStart = "<!-- hepha:completion-recovery:start -->";
export const completionRecoveryEnd = "<!-- hepha:completion-recovery:end -->";
export function stripCompletionRecoverySection(markdown: string): string {
  return markdown.replace(/\n\n<!-- hepha:completion-recovery:start -->[\s\S]*?<!-- hepha:completion-recovery:end -->/g, "");
}
