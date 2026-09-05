import type { WorkItemCard } from "@hepha/shared";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HumanReviewFindingPhaseRef } from "./feature-finding-application.js";
import { extractPhaseNumber, extractPhaseTitle } from "../../memorybank/phase-document-parser.js";

export const humanReviewFindingsPhaseTitle = "Human Review Findings";
const responseCheckpoint = "All submitted findings have an agent response";
const userSolvedCheckpoint = "User marked each finding as solved";
const verificationCheckpoint = "Configured verification evidence is recorded for each ready finding";
const documentsCheckpoint = "FeatureTasks.md and this phase file reflect the final finding status";

type FindingPhaseStatus = "AWAITING_USER_ACCEPTANCE" | "COMPLETED" | "IN_PROGRESS";

export interface HumanReviewFindingSection {
  end: number;
  findingId: string;
  start: number;
}

export function getHumanReviewFindingSections(markdown: string): HumanReviewFindingSection[] {
  const matches = [...markdown.matchAll(/^###\s+(finding-[^\r\n]+)\s*$/gm)];

  return matches.map((match, index) => ({
    end: matches[index + 1]?.index ?? markdown.length,
    findingId: match[1],
    start: match.index ?? 0,
  }));
}

export function extractFindingTasksBlock(markdown: string): string {
  const match = /\*\*Finding Tasks:\*\*([\s\S]*?)(?=\n\*\*Agent Fix Attempts:\*\*|\n####\s+|\n\*\*User Follow-up:\*\*|\n\*\*Resolution:\*\*|$)/i.exec(
    markdown,
  );

  return match?.[1] ?? "";
}

export class HumanReviewFindingDocumentRepository {
  readonly #clock: () => string;

  constructor(clock: () => string = () => new Date().toISOString()) {
    this.#clock = clock;
  }

  acceptPhase(feature: WorkItemCard, phase: HumanReviewFindingPhaseRef): void {
    this.#markAllSolved(phase);
    this.#updatePhaseStatus(phase, "COMPLETED");
    this.#updateCheckpoint(phase, userSolvedCheckpoint, true);
    this.#updateCheckpoint(phase, responseCheckpoint, true);
    this.#updateCheckpoint(phase, verificationCheckpoint, true);
    this.#updateCheckpoint(phase, documentsCheckpoint, true);
    this.#updateFeatureTasksStatusIfPresent(feature, phase, "COMPLETED");
  }

  ensurePhase(feature: WorkItemCard): HumanReviewFindingPhaseRef {
    const phasesPath = resolve(feature.folderPath, "Phases");
    mkdirSync(phasesPath, { recursive: true });
    const phase = this.findPhase(feature) ?? this.#createPhase(feature);
    this.#ensureVerificationContract(phase);
    this.ensureTaskChecklists(phase);
    this.#ensureFeatureTasksPhase(feature, phase);
    return phase;
  }

  findPhase(feature: WorkItemCard): HumanReviewFindingPhaseRef | null {
    const phasesPath = resolve(feature.folderPath, "Phases");
    if (!existsSync(phasesPath)) return null;
    const candidates: HumanReviewFindingPhaseRef[] = [];

    for (const fileName of safeReadDirectory(phasesPath)) {
      if (!fileName.toLowerCase().endsWith(".md")) continue;
      const path = resolve(phasesPath, fileName);
      const content = readFileSync(path, "utf8");
      const title = extractPhaseTitle(fileName, content);
      if (!/human review findings/i.test(title) && !/human review findings/i.test(content)) continue;
      candidates.push({
        fileName,
        number: extractPhaseNumber(fileName, content) ?? this.#nextPhaseNumber(feature),
        path,
      });
    }

    return candidates.sort((left, right) => left.number - right.number || left.fileName.localeCompare(right.fileName))[0] ?? null;
  }

  appendFinding(
    phase: HumanReviewFindingPhaseRef,
    finding: { content: string; findingId: string; submittedAt: string },
  ): void {
    const markdown = readFileSync(phase.path, "utf8");
    const entry = [
      `### ${finding.findingId}`,
      "",
      "**Status:** IN_PROGRESS",
      `**Submitted:** ${finding.submittedAt}`,
      "",
      "**Finding:**",
      "",
      finding.content,
      "",
      "**Finding Tasks:**",
      "",
      "- [ ] Triage this finding and decide whether code, test, or documentation changes are needed.",
      "- [ ] Implement the fix or record why no code change is needed.",
      "- [ ] Add or update tests when the finding concerns behavior, coverage, or regressions.",
      "- [ ] Run configured verification checks relevant to the finding when available.",
      "- [ ] Record verification intent labels, configured evidence, remaining manual verification, and the exact result.",
      "",
      "**Agent Fix Attempts:**",
      "",
      "- Pending.",
      "",
      "**User Follow-up:**",
      "",
      "- None yet.",
      "",
      "**Resolution:** Pending user verification.",
      "",
    ].join("\n");
    const nextMarkdown = markdown.replace("No findings submitted yet.", "").trimEnd();
    writeFileSync(phase.path, `${nextMarkdown}\n\n${entry}`, "utf8");
  }

  ensureTaskChecklists(phase: HumanReviewFindingPhaseRef): void {
    const markdown = readFileSync(phase.path, "utf8");
    const sections = getHumanReviewFindingSections(markdown);
    if (sections.length === 0) return;
    let nextMarkdown = markdown;
    let offset = 0;

    for (const section of sections) {
      const start = section.start + offset;
      const end = section.end + offset;
      const sectionContent = nextMarkdown.slice(start, end);
      if (/\*\*Finding Tasks:\*\*/i.test(sectionContent)) continue;
      const taskBlock = [
        "",
        "**Finding Tasks:**",
        "",
        "- [ ] Triage this finding and decide whether code, test, or documentation changes are needed.",
        "- [ ] Implement the fix or record why no code change is needed.",
        "- [ ] Add or update tests when the finding concerns behavior, coverage, or regressions.",
        "- [ ] Run configured verification checks relevant to the finding when available.",
        "- [ ] Record verification intent labels, configured evidence, remaining manual verification, and the exact result.",
        "",
      ].join("\n");
      const insertionPoint = sectionContent.search(/\n\*\*Agent Fix Attempts:\*\*/);
      const nextSection = insertionPoint >= 0
        ? `${sectionContent.slice(0, insertionPoint).trimEnd()}${taskBlock}${sectionContent.slice(insertionPoint).trimStart()}`
        : `${sectionContent.trimEnd()}${taskBlock}`;
      const normalizedSection = isSectionReadyForUser(nextSection)
        ? setFindingTaskChecklist(nextSection, true)
        : nextSection;
      nextMarkdown = `${nextMarkdown.slice(0, start)}${normalizedSection}${nextMarkdown.slice(end)}`;
      offset += normalizedSection.length - sectionContent.length;
    }

    if (nextMarkdown !== markdown) writeFileSync(phase.path, `${nextMarkdown.trimEnd()}\n`, "utf8");
  }

  appendDetail(
    phase: HumanReviewFindingPhaseRef,
    detail: { content: string; findingId: string; submittedAt: string },
  ): void {
    this.#appendToSection(phase, detail.findingId, [
      "",
      `#### User Follow-up - ${detail.submittedAt}`,
      "",
      detail.content,
      "",
      "**Status:** IN_PROGRESS",
      "",
    ].join("\n"));
    this.#setSectionStatus(phase, detail.findingId, "IN_PROGRESS");
  }

  appendAgentResult(
    feature: WorkItemCard,
    findingId: string,
    output: string,
    resultStatus: "AWAITING_USER_ACCEPTANCE" | "IN_PROGRESS",
  ): void {
    const phase = this.ensurePhase(feature);
    this.#appendToSection(phase, findingId, [
      "",
      `#### Agent Response - ${this.#clock()}`,
      "",
      stripMarkdownFence(output).trim(),
      "",
      `**Status:** ${resultStatus}`,
      "",
    ].join("\n"));
    this.ensureTaskChecklists(phase);

    if (resultStatus === "AWAITING_USER_ACCEPTANCE" && isFindingResultReadyForUser(output)) {
      this.#setTaskChecklist(phase, findingId, true);
      this.#updateCheckpoint(phase, "Record each submitted user finding with full detail", true);
      this.#updateCheckpoint(phase, "Run a scoped finding-fix agent for each open finding", true);
      this.#updateCheckpoint(phase, "Record the agent's solution, verification evidence, and remaining manual verification", true);
      this.#updateCheckpoint(phase, responseCheckpoint, true);
      if (containsConfiguredVerificationEvidence(output)) this.#updateCheckpoint(phase, verificationCheckpoint, true);
    }

    this.#setSectionStatus(phase, findingId, resultStatus);
    this.#updatePhaseStatus(phase, resultStatus);
    this.#updateFeatureTasksStatusIfPresent(feature, phase, resultStatus);
  }

  markSolved(feature: WorkItemCard, findingId: string): void {
    const phase = this.ensurePhase(feature);
    this.#appendToSection(phase, findingId, [
      "",
      `#### User Resolution - ${this.#clock()}`,
      "",
      "User marked this finding as solved.",
      "",
      "**Status:** COMPLETED",
      "",
    ].join("\n"));
    this.#setSectionStatus(phase, findingId, "COMPLETED");
    const hasOpenFindings = this.#hasOpenFindings(phase);
    const status = hasOpenFindings ? "AWAITING_USER_ACCEPTANCE" : "COMPLETED";
    this.#updatePhaseStatus(phase, status);
    this.#updateCheckpoint(phase, userSolvedCheckpoint, !hasOpenFindings);
    this.#updateFeatureTasksStatusIfPresent(feature, phase, status);
  }

  isAwaitingUser(phase: HumanReviewFindingPhaseRef): boolean {
    const markdown = readFileSync(phase.path, "utf8");
    const status = markdown.match(/\*\*Status:\*\*\s*([A-Z_ -]+)/i)?.[1] ?? "";
    return status.trim().replace(/[ -]+/g, "_").toUpperCase() === "AWAITING_USER_ACCEPTANCE";
  }

  #createPhase(feature: WorkItemCard): HumanReviewFindingPhaseRef {
    const number = this.#nextPhaseNumber(feature);
    const fileName = `phase-${number}-human-review-findings.md`;
    const path = resolve(feature.folderPath, "Phases", fileName);
    writeFileSync(path, [
      `# Phase ${number}: ${humanReviewFindingsPhaseTitle}`,
      "",
      "**Status:** IN_PROGRESS",
      `**Created:** ${this.#clock()}`,
      "",
      "## Objective",
      "Record all user code-review and manual-test findings after implementation phases are complete. This is the single findings phase for the FEAT; each finding gets its own section and remains open until the user marks it solved.",
      "",
      "## Tasks",
      "",
      "- [ ] Record each submitted user finding with full detail.",
      "- [ ] Run a scoped finding-fix agent for each open finding.",
      "- [ ] Record the agent's solution, verification evidence, and remaining manual verification.",
      "- [ ] Accept user follow-up detail when the finding was not solved.",
      "- [ ] Close each finding only when the user marks it solved.",
      "",
      "## Findings",
      "",
      "No findings submitted yet.",
      "",
      ...verificationContractLines(),
      "## Checkpoints",
      "",
      `- [ ] ${responseCheckpoint}.`,
      `- [ ] ${verificationCheckpoint}.`,
      `- [ ] ${userSolvedCheckpoint}.`,
      `- [ ] ${documentsCheckpoint}.`,
      "",
      "## Code Review Expectations",
      "",
      "- Reviewer can trace every human finding to a fix attempt or explicit no-change rationale.",
      "- No finding is closed by the agent; only the user can mark it solved.",
      "",
    ].join("\n"), "utf8");
    return { fileName, number, path };
  }

  #ensureVerificationContract(phase: HumanReviewFindingPhaseRef): void {
    let markdown = readFileSync(phase.path, "utf8");
    const originalMarkdown = markdown;
    if (!/##\s+Verification Intent/i.test(markdown)) {
      const contract = verificationContractLines().join("\n");
      if (/##\s+Test Obligations[\s\S]*?(?=\n##\s+Checkpoints)/i.test(markdown)) {
        markdown = markdown.replace(/##\s+Test Obligations[\s\S]*?(?=\n##\s+Checkpoints)/i, `${contract}\n`);
      } else if (/##\s+Checkpoints/i.test(markdown)) {
        markdown = markdown.replace(/##\s+Checkpoints/i, `${contract}\n## Checkpoints`);
      } else {
        markdown = `${markdown.trimEnd()}\n\n${contract}`;
      }
    }
    for (const checkpoint of [responseCheckpoint, verificationCheckpoint, userSolvedCheckpoint, documentsCheckpoint]) {
      markdown = ensureCheckpointLine(markdown, checkpoint);
    }
    const nextMarkdown = `${markdown.trimEnd()}\n`;
    if (nextMarkdown !== `${originalMarkdown.trimEnd()}\n`) writeFileSync(phase.path, nextMarkdown, "utf8");
  }

  #nextPhaseNumber(feature: WorkItemCard): number {
    const numbers = feature.phases.map((phase) => phase.number).filter((number): number is number => number !== null);
    return numbers.length > 0 ? Math.max(...numbers) + 1 : 0;
  }

  #ensureFeatureTasksPhase(feature: WorkItemCard, phase: HumanReviewFindingPhaseRef): void {
    const featureTasksPath = resolve(feature.folderPath, "FeatureTasks.md");
    if (!existsSync(featureTasksPath)) return;
    const markdown = readFileSync(featureTasksPath, "utf8");
    if (/Human Review Findings/i.test(markdown)) {
      this.#updateFeatureTasksStatus(featureTasksPath, phase, "IN_PROGRESS");
      return;
    }
    const row = `| ${phase.number} | ${humanReviewFindingsPhaseTitle} | Single post-implementation phase for all user findings, fix attempts, and final user acceptance | IN_PROGRESS | Phase ${Math.max(phase.number - 1, 0)} |`;
    const lines = markdown.split(/\r?\n/);
    const phaseTableStart = lines.findIndex((line) => /^\|\s*Phase\s*\|/i.test(line));
    if (phaseTableStart < 0) {
      writeFileSync(featureTasksPath, `${markdown.trimEnd()}\n\n## Human Review Findings Phase\n\n${row}\n`, "utf8");
      return;
    }
    let insertIndex = phaseTableStart + 1;
    while (insertIndex < lines.length && /^\|/.test(lines[insertIndex] ?? "")) insertIndex += 1;
    lines.splice(insertIndex, 0, row);
    writeFileSync(featureTasksPath, `${lines.join("\n").trimEnd()}\n`, "utf8");
  }

  #updateFeatureTasksStatus(featureTasksPath: string, phase: HumanReviewFindingPhaseRef, status: FindingPhaseStatus): void {
    const lines = readFileSync(featureTasksPath, "utf8").split(/\r?\n/);
    const nextLines = lines.map((line) => {
      if (!line.includes("Human Review Findings")) return line;
      const cells = line.split("|");
      if (cells.length < 6) return line;
      const phaseCell = cells.findIndex((cell) => cell.trim() === String(phase.number));
      const statusIndex = cells.findIndex((cell) => /\b(IN_PROGRESS|PENDING|COMPLETED|SKIPPED|AWAITING_USER_ACCEPTANCE)\b/i.test(cell));
      if (phaseCell < 0 || statusIndex < 0) return line;
      cells[statusIndex] = ` ${status} `;
      return cells.join("|");
    });
    writeFileSync(featureTasksPath, `${nextLines.join("\n").trimEnd()}\n`, "utf8");
  }

  #updateFeatureTasksStatusIfPresent(feature: WorkItemCard, phase: HumanReviewFindingPhaseRef, status: FindingPhaseStatus): void {
    const featureTasksPath = resolve(feature.folderPath, "FeatureTasks.md");
    if (existsSync(featureTasksPath)) this.#updateFeatureTasksStatus(featureTasksPath, phase, status);
  }

  #setTaskChecklist(phase: HumanReviewFindingPhaseRef, findingId: string, checked: boolean): void {
    const markdown = readFileSync(phase.path, "utf8");
    const section = getSectionBounds(markdown, findingId);
    if (!section) return;
    const content = markdown.slice(section.start, section.end);
    const next = setFindingTaskChecklist(content, checked);
    if (next === content) return;
    writeFileSync(phase.path, `${markdown.slice(0, section.start)}${next}${markdown.slice(section.end)}`.trimEnd() + "\n", "utf8");
  }

  #appendToSection(phase: HumanReviewFindingPhaseRef, findingId: string, addition: string): void {
    const markdown = readFileSync(phase.path, "utf8");
    const pattern = new RegExp(`^###\\s+${escapeRegExp(findingId)}\\s*$`, "m");
    const heading = pattern.exec(markdown);
    if (!heading) {
      writeFileSync(phase.path, `${markdown.trimEnd()}\n\n### ${findingId}\n\n${addition.trim()}\n`, "utf8");
      return;
    }
    const nextHeading = markdown.slice(heading.index + heading[0].length).search(/^###\s+/m);
    const insert = nextHeading < 0 ? markdown.length : heading.index + heading[0].length + nextHeading;
    writeFileSync(phase.path, `${markdown.slice(0, insert).trimEnd()}\n${addition.trimEnd()}\n\n${markdown.slice(insert).trimStart()}`.trimEnd() + "\n", "utf8");
  }

  #setSectionStatus(phase: HumanReviewFindingPhaseRef, findingId: string, status: FindingPhaseStatus): void {
    const markdown = readFileSync(phase.path, "utf8");
    const section = getSectionBounds(markdown, findingId);
    if (!section) return;
    const content = markdown.slice(section.start, section.end);
    const next = content.replace(/\*\*Status:\*\*\s*[A-Z_]+/g, `**Status:** ${status}`);
    writeFileSync(phase.path, `${markdown.slice(0, section.start)}${next}${markdown.slice(section.end)}`.trimEnd() + "\n", "utf8");
  }

  #hasOpenFindings(phase: HumanReviewFindingPhaseRef): boolean {
    return readFileSync(phase.path, "utf8")
      .split(/^###\s+/m)
      .slice(1)
      .some((section) => /\*\*Status:\*\*\s*(IN_PROGRESS|AWAITING_USER_ACCEPTANCE)/i.test(section));
  }

  #markAllSolved(phase: HumanReviewFindingPhaseRef): void {
    const sections = getHumanReviewFindingSections(readFileSync(phase.path, "utf8"));
    const now = this.#clock();
    for (const section of sections) {
      const markdown = readFileSync(phase.path, "utf8");
      const latest = getSectionBounds(markdown, section.findingId);
      if (!latest) continue;
      const content = markdown.slice(latest.start, latest.end);
      this.#setTaskChecklist(phase, section.findingId, true);
      this.#setSectionStatus(phase, section.findingId, "COMPLETED");
      if (!/####\s+User Resolution/i.test(content)) {
        this.#appendToSection(phase, section.findingId, [
          "",
          `#### User Resolution - ${now}`,
          "",
          "User accepted the Human Review Findings phase and marked this finding as solved.",
          "",
          "**Status:** COMPLETED",
          "",
        ].join("\n"));
      }
    }
  }

  #updatePhaseStatus(phase: HumanReviewFindingPhaseRef, status: FindingPhaseStatus): void {
    const markdown = readFileSync(phase.path, "utf8");
    const next = markdown.replace(/\*\*Status:\*\*\s*[A-Z_]+/, `**Status:** ${status}`);
    writeFileSync(phase.path, `${next.trimEnd()}\n`, "utf8");
  }

  #updateCheckpoint(phase: HumanReviewFindingPhaseRef, label: string, checked: boolean): void {
    const markdown = readFileSync(phase.path, "utf8");
    const next = markdown.replace(new RegExp(`- \\[[ xX]\\] ${escapeRegExp(label)}`), `- [${checked ? "x" : " "}] ${label}`);
    writeFileSync(phase.path, `${next.trimEnd()}\n`, "utf8");
  }
}

