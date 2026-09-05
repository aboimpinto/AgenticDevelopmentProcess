// Behavior suite: manual test verification adapter and renderer.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockPage = {
  close: vi.fn().mockResolvedValue(undefined),
  evaluate: vi.fn().mockResolvedValue(0),
  pdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4\nmock pdf\n")),
  setContent: vi.fn().mockResolvedValue(undefined),
};
const mockBrowser = {
  close: vi.fn().mockResolvedValue(undefined),
  newPage: vi.fn().mockResolvedValue(mockPage),
};
const mockLaunch = vi.fn().mockResolvedValue(mockBrowser);

vi.mock("@playwright/test", () => ({
  chromium: { launch: mockLaunch },
}));

const { renderPackToPdf } = await import("../src/manual-test-verification/pdf-renderer.js");

const tempDirectories: string[] = [];

afterEach(() => {
  mockLaunch.mockClear();
  mockBrowser.close.mockClear();
  mockBrowser.newPage.mockClear();
  mockPage.close.mockClear();
  mockPage.evaluate.mockClear();
  mockPage.pdf.mockClear();
  mockPage.setContent.mockClear();

  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("manual-test verification PDF renderer", () => {
  it("uses the installed @playwright/test Chromium export and writes a PDF", async () => {
    const directory = mkdtempSync(join(tmpdir(), "hepha-manual-test-renderer-"));
    tempDirectories.push(directory);
    const outputPath = join(directory, "ManualTestVerification.pdf");

    const result = await renderPackToPdf("# Verification pack", "v-test", outputPath);

    expect(result).toEqual({ error: null, pageCount: 1, success: true });
    expect(mockLaunch).toHaveBeenCalledWith({ headless: true });
    expect(mockPage.setContent).toHaveBeenCalledTimes(1);
    expect(mockPage.pdf).toHaveBeenCalledWith(
      expect.objectContaining({ displayHeaderFooter: false, format: "A4", printBackground: true }),
    );
    expect(mockPage.close).toHaveBeenCalledOnce();
    expect(mockBrowser.close).toHaveBeenCalledOnce();
    expect(existsSync(outputPath)).toBe(true);
    expect(readFileSync(outputPath).toString()).toContain("%PDF-1.4");
  });
});
