import type {
  CompletedFeatTimelineApiResponse,
  EventFilter,
  InvocationFilter,
  PhaseTimelineApiResponse,
  StoredAgentInvocation,
  StoredNormalizedEvent,
} from "@hepha/shared";
import {
  buildCompletedFeatTimeline,
  buildPhaseTimeline,
  toCompletedFeatTimelineApiResponse,
  toPhaseTimelineApiResponse,
} from "../../run-timeline-queries.js";

export interface TimelineIdentity {
  readonly cardKey: string;
  readonly projectId: string;
}

export interface PhaseTimelineIdentity extends TimelineIdentity {
  readonly phaseNumber: number;
}

export interface TimelineApplicationDependencies {
  queryEvents(filters: EventFilter): Promise<StoredNormalizedEvent[]>;
  queryInvocations(filters: InvocationFilter): Promise<StoredAgentInvocation[]>;
}

export async function readPhaseTimeline(
  input: PhaseTimelineIdentity,
  dependencies: TimelineApplicationDependencies,
): Promise<PhaseTimelineApiResponse> {
  const invocations = await dependencies.queryInvocations(input);
  const events: StoredNormalizedEvent[] = [];
  for (const invocation of invocations) {
    events.push(...await dependencies.queryEvents({
      cardKey: input.cardKey,
      invocationId: invocation.id,
      projectId: input.projectId,
    }));
  }

  const phaseTitle = invocations[0]?.phaseTitle || `Phase ${input.phaseNumber}`;
  return toPhaseTimelineApiResponse(buildPhaseTimeline(
    input.projectId,
    input.cardKey,
    input.phaseNumber,
    phaseTitle,
    invocations,
    events,
  ));
}

export async function readCompletedTimeline(
  input: TimelineIdentity,
  dependencies: TimelineApplicationDependencies,
): Promise<CompletedFeatTimelineApiResponse> {
  const invocations = await dependencies.queryInvocations(input);
  return toCompletedFeatTimelineApiResponse(buildCompletedFeatTimeline(
    input.projectId,
    input.cardKey,
    invocations,
  ));
}
