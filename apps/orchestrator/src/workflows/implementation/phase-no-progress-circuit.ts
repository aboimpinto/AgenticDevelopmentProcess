export interface PhaseNoProgressObservation {
  detail: string;
  durableFingerprint: string;
  phaseNumber: number;
  route: string;
}

/**
 * Pauses a host-side phase transition when one recovery cycle returns with no
 * durable evidence change. The circuit is local to one workflow execution: a
 * user-selected Continue Implementation run re-reads current authority after
 * the mismatch has been repaired.
 */
export class PhaseNoProgressCircuit {
  private previousSignature: string | null = null;

  observe(input: PhaseNoProgressObservation): void {
    const signature = [
      input.phaseNumber,
      input.route,
      input.durableFingerprint,
      normalizeDetail(input.detail),
    ].join("\u0000");
    if (signature !== this.previousSignature) {
      this.previousSignature = signature;
      return;
    }

    throw new Error([
      `WORKFLOW_AWAITING_USER_DECISION: Phase ${input.phaseNumber} returned to the ${input.route} transition with the same decision and unchanged durable state.`,
      `Durable fingerprint: ${input.durableFingerprint}.`,
      `Last decision: ${normalizeDetail(input.detail) || "No transition detail was recorded."}`,
      "Hepha paused the workflow rather than consuming resources without progress. Completed task evidence remains preserved. The user may repair the reported authority mismatch and choose Continue Implementation, or cancel the workflow.",
    ].join(" "));
  }
}

function normalizeDetail(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}
