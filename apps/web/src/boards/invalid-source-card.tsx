import type { WorkItemSourceIssue } from "@hepha/shared";

interface InvalidSourceCardProps {
  isSelected: boolean;
  issue: WorkItemSourceIssue;
  onSelectIssue: (issueId: string) => void;
}

export function InvalidSourceCard({
  isSelected,
  issue,
  onSelectIssue,
}: InvalidSourceCardProps) {
  function handleKeyboardSelect(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectIssue(issue.id);
    }
  }

  return (
    <article
      className={isSelected ? "feature-card selected-card" : "feature-card"}
      onClick={() => onSelectIssue(issue.id)}
      onKeyDown={handleKeyboardSelect}
      role="button"
      tabIndex={0}
    >
      <div className="card-topline">
        <span className={isSelected ? "card-id active-id" : "card-id"}>Invalid EPIC source</span>
        <div className="card-badges">
          <span className="badge validation-badge blocked">Invalid</span>
        </div>
      </div>
      <h3>{issue.folderName}</h3>
      <p className="card-activity">{issue.message}</p>
      <p className="card-activity">
        {issue.sourceRelativePath ?? issue.sourcePath ?? "Source path unavailable"}
      </p>
    </article>
  );
}
