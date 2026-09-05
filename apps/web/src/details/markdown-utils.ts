import React from "react";

/**
 * Extracts the code language from a className string like "language-mermaid".
 *
 * @internal Extracted from app-shell.tsx inline definition.
 */
export function getMarkdownCodeLanguage(className?: string) {
  const languageClass = className?.split(/\s+/).find((name) => name.startsWith("language-"));

  return languageClass?.replace("language-", "").toLowerCase() ?? null;
}

/**
 * Extracts the Mermaid source from a <pre><code className="language-mermaid"> structure.
 *
 * @internal Extracted from app-shell.tsx inline definition.
 */
export function getMermaidCodeSource(children: React.ReactNode) {
  const childArray = React.Children.toArray(children);

  if (childArray.length !== 1 || !React.isValidElement(childArray[0])) {
    return null;
  }

  const childProps = childArray[0].props as { children?: React.ReactNode; className?: string };

  if (getMarkdownCodeLanguage(childProps.className) !== "mermaid") {
    return null;
  }

  return String(childProps.children ?? "").replace(/\n$/, "");
}
