import { existsSync, readFileSync } from "node:fs";
import { readFeatureTasksPhaseStatusMap } from "../feature-tasks-phase-status.js";
import { cleanInlineMarkdown, extractMarkdownField, extractMarkdownSection } from "./markdown-parsing.js";

export function readFeatureTasksPhaseTiming(featureTasksPath: string) {
  const timings = new Map<number, { estimatedAiTime: string; estimatedHumanTime: string }>();

  if (!existsSync(featureTasksPath)) return timings;

  const section = extractMarkdownSection(readFileSync(featureTasksPath, "utf8"), (heading) =>
    /^implementation timing summary$/i.test(heading),
  );

  for (const line of section.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;

    const cells = line.split("|").slice(1, -1).map((cell) => cleanInlineMarkdown(cell).trim());
    const phaseNumber = /^(\d+)(?:\s|$)/.exec(cells[0] ?? "");
    const estimatedHumanTime = cells[1];
    const estimatedAiTime = cells[2];

    if (phaseNumber && estimatedHumanTime && estimatedAiTime) {
      timings.set(Number(phaseNumber[1]), { estimatedAiTime, estimatedHumanTime });
    }
  }

  return timings;
}

export function readFeatureTasksPhaseStatuses(featureTasksPath: string) {
  const statuses = new Map<number, string>();

  if (!existsSync(featureTasksPath)) {
    return statuses;
  }

  for (const [phaseNumber, status] of readFeatureTasksPhaseStatusMap(readFileSync(featureTasksPath, "utf8"))) {
    if (isKnownWorkflowStatus(status) || /\b(PENDING|NOT_STARTED|NOT STARTED|IN_PROGRESS|AWAITING_USER_ACCEPTANCE|COMPLETED|BLOCKED)\b/i.test(status)) {
      statuses.set(phaseNumber, normalizeWorkflowStatusLabel(status));
    }
  }

  return statuses;
}

export function extractPhaseNumber(fileName: string, markdown: string) {
  const fileMatch = fileName.match(/phase-(\d+)/i);

  if (fileMatch?.[1]) {
    return Number.parseInt(fileMatch[1], 10);
  }

  const headingMatch = markdown.match(/^#\s*Phase\s+(\d+)/im);

  return headingMatch?.[1] ? Number.parseInt(headingMatch[1], 10) : null;
}

export function extractPhaseStatus(markdown: string) {
  const statusLine = markdown
    .split(/\r?\n/)
    .find((line) => isStandalonePhaseStatusLine(line))
    ?.match(standalonePhaseStatusLinePattern);

  if (statusLine?.[1]) {
    return normalizeWorkflowStatusLabel(statusLine[1]);
  }

  const currentStatusLine = markdown.match(/(?:Current\s+Status|Checkpoint\s+Status|Code\s+Review\s+Status)\s*:\s*`?([^`\r\n]+)/i);

  if (currentStatusLine?.[1]) {
    return normalizeWorkflowStatusLabel(currentStatusLine[1]);
  }

  const tableLines = markdown
    .split(/\r?\n/)
    .filter((line) => /\|\s*\*{0,2}(?:Phase\s+)?Status\*{0,2}\s*\|/i.test(line));

  for (const tableLine of tableLines) {
    const cells = tableLine
      .split("|")
      .map((cell) => cleanInlineMarkdown(cell.trim()))
      .filter(Boolean);

    const statusCell =
      cells.find((cell) => cell.toLowerCase() !== "status" && isKnownWorkflowStatus(cell)) ??
      cells.find((cell) => cell.toLowerCase() !== "status" && /\b(PENDING|IN_PROGRESS|AWAITING_USER_ACCEPTANCE|COMPLETED|BLOCKED)\b/i.test(cell));

    if (statusCell) {
      return normalizeWorkflowStatusLabel(statusCell);
    }
  }

  const evidenceStatus = inferPhaseStatusFromResolvedEvidence(markdown);

  if (evidenceStatus) {
    return evidenceStatus;
  }

  return null;
}

