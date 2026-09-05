import type { DirectHostKindV1 } from "@hepha/shared";

export interface DirectHostInstrumentationRegistration {
  readonly hostKind: DirectHostKindV1;
  readonly instrumentationSource: string;
}

/** Owns the explicit allowlist for direct-host model telemetry provenance. */
export class DirectHostInstrumentationRegistry {
  private readonly identities: ReadonlySet<string>;

  constructor(registrations: readonly DirectHostInstrumentationRegistration[] = []) {
    const identities = registrations.map(identity);
    if (new Set(identities).size !== identities.length) {
      throw new Error("DIRECT_HOST_INSTRUMENTATION_DUPLICATE");
    }
    this.identities = new Set(identities);
  }

  isTrusted(input: DirectHostInstrumentationRegistration): boolean {
    return this.identities.has(identity(input));
  }
}

function identity(input: DirectHostInstrumentationRegistration): string {
  if (!text(input.instrumentationSource, 512)) throw new Error("DIRECT_HOST_INSTRUMENTATION_INVALID");
  return `${input.hostKind}\u0000${input.instrumentationSource}`;
}
function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max
    && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}
