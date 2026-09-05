/** Broadcasts one project change to both durable-file and live-activity streams. */
export class ProjectChangeNotifier {
  constructor(private readonly dependencies: {
    notifyLive(projectId: string, eventType: string, externalId: string): void;
    notifyMemoryBank(projectId: string, eventType: string, externalId: string): void;
  }) {}

  notify(projectId: string, eventType: string, externalId: string): void {
    this.dependencies.notifyMemoryBank(projectId, eventType, externalId);
    this.dependencies.notifyLive(projectId, eventType, externalId);
  }
}
