export function selectDeveloperAgentForStack(stackEntries: readonly string[]): string {
  const stack = stackEntries.join(" ").toLowerCase();
  if (stack.includes("rust")) return "Rust Developer Agent";
  if (stack.includes("c#") || stack.includes(".net")) return "C# Developer Agent";
  if (stack.includes("node") || stack.includes("typescript") || stack.includes("react") || stack.includes("next")) {
    return "Node/TypeScript Developer Agent";
  }
  return "Implementation Agent";
}
