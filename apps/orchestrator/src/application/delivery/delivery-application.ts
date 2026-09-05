import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { DeliveryReadModel, FeatDeliveryStatus } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import {
  readFeatureDescription,
  type DeliveryAdapterParams,
  type DeliveryPrepareResult,
} from "../../delivery-adapter.js";
import type { DeliveryEligibilityInput } from "../../delivery-policy.js";
import {
  buildDeliveryReadModel,
} from "../../delivery-presentation.js";
import {
  getDeliveryStatusExplanation,
  getDeliveryStatusLabel,
} from "../../delivery-policy.js";

export interface DeliveryPrepareInput {
  approved?: boolean;
  cardId: string;
  projectId?: string;
}

export interface DeliveryApplicationResult<T = unknown> {
  body: T;
  status: number;
}

interface PersistedDeliveryProjection {
  deliveryStatus: FeatDeliveryStatus;
  pullRequest: number | null;
}

export interface DeliveryApplicationDependencies {
  findProject(projectId: string): StoredProject | undefined;
  getDeliveryMetadata(
    projectId: string,
    cardKey: string,
  ): Promise<PersistedDeliveryProjection | null>;
  notifyProjectChanged(projectId: string, event: string, itemId: string): void;
  now(): string;
  prepare(
    params: DeliveryAdapterParams,
    eligibility: DeliveryEligibilityInput,
    clockNow: string,
  ): Promise<DeliveryPrepareResult>;
}

interface ResolvedDeliveryFeature {
  folderName: string;
  folderPath: string;
  project: StoredProject;
  stateFolder: string;
}

export async function readFeatureDeliveryStatus(
  input: { cardId: string; projectId: string },
  dependencies: DeliveryApplicationDependencies,
): Promise<DeliveryApplicationResult<DeliveryReadModel | { error: string }>> {
  const resolved = resolveDeliveryFeature(input.projectId, input.cardId, dependencies);
  if ("body" in resolved) return resolved;

  const { config } = readFeatureDescription(resolved.folderPath);
  const readModel = buildDeliveryReadModel(input.cardId, config);

  try {
    const persisted = await dependencies.getDeliveryMetadata(
      resolved.project.id,
      resolved.folderName,
    );
    if (persisted) {
      return {
        body: {
          ...readModel,
          pullRequest: persisted.pullRequest,
          status: persisted.deliveryStatus,
          statusLabel: getDeliveryStatusLabel(persisted.deliveryStatus),
          statusExplanation: getDeliveryStatusExplanation(persisted.deliveryStatus),
        },
        status: 200,
      };
    }
  } catch {
    // Persisted metadata is a non-blocking enhancement of the document state.
  }

  return { body: readModel, status: 200 };
}

export async function prepareFeatureDelivery(
  input: DeliveryPrepareInput,
  dependencies: DeliveryApplicationDependencies,
): Promise<DeliveryApplicationResult<DeliveryPrepareResult | { error: string }>> {
  if (!input.cardId) {
    return { body: { error: "cardId is required." }, status: 400 };
  }
  const projectId = input.projectId ?? input.cardId.split(":")[0];
  if (!projectId) {
    return { body: { error: "projectId is required." }, status: 400 };
  }
  const resolved = resolveDeliveryFeature(projectId, input.cardId, dependencies);
  if ("body" in resolved) return resolved;

  const featureDocumentPath = resolve(resolved.folderPath, "FeatureDescription.md");
  let featureTitle = resolved.folderName;
  let featureDescription = "";
  if (existsSync(featureDocumentPath)) {
    const content = readFileSync(featureDocumentPath, "utf8");
    featureTitle = content.match(/^#\s+(.+)/m)?.[1]?.trim() ?? featureTitle;
    featureDescription = content.match(/^##\s+Summary\s*\n+([^#]+)/m)?.[1]?.trim() ?? "";
  }

  const { config } = readFeatureDescription(resolved.folderPath);
  const phaseStatuses = readPhaseStatuses(resolved.folderPath);
  const eligibility: DeliveryEligibilityInput = {
    approvalState: input.approved ? "approved" : "pending",
    branchMetadata: null,
    deliveryConfig: config,
    featureState: resolved.stateFolder,
    hasExistingPrRef: config.pullRequest !== null,
    manualTestVerificationAccepted: false,
    openBlockingFindings: 0,
    phaseStatuses,
    userCodeReviewAccepted: false,
  };
  const result = await dependencies.prepare(
    {
      cardKey: resolved.folderName,
      externalId: resolved.folderName,
      featureDescription,
      featureFolderPath: resolved.folderPath,
      featureTitle,
      projectId: resolved.project.id,
      repoPath: resolved.project.rootPath,
    },
    eligibility,
    dependencies.now(),
  );

  if (result.outcome === "started") {
    dependencies.notifyProjectChanged(
      resolved.project.id,
      "delivery.preparation.succeeded",
      resolved.folderName,
    );
  } else if (result.outcome === "error") {
    dependencies.notifyProjectChanged(
      resolved.project.id,
      "delivery.preparation.failed",
      resolved.folderName,
    );
  }

  return { body: result, status: result.outcome === "started" ? 200 : 400 };
}

function resolveDeliveryFeature(
  projectId: string,
  cardId: string,
  dependencies: Pick<DeliveryApplicationDependencies, "findProject">,
): ResolvedDeliveryFeature | DeliveryApplicationResult<{ error: string }> {
  const project = dependencies.findProject(projectId);
  if (!project) return { body: { error: "Project not found." }, status: 404 };

  const parts = cardId.split(":");
  if (parts.length < 3) return { body: { error: "Invalid cardId format." }, status: 400 };
  const stateFolder = parts[1];
  const folderName = parts.slice(2).join(":");
  if (!stateFolder || !folderName) {
    return { body: { error: "Invalid cardId format." }, status: 400 };
  }
  const folderPath = resolve(project.memoryBankPath, "Features", stateFolder, folderName);
  if (!existsSync(folderPath)) return { body: { error: "Feature not found." }, status: 404 };

  return { folderName, folderPath, project, stateFolder };
}

function readPhaseStatuses(folderPath: string): Record<string, string> {
  const statuses: Record<string, string> = {};
  try {
    for (const fileName of readdirSync(resolve(folderPath, "Phases"))) {
      if (!fileName.startsWith("phase-") || !fileName.endsWith(".md")) continue;
      const content = readFileSync(resolve(folderPath, "Phases", fileName), "utf8");
      const status = content.match(/\*\*Status:\*\*\s*(\S+)/)?.[1];
      if (status) statuses[fileName.replace(/\.md$/, "")] = status;
    }
  } catch {
    // A feature without phase files yields an empty evidence projection.
  }
  return statuses;
}
