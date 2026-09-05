import type { DeepDiveSession, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { DeepDiveContinuationRecoveryApplication } from "../src/application/deep-dive/deep-dive-continuation-recovery-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const project = { id: "project-any" } as StoredProject;
const baseMarkdown = "# Generic Scope\n\nKeep this behavior.";

function feature(markdown = baseMarkdown): WorkItemCard {
  return {
    documentPath: "/memory/FeatureDescription.md",
    documentUpdatedAt: "document-time",
    externalId: "FEAT-ANY",
    id: "card-any",
    kind: "feature",
    specMarkdown: markdown,
  } as WorkItemCard;
}

function harness(options: {
  enabled?: boolean;
  lastHash?: string | null;
  previousSemanticSource?: string | null;
  uiDecision?: boolean;
} = {}) {
  const confirmations: unknown[] = [];
  const notifications: string[] = [];
  const recovery = { id: "recovery-any" } as DeepDiveSession;
  const startRecoverySession = vi.fn(async () => recovery);
  const getCardMetadata = vi.fn(async () => ({
    lastDeepDiveSemanticSource: options.previousSemanticSource,
    lastDeepDiveSourceHash: options.lastHash,
    uiRequirementDecision: options.uiDecision ? "requires_ui" : null,
  }) as never);
  const application = new DeepDiveContinuationRecoveryApplication({
    createCardKey: (kind, externalId) => `${kind}:${externalId}`,
    createSourceHash: () => "current-hash",
    createUiRequirementSourceHash: (hash) => `ui:${hash}`,
    metadataStore: {
      enabled: options.enabled !== false,
      getCardMetadata,
      confirmFeatureReadinessSource: async (record) => { confirmations.push(record); },
    },
    notifyChanged: (_projectId, eventType, externalId) => notifications.push(`${eventType}:${externalId}`),
    startRecoverySession,
  });
  return { application, confirmations, getCardMetadata, notifications, startRecoverySession };
}

describe("deep-dive continuation recovery application", () => {
  it("does nothing without durable metadata or a linked source document", async () => {
    const disabled = harness({ enabled: false });
    await expect(disabled.application.recover(project, feature())).resolves.toBeNull();
    expect(disabled.getCardMetadata).not.toHaveBeenCalled();
    const detached = feature();
    detached.documentPath = null;
    const available = harness();
    await expect(available.application.recover(project, detached)).resolves.toBeNull();
    expect(available.getCardMetadata).not.toHaveBeenCalled();
  });

  it("accepts a source whose recorded hash is already current", async () => {
    const current = harness({ lastHash: "current-hash" });
    await expect(current.application.recover(project, feature())).resolves.toBeNull();
    expect(current.confirmations).toEqual([]);
    expect(current.startRecoverySession).not.toHaveBeenCalled();
  });

  it("rebases lifecycle-only changes and preserves current UI classification authority", async () => {
    const current = harness({ previousSemanticSource: baseMarkdown, uiDecision: true });
    const markdown = `${baseMarkdown}\n\n## Lifecycle Status\n\nStatus: IN_PROGRESS`;
    await expect(current.application.recover(project, feature(markdown))).resolves.toBeNull();
    expect(current.confirmations).toEqual([expect.objectContaining({
      semanticSource: baseMarkdown,
      sourceDocumentHash: "current-hash",
      uiRequirementSourceHash: "ui:current-hash",
    })]);
    expect(current.notifications).toEqual(["deep-dive.rebased:FEAT-ANY"]);
  });

  it("starts one explicit recovery session for substantive or unknown-baseline changes", async () => {
    const substantive = harness({ previousSemanticSource: baseMarkdown });
    await expect(substantive.application.recover(
      project,
      feature("# Generic Scope\n\nChange this behavior."),
    )).resolves.toEqual({ id: "recovery-any" });
    expect(substantive.startRecoverySession).toHaveBeenCalledWith(
      { cardId: "card-any", projectId: "project-any" },
      expect.objectContaining({ topic: "Changed FeatureDescription scope" }),
    );

    const unknown = harness({ previousSemanticSource: null });
    await unknown.application.recover(project, feature());
    expect(unknown.startRecoverySession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topic: "Deep-Dive recovery baseline" }),
    );
  });
});
