import { afterEach, describe, expect, it, vi } from "vitest";

const mockPage = {
  close: vi.fn().mockResolvedValue(undefined),
  pdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-1.4\ndesign artifact\n")),
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

const { renderDesignArtifactPdf } = await import(
  "../src/design-artifacts/design-artifact-pdf-renderer.js"
);

afterEach(() => {
  vi.clearAllMocks();
});

describe("design artifact PDF renderer", () => {
  it("renders in memory with a blank header and page-number-only footer", async () => {
    const result = await renderDesignArtifactPdf("# Design summary", "design-summary.md");

    expect(result.fileName).toBe("design-summary.pdf");
    expect(result.bytes.toString()).toContain("%PDF-1.4");
    expect(mockLaunch).toHaveBeenCalledWith({ headless: true });
    expect(mockPage.setContent).toHaveBeenCalledWith(
      expect.stringContaining("<h1>Design summary</h1>"),
      expect.objectContaining({ waitUntil: "networkidle" }),
    );
    expect(mockPage.pdf).toHaveBeenCalledWith(expect.objectContaining({
      displayHeaderFooter: true,
      footerTemplate: expect.stringContaining("pageNumber"),
      headerTemplate: "<div></div>",
      printBackground: true,
    }));
    expect(mockPage.close).toHaveBeenCalledOnce();
    expect(mockBrowser.close).toHaveBeenCalledOnce();
  });
});
