import { createJsonExchangeProtocol, readExchangeSchema } from "../exchanges/json-exchange-protocol.js";
export interface VerificationInventoryCommands {
  replacements: { document: string; checkId: string; before: string; after: string; reason: string }[];
}
export const verificationInventoryCommands = createJsonExchangeProtocol<VerificationInventoryCommands>(
  "verification.inventory.commands", readExchangeSchema("verification-inventory-commands-v1"));