function inferPhaseStatusFromResolvedEvidence(markdown: string) {
  const taskStates = extractHephaTaskStateStatuses(markdown);
  const hasResolvedExecutionEvidence =
    (taskStates.length > 0 && taskStates.every(isResolvedHephaTaskStatus)) ||
    hasCompletedConcreteTaskChecklist(markdown);

  if (!hasResolvedExecutionEvidence) {
    return null;
  }

  const qualityGateDecisions = extractPhaseQualityGateDecisionCells(markdown);

  if (
    qualityGateDecisions.length === 0 ||
    !qualityGateDecisions.every(isResolvedQualityGateDecision)
  ) {
    return null;
  }

  return "COMPLETED";
}

function extractHephaTaskStateStatuses(markdown: string) {
  const section = extractMarkdownSection(markdown, (heading) => /^hepha task state$/i.test(heading));

  if (!section.trim()) {
    return [];
  }

  return section
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .split("|")
        .map((cell) => cleanInlineMarkdown(cell.trim()))
        .filter(Boolean),
    )
    .filter((cells) => cells.length >= 3)
    .filter((cells) => cells[2].toLowerCase() !== "state")
    .filter((cells) => !cells.every((cell) => /^-+$/.test(cell)))
    .map((cells) => cells[2]);
}

function extractPhaseQualityGateDecisionCells(markdown: string) {
  const section = extractMarkdownSection(markdown, (heading) => /^quality gate evidence$/i.test(heading));

  if (!section.trim()) {
    return [];
  }

  return section
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .split("|")
        .map((cell) => cleanInlineMarkdown(cell.trim()))
        .filter(Boolean),
    )
    .filter((cells) => cells.length >= 2)
    .filter((cells) => cells[0].toLowerCase() !== "gate")
    .filter((cells) => !cells.every((cell) => /^-+$/.test(cell)))
    .map((cells) => cells[1]);
}

function isResolvedHephaTaskStatus(value: string) {
  const normalizedStatus = normalizeWorkflowStatusLabel(value);

  return normalizedStatus === "COMPLETED" || normalizedStatus === "SKIPPED";
}

function parseResolvedGateStatus(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/missing|required|needed|todo|pending/.test(normalized)) return "missing";
  if (/none|not applicable|n a/.test(normalized)) return "not_applicable";
  if (/waived|not required|no ui|docs only/.test(normalized)) return "waived";
  if (/satisfied|passed|present|done|complete|covered|approved/.test(normalized)) return "satisfied";
  return "unknown";
}

function isResolvedQualityGateDecision(value: string) {
  const normalized = cleanInlineMarkdown(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const status = parseResolvedGateStatus(value);

  return (
    status === "satisfied" ||
    status === "waived" ||
    status === "not_applicable" ||
    /^recorded\b/.test(normalized)
  );
}

function hasCompletedConcreteTaskChecklist(markdown: string) {
  const section = extractMarkdownSection(markdown, (heading) => /^concrete tasks$/i.test(heading));

  if (!section.trim()) {
    return false;
  }

  const checklistStates = [...section.matchAll(/^\s*-\s+\[([ xX])\]/gm)].map((match) => match[1] ?? "");

  return checklistStates.length > 0 && checklistStates.every((state) => state.toLowerCase() === "x");
}

const standalonePhaseStatusLinePattern =
  /^(?:#{1,6}\s*)?(?:[-*]\s*)?(?:\*\*)?(?:Phase\s+\d+\s+)?Status(?:\*\*)?\s*:\s*`?([^`\r\n]+)/i;

export function isStandalonePhaseStatusLine(line: string) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("|")) {
    return false;
  }

  return standalonePhaseStatusLinePattern.test(trimmed);
}

export function extractPhaseRouting(markdown: string) {
  return {
    estimatedAiTime:
      extractMarkdownField(markdown, [
        "Estimated AI Time",
        "Estimated Time AI",
        "Estimated Time (AI)",
        "Estimated Time (AI/Hour)",
        "AI Estimate",
        "AI Effort",
      ]) ?? null,
    estimatedHumanTime:
      extractMarkdownField(markdown, [
        "Estimated Human Time",
        "Estimated Time Human",
        "Estimated Time (Human)",
        "Human Estimate",
        "Human Effort",
        "Estimated Time (Man/Hour)",
      ]) ?? null,
    recommendedAgent:
      extractMarkdownField(markdown, [
        "Recommended Agent",
        "Agent Recommendation",
        "Assigned Agent",
        "Agent",
      ]) ?? null,
    recommendedModel:
      extractMarkdownField(markdown, [
        "Recommended Model",
        "Model Recommendation",
        "Assigned Model",
        "Model",
      ]) ?? null,
  };
}

