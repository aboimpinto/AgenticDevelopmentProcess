import { readFileSync } from "node:fs";
import { relative } from "node:path";
import type { ManualTestPackDbState } from "@hepha/db";
import { renderPackMarkdown } from "../manual-test-verification-presentation.js";
import type { ManualTestAdapterContext } from "./adapter-context.js";
import type { SourceDiscoveryOptions } from "./source-discovery.js";
import {
  archiveDir,
  archiveManifestPath,
  archiveMarkdownPath,
  archivePdfPath,
  currentLinkPath,
  featRootMarkdownPath,
  featRootPdfPath,
  generatePackId,
  generatePackVersion,
  writeFileAtomic,
  writeFileAtomicBinary,
} from "./artifact-storage.js";
import { renderPackToPdf } from "./pdf-renderer.js";
import { hasReusablePackArtifacts } from "./current-pack.js";
import { buildManualTestDeliveryModel, hashManualTestDeliveryModel } from "./delivery-model.js";

// ---------------------------------------------------------------------------
// Pack Generation (orchestrator)
// ---------------------------------------------------------------------------

export interface GeneratePackOptions {
  readonly context: ManualTestAdapterContext;
  readonly sourceOptions: SourceDiscoveryOptions;
}

export interface GeneratePackResult {
  readonly success: boolean;
  readonly packId: string | null;
  readonly version: string | null;
  readonly state: ManualTestPackDbState;
  readonly message: string;
  readonly errors: string[];
  readonly applicability: "applicable" | "not_applicable" | "incomplete";
  readonly manualTestCount: number;
  readonly invalidManualTestCount: number;
  readonly isReady: boolean;
}

/**
 * Generate a new manual test verification pack.
 *
 * Steps:
 * 1. Discover sources
 * 2. Normalize and create manifest
 * 3. Generate test cases
 * 4. Render Markdown
 * 5. Render PDF
 * 6. Write artifacts atomically
 * 7. Persist metadata
 * 8. Supersede old current pack
 */
