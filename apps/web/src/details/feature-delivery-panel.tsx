import { useCallback, useEffect, useState } from "react";
import type { DeliveryReadModel, WorkItemCard } from "@hepha/shared";
import { apiGet, apiPost } from "../api/http-client.js";
import { DeliveryPanel } from "../delivery-panel.js";
import { isCompletionReadinessRunning } from "../workflow/completion-recovery-activity.js";

export function FeatureDeliveryPanel({ item, projectId }: { item: WorkItemCard; projectId: string }) {
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryReadModel | null>(null);
  const cardId = `${projectId}:${item.stateFolder}:${item.folderName}`;
  const recovering = isCompletionReadinessRunning(item);

  const refresh = useCallback(async () => {
    const status = await apiGet<DeliveryReadModel>(
      `/api/delivery/status?projectId=${encodeURIComponent(projectId)}&cardId=${encodeURIComponent(cardId)}`,
    );
    setDeliveryStatus(status);
  }, [cardId, projectId]);

  useEffect(() => {
    void refresh().catch(() => setDeliveryStatus(null));
  }, [refresh]);

  const prepare = useCallback(async () => {
    if (recovering) return;
    await apiPost("/api/delivery/prepare", { cardId, projectId });
    await refresh();
  }, [cardId, projectId, refresh, recovering]);

  return (
    <DeliveryPanel
      cardId={cardId}
      deliveryStatus={deliveryStatus}
      disabled={recovering}
      onPreparePr={prepare}
      onRefresh={refresh}
      projectId={projectId}
    />
  );
}
