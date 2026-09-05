import type {
  CreateProviderConnectionInput,
  ProviderConnectionId,
  ProviderConnectionRecord,
  SecretOperationInput,
  SecretReference,
  UpdateProviderConnectionInput,
} from "@hepha/shared";
import type {
  ProviderConnectionResult,
  ProviderConnectionService,
} from "../provider-connections/service.js";
import type { CatalogScanCoordinator } from "./catalog-scan-coordinator.js";
import {
  classifyCatalogScanTrigger,
  type CatalogScanTriggerFacts,
} from "./catalog-scan-trigger-policy.js";

export interface ProviderCatalogMutationOperations {
  createConnection(input: CreateProviderConnectionInput): Promise<ProviderConnectionResult<ProviderConnectionRecord>>;
  updateConnection(
    connectionId: ProviderConnectionId,
    input: UpdateProviderConnectionInput,
  ): Promise<ProviderConnectionResult<ProviderConnectionRecord>>;
  createSecret(input: SecretOperationInput): Promise<ProviderConnectionResult<SecretReference>>;
  rotateSecret(input: SecretOperationInput): Promise<ProviderConnectionResult<SecretReference>>;
}

/** Runs catalog scans after successful provider mutations without rolling back durable provider state. */
export class ProviderCatalogScanApplication implements ProviderCatalogMutationOperations {
  constructor(
    private readonly service: ProviderConnectionService,
    private readonly coordinator: Pick<CatalogScanCoordinator, "scanConnection">,
  ) {}

  async createConnection(
    input: CreateProviderConnectionInput,
  ): Promise<ProviderConnectionResult<ProviderConnectionRecord>> {
    const result = await this.service.createConnection(input);
    if (result.success && result.data) await this.scanAfterPersistence(null, result.data);
    return result;
  }

  async updateConnection(
    connectionId: ProviderConnectionId,
    input: UpdateProviderConnectionInput,
  ): Promise<ProviderConnectionResult<ProviderConnectionRecord>> {
    const before = this.service.getConnection(connectionId);
    const result = await this.service.updateConnection(connectionId, input);
    if (before && result.success && result.data) await this.scanAfterPersistence(before, result.data);
    return result;
  }

  async createSecret(input: SecretOperationInput): Promise<ProviderConnectionResult<SecretReference>> {
    const before = this.service.getConnection(input.connectionId);
    const result = await this.service.createSecret(input);
    const after = this.service.getConnection(input.connectionId);
    if (before && after && result.success) await this.scanAfterPersistence(before, after);
    return result;
  }

  async rotateSecret(input: SecretOperationInput): Promise<ProviderConnectionResult<SecretReference>> {
    const before = this.service.getConnection(input.connectionId);
    const result = await this.service.rotateSecret(input);
    const after = this.service.getConnection(input.connectionId);
    if (before && after && result.success) await this.scanAfterPersistence(before, after);
    return result;
  }

  private async scanAfterPersistence(
    before: ProviderConnectionRecord | null,
    after: ProviderConnectionRecord,
  ): Promise<void> {
    const trigger = classifyCatalogScanTrigger({
      before: before ? toTriggerFacts(before) : null,
      after: toTriggerFacts(after),
    });
    if (!trigger) return;
    try {
      await this.coordinator.scanConnection({
        connectionId: after.connectionId,
        trigger,
        mode: "force_settled",
      });
    } catch {
      // Provider persistence is authoritative. A local scan failure remains represented by
      // the coordinator claim and startup recovery rather than rolling back configuration.
    }
  }
}

function toTriggerFacts(record: ProviderConnectionRecord): CatalogScanTriggerFacts {
  return {
    connectionId: record.connectionId,
    kind: record.kind,
    provider: record.provider,
    endpointUrl: record.endpointUrl,
    endpointLocal: record.endpointLocal,
    lifecycleState: record.lifecycleState,
    credentialVersion: record.secretVersion,
  };
}
