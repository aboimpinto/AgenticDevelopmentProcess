import type { IncomingMessage, ServerResponse } from "node:http";
import {
  isDesignArtifactFileName,
  type DesignArtifactFileName,
  type WorkItemDocumentDetail,
} from "@hepha/shared";
import type { StoredProject } from "../../../projects/stored-project.js";
import type { DesignArtifactPdf } from "../../../design-artifacts/design-artifact-pdf-renderer.js";
import { sendJson } from "../send-json.js";

export interface DesignArtifactRoutesContext {
  findProject(projectId: string): StoredProject | undefined;
  readArtifact(project: StoredProject, cardId: string, artifactName: DesignArtifactFileName): WorkItemDocumentDetail;
  renderPdf(markdown: string, artifactName: DesignArtifactFileName): Promise<DesignArtifactPdf>;
}

/** Serves the fixed Design Feature artifacts as Markdown projections or downloadable PDFs. */
export async function handleDesignArtifactRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: DesignArtifactRoutesContext,
): Promise<boolean> {
  const match = url.pathname.match(
    /^\/api\/projects\/([^/]+)\/work-items\/([^/]+)\/design-artifacts\/([^/]+?)(\/pdf)?$/,
  );
  if (request.method !== "GET" || !match?.[1] || !match[2] || !match[3]) return false;

  const decoded = decodeRouteSegments(match[1], match[2], match[3]);
  if (!decoded || !isDesignArtifactFileName(decoded.artifactName)) {
    sendJson(response, 404, { error: "Design artifact not found." });
    return true;
  }

  const project = context.findProject(decoded.projectId);
  if (!project) {
    sendJson(response, 404, { error: "Project not found" });
    return true;
  }

  const detail = context.readArtifact(project, decoded.cardId, decoded.artifactName);
  if (detail.readStatus !== "ok") {
    sendJson(response, 404, { error: detail.readError ?? "Design artifact not found." });
    return true;
  }

  if (!match[4]) {
    sendJson(response, 200, detail);
    return true;
  }

  try {
    const pdf = await context.renderPdf(detail.content, decoded.artifactName);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${pdf.fileName}"`,
      "Content-Length": pdf.bytes.length,
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(pdf.bytes);
  } catch {
    sendJson(response, 500, { error: "Could not render the design artifact PDF." });
  }
  return true;
}

function decodeRouteSegments(projectId: string, cardId: string, artifactName: string) {
  try {
    return {
      artifactName: decodeURIComponent(artifactName),
      cardId: decodeURIComponent(cardId),
      projectId: decodeURIComponent(projectId),
    };
  } catch {
    return null;
  }
}
