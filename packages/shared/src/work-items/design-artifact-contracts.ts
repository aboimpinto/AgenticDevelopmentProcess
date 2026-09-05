export const designArtifactDefinitions = [
  {
    fileName: "UX-research-report.md",
    label: "UX research report",
  },
  {
    fileName: "Wireframes-design.md",
    label: "Wireframes design",
  },
  {
    fileName: "design-summary.md",
    label: "Design summary",
  },
] as const;

export type DesignArtifactFileName = typeof designArtifactDefinitions[number]["fileName"];

export function isDesignArtifactFileName(value: string): value is DesignArtifactFileName {
  return designArtifactDefinitions.some((artifact) => artifact.fileName === value);
}