function verificationContractLines(): string[] {
  return [
    "## Verification Intent", "", "- manual-review-ready", "- affected-tests", "- regression-risk", "",
    "## Required Evidence", "",
    "- Every submitted finding has an agent response or explicit no-change rationale.",
    "- The finding response records verification intent labels addressed by the fix.",
    "- Hepha or the finding agent records configured verification evidence for affected checks.",
    "- Remaining manual verification is recorded for the user.", "",
    "## Completion Gate", "",
    "- Keep this phase AWAITING_USER_ACCEPTANCE while any finding waits for user confirmation.",
    "- Mark this phase COMPLETED only after the user marks every finding solved and configured verification evidence is recorded.",
    "- Do not encode stack-specific test/build commands in this phase. The project verification profile owns executable commands, serialization rules, and pass/fail evidence.", "",
  ];
}

function ensureCheckpointLine(markdown: string, label: string): string {
  if (markdown.includes(label)) return markdown;
  const heading = markdown.match(/^##\s+Checkpoints\s*$/im);
  if (!heading) return `${markdown.trimEnd()}\n\n## Checkpoints\n\n- [ ] ${label}.\n`;
  const afterHeading = heading.index! + heading[0].length;
  const nextHeading = markdown.slice(afterHeading).match(/\n##\s+/);
  const insert = nextHeading?.index === undefined ? markdown.length : afterHeading + nextHeading.index;
  return `${markdown.slice(0, insert).trimEnd()}\n- [ ] ${label}.\n${markdown.slice(insert).trimStart()}`;
}

function getSectionBounds(markdown: string, findingId: string): { end: number; start: number } | null {
  const heading = new RegExp(`^###\\s+${escapeRegExp(findingId)}\\s*$`, "m").exec(markdown);
  if (!heading) return null;
  const afterHeading = markdown.slice(heading.index + heading[0].length);
  const nextHeading = afterHeading.search(/^###\s+/m);
  return {
    end: nextHeading < 0 ? markdown.length : heading.index + heading[0].length + nextHeading,
    start: heading.index,
  };
}

function setFindingTaskChecklist(markdown: string, checked: boolean): string {
  return markdown.replace(
    /(\*\*Finding Tasks:\*\*[\s\S]*?)(?=\n\*\*Agent Fix Attempts:\*\*|\n####\s+|\n\*\*User Follow-up:\*\*|\n\*\*Resolution:\*\*|$)/i,
    (block) => block.replace(/^\s*-\s+\[[ xX]\]\s+/gm, `- [${checked ? "x" : " "}] `),
  );
}

function isSectionReadyForUser(content: string): boolean {
  return /\*\*Status:\*\*\s*(AWAITING_USER_ACCEPTANCE|COMPLETED)/i.test(content) && /####\s+Agent Response/i.test(content);
}

function isFindingResultReadyForUser(output: string): boolean {
  return !/Finding Result:\s*(NEEDS_MORE_INFO|BLOCKED)/i.test(output);
}

function containsConfiguredVerificationEvidence(output: string): boolean {
  return /configured verification evidence|verification evidence|configured .*checks?.*(passed|green)|checks? run/i.test(output)
    || /\b(cargo check|cargo fmt|cargo clippy|typecheck|lint|pnpm .*typecheck|pnpm .*lint)\b/i.test(output)
    || /\b(cargo test|pnpm test|vitest|test suite|tests? run|automated tests?)\b/i.test(output);
}

function stripMarkdownFence(value: string): string {
  return value.trim().replace(/^```(?:markdown)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function safeReadDirectory(path: string): string[] {
  try {
    return existsSync(path) ? readdirSync(path) : [];
  } catch {
    return [];
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