export async function generatePack(
  options: GeneratePackOptions,
): Promise<GeneratePackResult> {
  const { context, sourceOptions } = options;
  const errors: string[] = [];

  try {
    // 1. Discover sources
    const model = await buildManualTestDeliveryModel(context, sourceOptions);
    if (model.manifestEntries.length === 0) {
      return {
        success: false,
        packId: null,
        version: null,
        state: "render_failed",
        message: "No acceptance criteria or test scenarios found.",
        errors: ["No source items discovered."],
        applicability: "incomplete", manualTestCount: 0, invalidManualTestCount: 0, isReady: false,
      };
    }

    // 2. Normalize and create manifest entries
    const manifestEntries = model.manifestEntries;
    const manifestHash = hashManualTestDeliveryModel(model);

    // Generation is idempotent for unchanged traced inputs. Reusing the
    // durable current pack preserves its exact review binding and prevents a
    // repeated click/retry from creating a second indistinguishable version.
    const existingCurrentPack = await context.store.getCurrentManualTestPack(
      context.projectId,
      context.cardKey,
    );
    if (
      existingCurrentPack
      && existingCurrentPack.state === "current"
      && existingCurrentPack.supersededAt === null
      && existingCurrentPack.manifestHash === manifestHash
      && hasReusablePackArtifacts(context.projectRoot, existingCurrentPack)
    ) {
      return {
        success: true,
        packId: existingCurrentPack.id,
        version: existingCurrentPack.version,
        state: "current",
        message: `Verification pack ${existingCurrentPack.id} already matches the traced inputs and was reused.`,
        errors,
        applicability: model.applicability,
        manualTestCount: model.tests.length,
        invalidManualTestCount: model.invalidManualTests.length,
        isReady: model.applicability === "applicable" && model.tests.length > 0 && model.invalidManualTests.length === 0,
      };
    }

    // 3. Use only validated, explicitly defined human workflows. Acceptance
    // prose is never expanded into placeholder cases.
    const coverageMap = model.coverageMap;
    const tests = model.tests;

    // 4. Determine pack version
    const version = generatePackVersion();
    const packId = generatePackId(context.featExternalId, version);

    // 5. Render Markdown
    const markdown = renderPackMarkdown({
      featId: context.featExternalId,
      featTitle: context.featTitle,
      epicId: context.epicExternalId,
      packVersion: version,
      generatedAt: new Date().toISOString(),
      stateLabel: "current",
      applicability: model.applicability,
      manifestEntries,
      coverageMap,
      tests,
      invalidManualTests: model.invalidManualTests,
      automatedEvidence: model.automatedEvidence,
      deferredSurfaces: model.deferredSurfaces,
      failedTests: [],
      howToFailInstructions: [
        "1. Perform each test case step by step.",
        "2. If the actual result matches the expected result, mark the test as PASS.",
        "3. If the actual result differs from the expected result:",
        "   a. Mark the test as FAIL.",
        "   b. Record the actual result in detail.",
        "   c. Add any relevant notes or evidence (screenshots, logs).",
        "4. Submit failed tests through the dashboard 'Record Failure' action.",
        "5. Each failed test will create a Human Review Finding for investigation.",
      ].join("\n"),
    });

    // 6. Create archive directory and write files atomically
    const archiveDirPath = archiveDir(context.featFolderPath, version);

    // Write manifest
    const manifestJson = JSON.stringify({
      schemaVersion: "hepha-test-delivery/v2",
      renderingVersion: 7,
      entries: manifestEntries,
      classifications: coverageMap,
      manualTests: tests,
      invalidManualTests: model.invalidManualTests,
      automatedEvidence: model.automatedEvidence,
      deferredSurfaces: model.deferredSurfaces,
      applicability: model.applicability,
      manifestHash,
      version,
      createdAt: new Date().toISOString(),
    }, null, 2);
    writeFileAtomic(archiveManifestPath(archiveDirPath), manifestJson);

    // Write Markdown
    const mdPath = archiveMarkdownPath(archiveDirPath);
    writeFileAtomic(mdPath, markdown);

    // 7. Render PDF (best-effort)
    let pdfState: ManualTestPackDbState = "current";
    let pdfError: string | null = null;
    let pdfPath: string | null = null;

    try {
      const pdfResult = await renderPackToPdf(markdown, version, archivePdfPath(archiveDirPath));
      if (pdfResult.success) {
        pdfPath = archivePdfPath(archiveDirPath);
      } else {
        pdfState = "render_failed";
        pdfError = pdfResult.error;
      }
    } catch (error) {
      pdfState = "render_failed";
      pdfError = error instanceof Error ? error.message : String(error);
    }

    // 8. Write current-link.json
    const currentLink = {
      packId,
      version,
      state: pdfState,
      manifestHash,
      markdownRelativePath: relative(context.featFolderPath, mdPath),
      pdfRelativePath: pdfPath ? relative(context.featFolderPath, pdfPath) : null,
      createdAt: new Date().toISOString(),
    };
    writeFileAtomic(currentLinkPath(context.featFolderPath), JSON.stringify(currentLink, null, 2));

    // 9. Update FEAT-root convenience copies
    writeFileAtomic(featRootMarkdownPath(context.featFolderPath), markdown);
    if (pdfPath) {
      // Copy PDF atomically
      const pdfContent = readFileSync(pdfPath);
      writeFileAtomicBinary(featRootPdfPath(context.featFolderPath), pdfContent);
    }

    // 10. Supersede old current pack in store
    const oldCurrent = await context.store.getCurrentManualTestPack(context.projectId, context.cardKey);
    if (oldCurrent) {
      await context.store.markManualTestPackSuperseded(
        context.projectId,
        context.cardKey,
        oldCurrent.id,
        new Date().toISOString(),
      );

      const oldReview = await context.store.getCurrentManualTestReview(
        context.projectId,
        context.cardKey,
      );
      if (oldReview) {
        await context.store.invalidateManualTestReview(
          context.projectId,
          context.cardKey,
          oldReview.id,
          new Date().toISOString(),
          `Pack ${oldCurrent.id} was superseded by ${packId}`,
        );
      }
    }

    // 11. Persist new pack record
    await context.store.recordManualTestPack({
      id: packId,
      projectId: context.projectId,
      cardKey: context.cardKey,
      version,
      state: pdfState,
      manifestHash,
      markdownPath: relative(context.projectRoot, mdPath),
      pdfPath: pdfPath ? relative(context.projectRoot, pdfPath) : null,
      renderError: pdfError,
      createdAt: new Date().toISOString(),
      supersededAt: null,
    });

    return {
      success: true,
      packId,
      version,
      state: pdfState,
      message: pdfState === "current"
        ? model.applicability === "not_applicable"
          ? `Test delivery ${packId} generated. Manual Tests: Not Applicable.`
          : model.applicability === "applicable"
            ? `Manual test pack ${packId} generated with ${tests.length} validated executable test${tests.length === 1 ? "" : "s"}.`
            : `Test delivery ${packId} generated, but the manual test package is incomplete and is not ready.`
        : `Verification pack ${packId} generated with Markdown only (PDF rendering: ${pdfError ?? "unknown error"}).`,
      errors,
      applicability: model.applicability,
      manualTestCount: model.tests.length,
      invalidManualTestCount: model.invalidManualTests.length,
      isReady: model.applicability === "applicable" && model.tests.length > 0 && model.invalidManualTests.length === 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    return {
      success: false,
      packId: null,
      version: null,
      state: "render_failed",
      message: `Pack generation failed: ${message}`,
      errors,
      applicability: "incomplete",
      manualTestCount: 0,
      invalidManualTestCount: 0,
      isReady: false,
    };
  }
}