export function isKnownWorkflowStatus(value: string) {
  const normalized = cleanInlineMarkdown(value).replace(/[\s-]+/g, "_");

  if (findExplicitWorkflowStatusToken(normalized)) {
    return true;
  }

  return normalized.toUpperCase().includes("RECOVERY_COMPLETE");
}

export function normalizeWorkflowStatusLabel(value: string) {
  const cleaned = cleanInlineMarkdown(value)
    .replace(/\s*<!--.*?-->\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "Unknown";
  }

  const normalized = cleaned.toUpperCase().replace(/[\s-]+/g, "_");
  const explicitStatus = findExplicitWorkflowStatusToken(normalized);

  if (explicitStatus === "CODE_REVIEW_IN_PROGRESS") {
    return "CODE_REVIEW_IN_PROGRESS";
  }

  if (explicitStatus === "CHECKPOINT_IN_PROGRESS") {
    return "CHECKPOINT_IN_PROGRESS";
  }

  if (explicitStatus === "AWAITING_USER_ACCEPTANCE") {
    return "AWAITING_USER_ACCEPTANCE";
  }

  if (explicitStatus === "AWAITING_REVIEW") {
    return "AWAITING_REVIEW";
  }

  if (explicitStatus === "IN_PROGRESS") {
    return "IN_PROGRESS";
  }

  if (explicitStatus === "RECOVERY_COMPLETE") {
    return "RECOVERY_COMPLETE";
  }

  if (explicitStatus === "COMPLETED" || explicitStatus === "COMPLETE") {
    return "COMPLETED";
  }

  if (explicitStatus === "PENDING") {
    return "PENDING";
  }

  if (explicitStatus === "NOT_STARTED") {
    return "PENDING";
  }

  if (explicitStatus === "SKIPPED") {
    return "SKIPPED";
  }

  if (explicitStatus === "BLOCKED" || explicitStatus === "FAILED" || explicitStatus === "REJECTED") {
    return "BLOCKED";
  }

  if (normalized.includes("CODE_REVIEW") && normalized.includes("PROGRESS")) {
    return "CODE_REVIEW_IN_PROGRESS";
  }

  if (normalized.includes("CHECKPOINT") && normalized.includes("PROGRESS")) {
    return "CHECKPOINT_IN_PROGRESS";
  }

  if (normalized.includes("AWAITING") && normalized.includes("ACCEPTANCE")) {
    return "AWAITING_USER_ACCEPTANCE";
  }

  if (normalized.includes("AWAITING") && normalized.includes("REVIEW")) {
    return "AWAITING_REVIEW";
  }

  if (normalized.includes("RECOVERY") && (normalized.includes("COMPLETE") || normalized.includes("COMPLETED"))) {
    return "RECOVERY_COMPLETE";
  }

  return cleaned;
}

function findExplicitWorkflowStatusToken(value: string) {
  const normalized = value.toUpperCase().replace(/[\s-]+/g, "_");
  const tokenMatch = normalized.match(
    /(?:^|[^A-Z0-9])(CODE_REVIEW_IN_PROGRESS|CHECKPOINT_IN_PROGRESS|AWAITING_USER_ACCEPTANCE|AWAITING_REVIEW|RECOVERY_COMPLETE|IN_PROGRESS|COMPLETED|COMPLETE|SKIPPED|PENDING|NOT_STARTED|BLOCKED|FAILED|REJECTED)(?=$|[^A-Z0-9])/,
  );

  return tokenMatch?.[1] ?? null;
}

export function extractPhaseTitle(fileName: string, markdown: string) {
  const heading = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));

  if (heading) {
    return cleanInlineMarkdown(heading.replace(/^#\s+/, "")).replace(/^Phase\s+\d+\s*[-:\u2013\u2014]?\s*/i, "");
  }

  return cleanInlineMarkdown(fileName.replace(/\.md$/i, "").replace(/-/g, " "));
}
