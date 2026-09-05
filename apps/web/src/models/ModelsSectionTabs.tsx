import { useRef, type KeyboardEvent } from "react";

export type ModelsSection = "provider-connections" | "available-models" | "routing-defaults";

interface ModelsSectionTabsProps {
  readonly selectedSection: ModelsSection;
  readonly onSelectSection: (section: ModelsSection) => void;
}

const sections: ReadonlyArray<{ readonly id: ModelsSection; readonly label: string }> = [
  { id: "provider-connections", label: "Provider Connections" },
  { id: "available-models", label: "Available Models" },
  { id: "routing-defaults", label: "Routing Defaults" },
];

/** Provides keyboard-accessible selection for the Models destination sections. */
export function ModelsSectionTabs({ selectedSection, onSelectSection }: ModelsSectionTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function moveFocus(currentSection: ModelsSection, direction: "next" | "previous" | "first" | "last") {
    const currentIndex = sections.findIndex((section) => section.id === currentSection);
    const targetIndex = direction === "first" ? 0
      : direction === "last" ? sections.length - 1
        : (currentIndex + (direction === "next" ? 1 : -1) + sections.length) % sections.length;
    tabRefs.current[targetIndex]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, section: ModelsSection) {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        moveFocus(section, "next");
        break;
      case "ArrowLeft":
        event.preventDefault();
        moveFocus(section, "previous");
        break;
      case "Home":
        event.preventDefault();
        moveFocus(section, "first");
        break;
      case "End":
        event.preventDefault();
        moveFocus(section, "last");
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        onSelectSection(section);
        break;
    }
  }

  return (
    <div aria-label="Models sections" role="tablist">
      {sections.map((section, index) => (
        <button
          aria-controls={`${section.id}-panel`}
          aria-selected={selectedSection === section.id}
          id={`${section.id}-tab`}
          key={section.id}
          onClick={() => onSelectSection(section.id)}
          onKeyDown={(event) => handleKeyDown(event, section.id)}
          ref={(element) => { tabRefs.current[index] = element; }}
          role="tab"
          tabIndex={selectedSection === section.id ? 0 : -1}
          type="button"
        >
          {section.label}
        </button>
      ))}
    </div>
  );
}
