import React, { useEffect, useRef, useState, useId } from "react";
import { getErrorMessage } from "./error-utils.js";

/**
 * MermaidDiagram — renders a Mermaid diagram source string as inline SVG.
 *
 * Dynamically imports the mermaid library, initializes it with dark-theme
 * variables, and renders the diagram in a controlled lifecycle.
 *
 * @internal Extracted from app-shell.tsx inline definition.
 */
export function MermaidDiagram({ source }: { source: string }) {
  const id = useId().replace(/:/g, "");
  const renderCountRef = useRef(0);
  const [renderedDiagram, setRenderedDiagram] = useState<{ error: string | null; svg: string | null }>({
    error: null,
    svg: null,
  });

  useEffect(() => {
    let cancelled = false;
    const renderId = `hepha-mermaid-${id}-${renderCountRef.current}`;

    renderCountRef.current += 1;
    setRenderedDiagram({ error: null, svg: null });

    async function renderDiagram() {
      try {
        const mermaid = (await import("mermaid")).default;

        mermaid.initialize({
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          securityLevel: "strict",
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            background: "#0b0e15",
            edgeLabelBackground: "#191c22",
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            lineColor: "#ffc174",
            mainBkg: "#191c22",
            nodeBorder: "#a08e7a",
            primaryBorderColor: "#a08e7a",
            primaryColor: "#191c22",
            primaryTextColor: "#e0e2ec",
            secondaryBorderColor: "#03b5d3",
            secondaryColor: "#0b3b45",
            secondaryTextColor: "#e0e2ec",
            tertiaryBorderColor: "#534434",
            tertiaryColor: "#10131a",
            tertiaryTextColor: "#d8c3ad",
          },
        });

        const result = await mermaid.render(renderId, source);

        if (!cancelled) {
          setRenderedDiagram({ error: null, svg: result.svg });
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setRenderedDiagram({ error: getErrorMessage(error), svg: null });
        }
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [id, source]);

  if (renderedDiagram.error) {
    return (
      <div className="mermaid-diagram mermaid-diagram-error">
        <strong>Mermaid diagram could not be rendered.</strong>
        <span>{renderedDiagram.error}</span>
        <pre>
          <code>{source}</code>
        </pre>
      </div>
    );
  }

  if (!renderedDiagram.svg) {
    return <div className="mermaid-diagram mermaid-diagram-loading">Rendering Mermaid diagram...</div>;
  }

  return (
    <div
      className="mermaid-diagram"
      dangerouslySetInnerHTML={{ __html: renderedDiagram.svg }}
    />
  );
}
