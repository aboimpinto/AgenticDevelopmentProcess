import { createJsonExchangeProtocol, readExchangeSchema } from "../exchanges/json-exchange-protocol.js";

export interface ExecutionReceiptPayload { feature: string; checks: Record<string, unknown>[] }
/** The exact schema is used by both the worker contract and runtime decoding.
 * The legacy v1 receipt remains an explicit compatibility format. */
export const executionReceiptExchange = createJsonExchangeProtocol<ExecutionReceiptPayload>(
  "verification.execution.receipt", readExchangeSchema("verification-execution-receipt-v1"));

export function decodeExecutionReceipt(raw: string): Record<string, unknown> {
  const value = JSON.parse(raw);
  if (value?.schemaVersion !== undefined || value?.kind === "verification.execution.receipt") {
    const decoded = executionReceiptExchange.decode(raw);
    if (!decoded.valid) throw new Error(`Execution receipt protocol invalid: ${JSON.stringify(decoded.diagnostics)}`);
    return { ...decoded.value.payload, schemaVersion: "hepha-exchange/v1", schema: "phase-verification-receipt/v1",
      runId: decoded.value.audit?.runId, verifiedAt: decoded.value.audit?.testExecutionTimestamp };
  }
  return value;
}
