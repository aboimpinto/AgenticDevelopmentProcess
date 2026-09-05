import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const memoryBankScannerSource = readFileSync(
  fileURLToPath(new URL("../src/memorybank-scanner.ts", import.meta.url)),
  "utf8",
);
const phaseScannerSource = readFileSync(
  fileURLToPath(new URL("../src/memorybank/phase-scanner.ts", import.meta.url)),
  "utf8",
);

describe("phase scanner ownership", () => {
  it("keeps scanning and document parsing out of the composition root", () => {
    expect(orchestratorSource).not.toContain("function scanFeaturePhases");
    expect(orchestratorSource).not.toContain("function extractPhaseStatus");
    expect(orchestratorSource).not.toContain("function extractPhaseRouting");
    expect(memoryBankScannerSource).toContain('from "./memorybank/phase-scanner.js"');
    expect(phaseScannerSource).toContain("export function scanFeaturePhases");
  });
});
