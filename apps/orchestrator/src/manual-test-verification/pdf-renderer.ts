import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { renderPackHtml } from "../manual-test-verification-presentation.js";
import { writeFileAtomicBinary } from "./artifact-storage.js";

const PDF_RENDER_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// PDF Rendering (via Playwright)
// ---------------------------------------------------------------------------

export interface PdfRenderResult {
  success: boolean;
  error: string | null;
  pageCount: number | null;
}

/**
 * Render a Markdown string to PDF using Playwright's headless Chromium.
 * Falls back gracefully if Playwright is not available.
 */
export async function renderPackToPdf(
  markdownContent: string,
  packVersion: string,
  outputPath: string,
): Promise<PdfRenderResult> {
  const dir = dirname(outputPath);
  mkdirSync(dir, { recursive: true });

  try {
    // Generate print-safe HTML
    const html = renderPackHtml(markdownContent, packVersion);

    // The repository declares @playwright/test, which exports Chromium. Do not
    // import the separate `playwright` package: it is not installed here.
    let chromium: any;
    try {
      const playwright = await import("@playwright/test");
      chromium = playwright.chromium;
    } catch {
      return {
        success: false,
        error: "The project's @playwright/test package is unavailable. Run pnpm install from the Hepha repository.",
        pageCount: null,
      };
    }
    if (!chromium) {
      return { success: false, error: "The project's @playwright/test Chromium API is unavailable.", pageCount: null };
    }

    const browser = await chromium.launch({ headless: true });
    let pageCount: number | null = null;

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle", timeout: PDF_RENDER_TIMEOUT_MS });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
        displayHeaderFooter: false,
        preferCSSPageSize: true,
      });

      pageCount = (await page.evaluate(() => document.querySelectorAll(".page-break").length + 1)) || 1;

      await page.close();
      writeFileAtomicBinary(outputPath, pdfBuffer);

      return { success: true, error: null, pageCount };
    } finally {
      await browser.close();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return { success: false, error: errorMessage, pageCount: null };
  }
}
