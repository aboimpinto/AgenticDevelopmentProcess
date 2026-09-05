import { useState } from "react";
import { FileText } from "lucide-react";
import {
  designArtifactDefinitions,
  type DesignArtifactFileName,
  type WorkItemDocumentDetail,
} from "@hepha/shared";
import { apiGet, getErrorMessage } from "../api/http-client.js";
import { DesignArtifactPreview } from "./design-artifact-preview.js";

interface ActiveArtifact {
  readonly fileName: DesignArtifactFileName;
  readonly label: string;
}

export function DesignArtifactsPanel({ cardId, projectId }: { cardId: string; projectId: string }) {
  const [active, setActive] = useState<ActiveArtifact | null>(null);
  const [detail, setDetail] = useState<WorkItemDocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const artifactBaseUrl = (fileName: DesignArtifactFileName) =>
    `/api/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(cardId)}/design-artifacts/${encodeURIComponent(fileName)}`;

  async function openArtifact(artifact: ActiveArtifact) {
    setActive(artifact);
    setDetail(null);
    setError(null);
    setIsLoading(true);
    try {
      setDetail(await apiGet<WorkItemDocumentDetail>(artifactBaseUrl(artifact.fileName)));
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <section className="validation-panel design-artifacts-panel" aria-labelledby="design-artifacts-title">
        <div className="validation-heading">
          <span>
            <FileText size={14} aria-hidden="true" />
            <strong id="design-artifacts-title">Design specifications</strong>
          </span>
        </div>
        <p className="validation-message">Open a generated design document in the full-screen reader.</p>
        <div className="design-artifact-links">
          {designArtifactDefinitions.map((artifact) => (
            <button key={artifact.fileName} onClick={() => void openArtifact(artifact)} type="button">
              <FileText size={14} aria-hidden="true" />
              {artifact.label}
            </button>
          ))}
        </div>
      </section>
      {active ? (
        <DesignArtifactPreview
          artifact={active.fileName}
          detail={detail}
          error={error}
          isLoading={isLoading}
          label={active.label}
          onClose={() => setActive(null)}
          pdfUrl={`${artifactBaseUrl(active.fileName)}/pdf`}
        />
      ) : null}
    </>
  );
}
