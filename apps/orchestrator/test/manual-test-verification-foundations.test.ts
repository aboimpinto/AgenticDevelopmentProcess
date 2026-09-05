import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
} from "../src/manual-test-verification/artifact-storage.js";
import { MANUAL_TEST_SKIP_REASON, persistManualTestObligation } from "../src/manual-test-obligation.js";
import {
  discoverSources,
  extractAcceptanceCriteria,
  extractGherkinScenarios,
} from "../src/manual-test-verification/source-discovery.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("manual-test source discovery", () => {
  it("extracts acceptance items only from supported Markdown sections", () => {
    const criteria = extractAcceptanceCriteria([
      "## Context",
      "- ignored",
      "## Acceptance Criteria",
      "- first expected behavior",
      "* second expected behavior",
      "3. numbered expected behavior",
      "- [ ] checkbox expected behavior",
      "## Delivery",
      "- ignored again",
    ].join("\n"), "feature");

    expect(criteria).toEqual([
      "first expected behavior",
      "second expected behavior",
      "numbered expected behavior",
      "checkbox expected behavior",
    ]);
  });

  it("discovers HEPHA-owned skipped-task obligations as mandatory phase acceptance sources", () => {
    const root = mkdtempSync(join(tmpdir(), "hepha-manual-obligation-source-"));
    temporaryDirectories.push(root);
    const featurePath = join(root, "FeatureDescription.md");
    writeFileSync(featurePath, "## Acceptance Criteria\n- ordinary behavior\n");
    persistManualTestObligation(root, "FEAT-123", {
      schemaVersion: "hepha-manual-test-deferral/v1",
      id: "MT-PHYSICAL-001",
      title: "Physical target qualification",
      reason: MANUAL_TEST_SKIP_REASON,
      phaseNumber: 7,
      taskId: "phase-7-task-5",
      preconditions: ["Qualified target"],
      steps: ["Execute the physical procedure"],
      expectedResult: "The target passes without fallback",
      evidenceRequirements: ["Secret-safe evidence"],
    });

    const sources = discoverSources({
      epicAcceptanceTestsPath: null,
      epicDescriptionPath: null,
      featDescriptionPath: featurePath,
      gherkinPaths: [],
    });

    expect(sources).toContainEqual(expect.objectContaining({
      category: "phase-ac",
      explicitId: "MT-PHYSICAL-001",
      text: expect.stringContaining("Execute the physical procedure"),
    }));
  });

  it("extracts scenarios, outlines, and examples from Gherkin", () => {
    expect(extractGherkinScenarios([
      "Feature: Verification",
      "  Scenario: direct behavior",
      "  Scenario Outline: parameterized behavior",
      "  Example: compatibility behavior",
    ].join("\n"))).toEqual([
      "direct behavior",
      "parameterized behavior",
      "compatibility behavior",
    ]);
  });

  it("discovers available feature, parent, acceptance-test, and Gherkin sources", () => {
    const root = mkdtempSync(join(tmpdir(), "hepha-manual-source-discovery-"));
    temporaryDirectories.push(root);
    const featurePath = join(root, "FeatureDescription.md");
    const parentPath = join(root, "ParentDescription.md");
    const acceptancePath = join(root, "AcceptanceTests.md");
    const gherkinPath = join(root, "verification.feature");
    writeFileSync(featurePath, "## Acceptance Criteria\n- feature behavior\n");
    writeFileSync(parentPath, "## Acceptance Tests\n- parent behavior\n");
    writeFileSync(acceptancePath, "## Manual Tests\n- acceptance behavior\n");
    writeFileSync(gherkinPath, "Feature: Generic\n  Scenario: executable behavior\n");

    const sources = discoverSources({
      epicAcceptanceTestsPath: acceptancePath,
      epicDescriptionPath: parentPath,
      featDescriptionPath: featurePath,
      gherkinPaths: [gherkinPath, join(root, "missing.feature")],
    });

    expect(sources.map(({ category, text }) => ({ category, text }))).toEqual([
      { category: "feat-ac", text: "feature behavior" },
      { category: "epic-ac", text: "parent behavior" },
      { category: "epic-ac-test-file", text: "acceptance behavior" },
      { category: "gherkin", text: "executable behavior" },
    ]);
  });
});

describe("manual-test artifact identity and storage", () => {
  it("builds bounded versions, stable pack IDs, and every canonical artifact path", () => {
    const featureRoot = join("workspace", "feature-folder");
    const version = generatePackVersion();
    const archive = archiveDir(featureRoot, version);

    expect(version).toMatch(/^\d{4}-\d{2}-\d{2}T.+-v[0-9a-f]{4}$/i);
    expect(generatePackId("ITEM-ANY", version)).toBe(`ITEM-ANY-${version}`);
    expect(archiveMarkdownPath(archive)).toBe(join(archive, "ManualTestVerification.md"));
    expect(archivePdfPath(archive)).toBe(join(archive, "ManualTestVerification.pdf"));
    expect(archiveManifestPath(archive)).toBe(join(archive, "manifest.json"));
    expect(currentLinkPath(featureRoot)).toBe(resolve(featureRoot, "manual-test-verification", "current-link.json"));
    expect(featRootMarkdownPath(featureRoot)).toBe(resolve(featureRoot, "ManualTestVerification.md"));
    expect(featRootPdfPath(featureRoot)).toBe(resolve(featureRoot, "ManualTestVerification.pdf"));
  });

  it("atomically writes text and binary artifacts into missing directories", () => {
    const root = mkdtempSync(join(tmpdir(), "hepha-manual-artifact-storage-"));
    temporaryDirectories.push(root);
    const textPath = join(root, "nested", "artifact.md");
    const binaryPath = join(root, "nested", "artifact.pdf");

    writeFileAtomic(textPath, "verification");
    writeFileAtomicBinary(binaryPath, Buffer.from("%PDF-test"));

    expect(existsSync(textPath)).toBe(true);
    expect(readFileSync(textPath, "utf8")).toBe("verification");
    expect(readFileSync(binaryPath).toString()).toBe("%PDF-test");
    expect(readdirSync(join(root, "nested")).some((entry) => entry.startsWith(".tmp-"))).toBe(false);
  });
});
