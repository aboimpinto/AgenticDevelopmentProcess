import type { CardMetadataStore } from "@hepha/db";
import type { FeatDeliveryStatus } from "@hepha/shared";
import {
  prepareFeatureDelivery,
  readFeatureDeliveryStatus,
} from "../application/delivery/delivery-application.js";
import { preparePr } from "../delivery-adapter.js";
import type { ProjectRegistry } from "../projects/project-registry.js";

export interface DeliveryApplicationsDependencies {
  readonly metadataStore: CardMetadataStore;
  readonly notifyProjectChanged: (projectId: string, event: string, itemId: string) => void;
  readonly projects: Pick<ProjectRegistry, "get">;
}

/** Composes delivery reads and preparation with project and metadata ownership. */
export function createDeliveryApplications(dependencies: DeliveryApplicationsDependencies) {
  const applicationDependencies = {
    findProject: (projectId: string) => dependencies.projects.get(projectId),
    getDeliveryMetadata: async (projectId: string, cardKey: string) => {
      const persisted = await dependencies.metadataStore.getDeliveryMetadata(projectId, cardKey);
      return persisted ? {
        deliveryStatus: persisted.deliveryStatus as FeatDeliveryStatus,
        pullRequest: persisted.pullRequest,
      } : null;
    },
    notifyProjectChanged: dependencies.notifyProjectChanged,
    now: () => new Date().toISOString(),
    prepare: (params: Parameters<typeof preparePr>[0], eligibility: Parameters<typeof preparePr>[1], clockNow: string) =>
      preparePr(params, eligibility, dependencies.metadataStore, clockNow),
  };
  return {
    prepare: (input: Parameters<typeof prepareFeatureDelivery>[0]) => prepareFeatureDelivery(input, applicationDependencies),
    readStatus: (input: Parameters<typeof readFeatureDeliveryStatus>[0]) => readFeatureDeliveryStatus(input, applicationDependencies),
  };
}
