import { readFileSync } from "node:fs";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AgentRoutingStore } from "@hepha/db";
import {
  AGENT_ROUTING_SCHEMA_VERSION,
  type RouteIdentityV1,
  type RoutingCatalogRouteFactV1,
} from "@hepha/shared";
import { AgentRegistry } from "../src/agent-routing/agent-registry.js";
import { RoutingActionResolver } from "../src/agent-routing/routing-action-resolver.js";
import { RoutingPolicyService } from "../src/agent-routing/routing-policy-service.js";
import { countCargoInvocations } from "../src/cargo-safety.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, "../../..");
const orchestratorSource = readFileSync(resolve(testDir, "../src/index.ts"), "utf8");
const phaseWorkerPromptPoliciesSource = readFileSync(
  resolve(testDir, "../src/workflows/phases/phase-worker-prompt-policies.ts"),
  "utf8",
);
const phaseFoundationApplicationsSource = readFileSync(
  resolve(testDir, "../src/bootstrap/phase-foundation-applications.ts"),
  "utf8",
);
const phaseEntryApplicationsSource = readFileSync(
  resolve(testDir, "../src/bootstrap/phase-entry-applications.ts"),
  "utf8",
);
const phaseReviewApplicationsSource = readFileSync(
  resolve(testDir, "../src/bootstrap/phase-review-applications.ts"),
  "utf8",
);
const phaseWorkerApplicationsSource = readFileSync(
  resolve(testDir, "../src/bootstrap/phase-worker-applications.ts"),
  "utf8",
);
const phaseBoundaryApplicationsSource = readFileSync(
  resolve(testDir, "../src/bootstrap/phase-boundary-applications.ts"),
  "utf8",
);
const agentRuntimeApplicationsSource = readFileSync(
  resolve(testDir, "../src/bootstrap/agent-runtime-applications.ts"),
  "utf8",
);
const workItemAuthoringApplicationsSource = readFileSync(
  resolve(testDir, "../src/bootstrap/work-item-authoring-applications.ts"),
  "utf8",
);
const deepDiveApplicationsSource = readFileSync(
  resolve(testDir, "../src/bootstrap/deep-dive-applications.ts"),
  "utf8",
);
const featurePreparationApplicationsSource = readFileSync(
  resolve(testDir, "../src/bootstrap/feature-preparation-applications.ts"),
  "utf8",
);
const featureCompletionApplicationsSource = readFileSync(
  resolve(testDir, "../src/bootstrap/feature-completion-applications.ts"),
  "utf8",
);
const featureProjectionApplicationsSource = readFileSync(
  resolve(testDir, "../src/bootstrap/feature-projection-applications.ts"),
  "utf8",
);
const implementationWorkerApplicationsSource = readFileSync(
  resolve(testDir, "../src/bootstrap/implementation-worker-applications.ts"),
  "utf8",
);
const implementationRecoveryApplicationsSource = readFileSync(
  resolve(testDir, "../src/bootstrap/implementation-recovery-applications.ts"),
  "utf8",
);
const implementationRunApplicationsSource = readFileSync(
  resolve(testDir, "../src/bootstrap/implementation-run-applications.ts"),
  "utf8",
);
const workflowInfrastructureApplicationsSource = readFileSync(
  resolve(testDir, "../src/bootstrap/workflow-infrastructure-applications.ts"),
  "utf8",
);
const orchestratorRuntimeConfigurationSource = readFileSync(
  resolve(testDir, "../src/runtime/orchestrator-runtime-configuration.ts"),
  "utf8",
);
const orchestratorRuntimeSettingsSource = readFileSync(
  resolve(testDir, "../src/bootstrap/orchestrator-runtime-settings.ts"),
  "utf8",
);
const featureWorkflowMessagePolicySource = readFileSync(
  resolve(testDir, "../src/application/features/feature-workflow-message-policy.ts"),
  "utf8",
);
const featureWorkflowSummaryProjectorSource = readFileSync(
  resolve(testDir, "../src/application/features/feature-workflow-summary-projector.ts"),
  "utf8",
);
const featureWorkflowRecoveryPolicySource = readFileSync(
  resolve(testDir, "../src/application/features/feature-workflow-recovery-policy.ts"),
  "utf8",
);
const previousWorkflowFailureBriefResolverSource = readFileSync(
  resolve(testDir, "../src/workflows/recovery/previous-workflow-failure-brief-resolver.ts"),
  "utf8",
);
const designArtifactPolicySource = readFileSync(
  resolve(testDir, "../src/application/features/design-artifact-policy.ts"),
  "utf8",
);
const designFeatureExecutionApplicationSource = readFileSync(
  resolve(testDir, "../src/application/features/design-feature-execution-application.ts"),
  "utf8",
);
const refineFeatureExecutionApplicationSource = readFileSync(
  resolve(testDir, "../src/application/features/refine-feature-execution-application.ts"),
  "utf8",
);
const completeFeatureExecutionApplicationSource = readFileSync(
  resolve(testDir, "../src/application/features/complete-feature-execution-application.ts"),
  "utf8",
);
const featureFindingExecutionApplicationSource = readFileSync(
  resolve(testDir, "../src/application/features/feature-finding-execution-application.ts"),
  "utf8",
);
const startImplementationApplicationSource = readFileSync(
  resolve(testDir, "../src/application/features/start-implementation-application.ts"),
  "utf8",
);
const continueImplementationApplicationSource = readFileSync(
  resolve(testDir, "../src/application/features/continue-implementation-application.ts"),
  "utf8",
);
const startFeaturePostProcessApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/implementation/start-feature-post-process-application.ts"),
  "utf8",
);
const directImplementationSkillApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/implementation/direct-implementation-skill-application.ts"),
  "utf8",
);
const continueImplementationRunApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/implementation/continue-implementation-run-application.ts"),
  "utf8",
);
const startImplementationRunApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/implementation/start-implementation-run-application.ts"),
  "utf8",
);
const autonomousImplementationWorkflowApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/implementation/autonomous-implementation-workflow-application.ts"),
  "utf8",
);
const implementationRecoveryRetryApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/recovery/implementation-recovery-retry-application.ts"),
  "utf8",
);
const implementationAutoRecoveryApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/recovery/implementation-auto-recovery-application.ts"),
  "utf8",
);
const refinedFeatureReadinessApplicationSource = readFileSync(
  resolve(testDir, "../src/application/features/refined-feature-readiness-application.ts"),
  "utf8",
);
const refinementArtifactPolicySource = readFileSync(
  resolve(testDir, "../src/application/features/refinement-artifact-policy.ts"),
  "utf8",
);
const startFeatureTimingPolicySource = readFileSync(
  resolve(testDir, "../src/application/features/start-feature-timing-policy.ts"),
  "utf8",
);
const deepDiveCompletionApplicationSource = readFileSync(
  resolve(testDir, "../src/application/deep-dive/deep-dive-completion-application.ts"),
  "utf8",
);
const deepDiveStartApplicationSource = readFileSync(
  resolve(testDir, "../src/application/deep-dive/deep-dive-start-application.ts"),
  "utf8",
);
const epicRefinementApplicationSource = readFileSync(
  resolve(testDir, "../src/application/epics/epic-refinement-application.ts"),
  "utf8",
);
const epicSubmissionApplicationSource = readFileSync(
  resolve(testDir, "../src/application/epics/epic-submission-application.ts"),
  "utf8",
);
const featurePlanningArtifactPolicySource = readFileSync(
  resolve(testDir, "../src/workflows/phases/feature-planning-artifact-policy.ts"),
  "utf8",
);
const implementationRunSummaryProjectorSource = readFileSync(
  resolve(testDir, "../src/application/features/implementation-run-summary-projector.ts"),
  "utf8",
);
const codeReviewFindingParserSource = readFileSync(
  resolve(testDir, "../src/workflows/reviews/code-review-finding-parser.ts"),
  "utf8",
);
const codeReviewFailureContextRepositorySource = readFileSync(
  resolve(testDir, "../src/workflows/reviews/code-review-failure-context-repository.ts"),
  "utf8",
);
const previousCodeReviewFollowUpPresenterSource = readFileSync(
  resolve(testDir, "../src/workflows/reviews/previous-code-review-follow-up-presenter.ts"),
  "utf8",
);
const focusedGitCommitAdapterSource = readFileSync(
  resolve(testDir, "../src/infrastructure/git/focused-git-commit-adapter.ts"),
  "utf8",
);
const phaseStatusDocumentRepositorySource = readFileSync(
  resolve(testDir, "../src/workflows/phases/phase-status-document-repository.ts"),
  "utf8",
);
const routingActionResolverSource = readFileSync(
  resolve(testDir, "../src/agent-routing/routing-action-resolver.ts"),
  "utf8",
);
const routingTestRoute = { connectionId: "pi-session", modelId: "catalog-model" } as RouteIdentityV1;
const routingTestFact: RoutingCatalogRouteFactV1 = {
  schemaVersion: AGENT_ROUTING_SCHEMA_VERSION,
  route: routingTestRoute,
  connectionActive: true,
  available: true,
  contextWindowTokens: 128_000,
  tools: true,
  api: true,
  reasoning: true,
};

function createRoutingTestResolver() {
  const store = AgentRoutingStore.createInMemory();
  const service = new RoutingPolicyService({
    catalogFacts: () => [routingTestFact],
    registry: new AgentRegistry(),
    store,
  });
  const bootstrap = service.resolve({
    actionId: "code-review",
    bootstrap: {
      route: routingTestRoute,
      occurredAt: "2026-07-23T06:00:00.000Z",
      actor: "model-routing-test",
      correlationId: "model-routing",
    },
  });
  if (!bootstrap.ok) throw new Error(`${bootstrap.code}: ${bootstrap.message}`);
  return { resolver: new RoutingActionResolver(service), service, store };
}
const projectLessonsLearnedContextReaderSource = readFileSync(
  resolve(testDir, "../src/application/context/project-lessons-learned-context-reader.ts"),
  "utf8",
);
const featureWorkflowContextCollectorSource = readFileSync(
  resolve(testDir, "../src/application/context/feature-workflow-context-collector.ts"),
  "utf8",
);
const deepDiveDocumentUpdaterSource = readFileSync(
  resolve(testDir, "../src/application/deep-dive/deep-dive-document-updater.ts"),
  "utf8",
);
const deepDiveQuestionPlannerSource = readFileSync(
  resolve(testDir, "../src/application/deep-dive/deep-dive-question-planner.ts"),
  "utf8",
);
const phaseQualityEvidencePolicySource = readFileSync(
  resolve(testDir, "../src/workflows/phases/phase-quality-evidence-policy.ts"),
  "utf8",
);
const phaseLifecyclePolicySource = readFileSync(
  resolve(testDir, "../src/workflows/phases/phase-lifecycle-policy.ts"),
  "utf8",
);
const implementationFailureClassifierSource = readFileSync(
  resolve(testDir, "../src/workflows/recovery/implementation-failure-classifier.ts"),
  "utf8",
);
const knownWorkflowRecoveryPreparerSource = readFileSync(
  resolve(testDir, "../src/workflows/recovery/known-workflow-recovery-preparer.ts"),
  "utf8",
);
const workflowFailureBriefPresenterSource = readFileSync(
  resolve(testDir, "../src/workflows/recovery/workflow-failure-brief-presenter.ts"),
  "utf8",
);
const workflowMachineStateRepositorySource = readFileSync(
  resolve(testDir, "../src/workflows/recovery/workflow-machine-state-repository.ts"),
  "utf8",
);
const phaseScannerSource = readFileSync(
  resolve(testDir, "../src/memorybank/phase-scanner.ts"),
  "utf8",
);
const markdownParsingSource = readFileSync(
  resolve(testDir, "../src/memorybank/markdown-parsing.ts"),
  "utf8",
);
const phaseExitApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/phases/phase-exit-application.ts"),
  "utf8",
);
const phaseReviewResumePlannerSource = readFileSync(
  resolve(testDir, "../src/workflows/phases/phase-review-resume-planner.ts"),
  "utf8",
);
const phaseReviewRequirementPlannerSource = readFileSync(
  resolve(testDir, "../src/workflows/phases/phase-review-requirement-planner.ts"),
  "utf8",
);
const phaseReviewRequirementApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/reviews/phase-review-requirement-application.ts"),
  "utf8",
);
const phasePostWorkerReviewApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/reviews/phase-post-worker-review-application.ts"),
  "utf8",
);
const phaseReviewPublicationApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/reviews/phase-review-publication-application.ts"),
  "utf8",
);
const phaseWorkerDispatchPlannerSource = readFileSync(
  resolve(testDir, "../src/workflows/phases/phase-worker-dispatch-planner.ts"),
  "utf8",
);
const phaseExecutionPlanningApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/phases/phase-execution-planning-application.ts"),
  "utf8",
);
const phaseWorkerEntryApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/phases/phase-worker-entry-application.ts"),
  "utf8",
);
const phaseReviewExecutionApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/reviews/phase-review-execution-application.ts"),
  "utf8",
);
const phaseReviewLifecycleApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/reviews/phase-review-lifecycle-application.ts"),
  "utf8",
);
const phaseReviewDispatchApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/reviews/phase-review-dispatch-application.ts"),
  "utf8",
);
const phaseReviewStateApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/reviews/phase-review-state-application.ts"),
  "utf8",
);
const phaseReviewGateHandoffApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/reviews/phase-review-gate-handoff-application.ts"),
  "utf8",
);
const phasePreReviewRoutingApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/reviews/phase-pre-review-routing-application.ts"),
  "utf8",
);
const phaseEntryPreparationApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/phases/phase-entry-preparation-application.ts"),
  "utf8",
);
const phaseProgressRecorderSource = readFileSync(
  resolve(testDir, "../src/workflows/phases/phase-progress-recorder.ts"),
  "utf8",
);
const phaseExecutionAuditSource = readFileSync(
  resolve(testDir, "../src/workflows/phases/phase-execution-audit.ts"),
  "utf8",
);
const declaredVerificationTaskApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/phases/declared-verification-task-application.ts"),
  "utf8",
);
const implementationWorkerFailureSource = readFileSync(
  resolve(testDir, "../src/workflows/phases/implementation-worker-failure.ts"),
  "utf8",
);
const implementationWorkerApplicationSource = readFileSync(
  resolve(testDir, "../src/workflows/phases/implementation-worker-application.ts"),
  "utf8",
);
const featureEntryPromptsSource = readFileSync(
  resolve(testDir, "../src/workflows/prompts/feature-entry-prompts.ts"),
  "utf8",
);
const startFeaturePostProcessPromptSource = readFileSync(
  resolve(testDir, "../src/workflows/prompts/start-feature-post-process-prompt.ts"),
  "utf8",
);
const phaseImplementationEntryPolicySource = readFileSync(
  resolve(testDir, "../src/workflows/prompts/phase-implementation-entry-policy.ts"),
  "utf8",
);
const resilientErrorPathSource = readFileSync(
  resolve(testDir, "../src/workflows/prompts/resilient-error-path.ts"),
  "utf8",
);
const phaseGateEvidencePromptSource = readFileSync(
  resolve(testDir, "../src/workflows/prompts/phase-gate-evidence-prompt.ts"),
  "utf8",
);
const phasePlanningAcceptancePromptSource = readFileSync(
  resolve(testDir, "../src/workflows/prompts/phase-planning-acceptance-prompt.ts"),
  "utf8",
);
const phaseReviewRemediationPromptSource = readFileSync(
  resolve(testDir, "../src/workflows/prompts/phase-review-remediation-prompt.ts"),
  "utf8",
);
const phaseExecutionSafetyPromptSource = readFileSync(
  resolve(testDir, "../src/workflows/prompts/phase-execution-safety-prompt.ts"),
  "utf8",
);
const phaseImplementationPromptSource = readFileSync(
  resolve(testDir, "../src/workflows/prompts/phase-implementation-prompt.ts"),
  "utf8",
);
const phaseCodeReviewScopePromptSource = readFileSync(
  resolve(testDir, "../src/workflows/prompts/phase-code-review-scope-prompt.ts"),
  "utf8",
);
const phaseCodeReviewFindingContractPromptSource = readFileSync(
  resolve(testDir, "../src/workflows/prompts/phase-code-review-finding-contract-prompt.ts"),
  "utf8",
);
const phaseCodeReviewAdjudicationPromptSource = readFileSync(
  resolve(testDir, "../src/workflows/prompts/phase-code-review-adjudication-prompt.ts"),
  "utf8",
);
const phaseCodeReviewExecutionPromptSource = readFileSync(
  resolve(testDir, "../src/workflows/prompts/phase-code-review-execution-prompt.ts"),
  "utf8",
);
const phaseCodeReviewManifestPromptSource = readFileSync(
  resolve(testDir, "../src/workflows/prompts/phase-code-review-manifest-prompt.ts"),
  "utf8",
);
const phaseCodeReviewPromptSource = readFileSync(
  resolve(testDir, "../src/workflows/prompts/phase-code-review-prompt.ts"),
  "utf8",
);
const completeFeaturePromptSource = readFileSync(
  resolve(testDir, "../src/workflows/prompts/complete-feature-prompt.ts"),
  "utf8",
);
const workflowRecoveryPromptSource = readFileSync(
  resolve(testDir, "../src/workflows/prompts/workflow-recovery-prompt.ts"),
  "utf8",
);
const refineFeatureCommandTemplate = readFileSync(
  resolve(workspaceRoot, ".hepha/commands/refine-feature.md"),
  "utf8",
);
const refineFeatureSkill = readFileSync(
  resolve(
    workspaceRoot,
    "pi-packages/pi-skill-hepha-continue-implementation/skills/refine-feature/SKILL.md",
  ),
  "utf8",
);
const refineFeatureOutputSchema = readFileSync(
  resolve(workspaceRoot, ".hepha/schemas/refine-feature-result.schema.json"),
  "utf8",
);
const deepDiveEpicWorkflow = readFileSync(
  resolve(workspaceRoot, ".workflows/deep-dive-epic.workflow.yaml"),
  "utf8",
);
const startFeatureSkill = readFileSync(
  resolve(workspaceRoot, "pi-packages/pi-skill-hepha-continue-implementation/skills/start-feature/SKILL.md"),
  "utf8",
);
const normalizedRefineFeatureCommandTemplate = normalizeSourceText(refineFeatureCommandTemplate);

function getFunctionSource(functionName: string) {
  const source = [orchestratorSource, featureEntryPromptsSource, startFeaturePostProcessPromptSource, phaseImplementationPromptSource, phaseCodeReviewPromptSource, completeFeaturePromptSource, workflowRecoveryPromptSource, phaseQualityEvidencePolicySource, implementationFailureClassifierSource, knownWorkflowRecoveryPreparerSource, workflowFailureBriefPresenterSource, projectLessonsLearnedContextReaderSource, deepDiveDocumentUpdaterSource, deepDiveQuestionPlannerSource].find((candidate) =>
    candidate.includes(`function ${functionName}`),
  ) ?? "";
  const start = source.indexOf(`function ${functionName}`);
  const ordinaryEnd = source.indexOf("\nfunction ", start + 1);
  const exportedEnd = source.indexOf("\nexport function ", start + 1);
  const ends = [ordinaryEnd, exportedEnd].filter((end) => end >= 0);
  const end = ends.length > 0 ? Math.min(...ends) : -1;

  return source.slice(start, end === -1 ? undefined : end);
}

function normalizeSourceText(source: string) {
  return source.replace(/\s+/g, " ");
}

describe("model routing", () => {
  it("routes ChatGPT-backed Codex models through Pi openai-codex auth", () => {
    const { resolver, store } = createRoutingTestResolver();
    try {
      const plan = resolver.resolvePlan("code-review");
      expect(plan.resolvedRoute.action.actionId).toBe("code-review");
      expect(plan.resolvedRoute.action.roleId).toBe("code-review-agent");
      expect(plan.resolvedRoute.route).toEqual(routingTestRoute);
      expect(plan).not.toHaveProperty("authentication");
    } finally { store.close(); }
  });

  it("fails V1 review rejection and gate denial before fingerprint or progressive recovery", () => {
    const recoverySource = implementationAutoRecoveryApplicationSource;
    const v1FailureSource = getFunctionSource("isAuthoritativeV1ReviewFailure");

    expect(v1FailureSource).toContain('errorMessage.includes("REVIEW_CONTRACT_V1_")');
    expect(recoverySource.indexOf("isFatalFailure(errorMessage)")).toBeLessThan(
      recoverySource.indexOf("const codeReviewFailure = this.dependencies.isCodeReviewFailure(errorMessage)"),
    );
    expect(recoverySource).not.toContain("evaluateFingerprintRecovery({");
    expect(phaseReviewLifecycleApplicationSource).toContain("REVIEW_CONTRACT_V1_VALIDATION_DENIED");
    expect(phaseReviewPublicationApplicationSource).toContain("REVIEW_CONTRACT_V1_INGESTION_DENIED");
    expect(phaseExitApplicationSource).toContain("REVIEW_CONTRACT_V1_GATE_DENIED");
  });

  it("keeps DeepSeek models on API-key auth", () => {
    const { service, store } = createRoutingTestResolver();
    try {
      expect(service.resolve({ actionId: "deepseek-v4-fast", bootstrap: null })).toMatchObject({
        ok: false,
        code: "ROUTING_UNKNOWN_ACTION",
      });
      expect(routingActionResolverSource).not.toContain("process.env");
      expect(routingActionResolverSource).not.toMatch(/DEFAULT_[A-Z_]+_MODEL/);
    } finally { store.close(); }
  });

  it("keeps explicit model selection for each workflow category", () => {
    const { resolver, store } = createRoutingTestResolver();
    try {
      expect(featurePreparationApplicationsSource).toContain('routeResolver.resolvePlan("design-feature")');
      expect(workItemAuthoringApplicationsSource).toContain('dependencies.routeResolver.resolvePlan("submit-feature")');
      expect(implementationWorkerApplicationsSource).toContain("dependencies.routeResolver.resolvePlan(input.agentAction)");
      expect(routingActionResolverSource).not.toContain("actionForWorkflowCommand");
      expect(resolver.resolvePlan("ui-requirement-evaluation").resolvedRoute.action.actionType).toBe("discovery_planning");
      expect(resolver.resolvePlan("start-feature").resolvedRoute.action.actionType).toBe("implementation");
    } finally { store.close(); }
  });

  it("reloads local environment values for every Pi process spawn", () => {
    expect(orchestratorRuntimeSettingsSource).toContain("createPiProcessEnvironment");
    expect(orchestratorSource).toContain("createPiProcessEnv,");
    expect(agentRuntimeApplicationsSource).toContain("baseEnvironment: settings.createPiProcessEnv");
    expect(orchestratorRuntimeSettingsSource).toContain("readUserEnvironmentValue: readWindowsUserEnvironmentValue");
  });

  it("routes lifecycle operations through explicit workflow model defaults", () => {
    const { resolver, store } = createRoutingTestResolver();
    try {
      expect(resolver.resolvePlan("deep-dive").resolvedRoute.route.modelId).toBe("catalog-model");
      expect(resolver.resolvePlan("design-feature").resolvedRoute.route.modelId).toBe("catalog-model");
      expect(resolver.resolvePlan("refine-feature").resolvedRoute.route.modelId).toBe("catalog-model");
      expect(resolver.resolvePlan("complete-feature").resolvedRoute.route.modelId).toBe("catalog-model");
      expect(routingActionResolverSource).not.toContain("node.model");
    } finally { store.close(); }
  });

  it("routes command-level implementation phases through workflow transition models", () => {
    const { resolver, store } = createRoutingTestResolver();
    try {
      expect(resolver.resolvePlan("phase-worker").resolvedRoute.route.modelId).toBe("catalog-model");
      expect(resolver.resolvePlan("phase-worker").resolvedRoute.route.modelId).toBe("catalog-model");
      expect(resolver.resolvePlan("resolve-review-findings").resolvedRoute.route.modelId).toBe("catalog-model");
      expect(resolver.resolvePlan("code-review").resolvedRoute.route.modelId).toBe("catalog-model");
      expect(autonomousImplementationWorkflowApplicationSource).toContain("this.resolveWorkflowPlans(input.agentAction)");
      expect(autonomousImplementationWorkflowApplicationSource).toContain("workflowModelRoutes.resolveFindingsModel");
      expect(autonomousImplementationWorkflowApplicationSource).toContain("workflowModelRoutes.reviewGateModel");
      expect(orchestratorSource).not.toContain('plan: handoffPlan("deepseek-v4-flash")');
    } finally { store.close(); }
  });

  it("routes finalization and finding workers through explicit model sources", () => {
    const { resolver, store } = createRoutingTestResolver();
    try {
      expect(completeFeatureExecutionApplicationSource).toContain('agentName: "Complete Feature Agent"');
      expect(featureFindingExecutionApplicationSource).toContain('agentName: "Human Review Finding Agent"');
      expect(featureCompletionApplicationsSource).toContain('routeResolver.resolvePlan("complete-feature")');
      expect(featurePreparationApplicationsSource).toContain('dependencies.routeResolver.resolvePlan("resolve-review-findings")');
      expect(featureFindingExecutionApplicationSource).toContain("plan: this.dependencies.chooseModel()");
      expect(resolver.resolvePlan("complete-feature").resolvedRoute.action.roleId).toBe("completion-agent");
      expect(resolver.resolvePlan("resolve-review-findings").resolvedRoute.action.roleId).toBe("implementation-agent");
      expect(orchestratorSource).not.toContain('plan: handoffPlan("deepseek-v4-flash")');
    } finally { store.close(); }
  });

  it("routes deep-dive, design, refine, and code-review workers through workflow models", () => {
    const { resolver, store } = createRoutingTestResolver();
    try {
      expect(deepDiveApplicationsSource).toContain('routeResolver.resolvePlan("deep-dive")');
      expect(featurePreparationApplicationsSource).toContain('routeResolver.resolvePlan("design-feature")');
      expect(featurePreparationApplicationsSource).toContain('routeResolver.resolvePlan("refine-feature")');
      expect(featurePreparationApplicationsSource).toContain('dependencies.routeResolver.resolvePlan("resolve-review-findings")');
      expect(resolver.resolvePlan("deep-dive").resolvedRoute.action.roleId).toBe("requirements-agent");
      expect(resolver.resolvePlan("design-feature").resolvedRoute.action.roleId).toBe("ux-design-agent");
      expect(resolver.resolvePlan("refine-feature").resolvedRoute.action.roleId).toBe("planning-agent");
      expect(resolver.resolvePlan("code-review").resolvedRoute.action.roleId).toBe("code-review-agent");
    } finally { store.close(); }
  });

  it("routes EPIC authoring and EPIC deep-dive through Codex 5.6 Terra by default", () => {
    const { resolver, store } = createRoutingTestResolver();
    try {
      expect(epicSubmissionApplicationSource).toContain("this.dependencies.chooseModel()");
      expect(epicRefinementApplicationSource).toContain("this.dependencies.chooseModel()");
      expect(workItemAuthoringApplicationsSource).toContain('dependencies.routeResolver.resolvePlan("submit-epic")');
      expect(resolver.resolvePlan("submit-epic").resolvedRoute.action.roleId).toBe("product-architect");
      expect(resolver.resolvePlan("refine-epic").resolvedRoute.action.roleId).toBe("product-architect");
      expect(deepDiveEpicWorkflow).not.toContain("model:");
    } finally { store.close(); }
  });

  it("routes design-feature and refine-feature through direct skill prompts", () => {
    const buildDesignSource = getFunctionSource("buildDesignFeaturePrompt");
    const buildRefineSource = getFunctionSource("buildRefineFeaturePrompt");
    const executeRefineSource = refineFeatureExecutionApplicationSource;

    expect(buildDesignSource).toContain('design-feature ${formatProjectSkillTarget(project, feature, "")}');
    expect(buildRefineSource).toContain('refine-feature ${formatProjectSkillTarget(project, feature, "")}');
    expect(buildRefineSource).toContain("Project id: ${project.id}");
    expect(buildRefineSource).toContain("Canonical feature id: ${feature.externalId.toLowerCase()}");
    expect(featureProjectionApplicationsSource).toContain("new RefinementArtifactPolicy");
    expect(refinementArtifactPolicySource).toContain("getMissingPaths");
    expect(refinementArtifactPolicySource).toContain('feature.stateFolder === "03_IN_PROGRESS"');
    expect(featureProjectionApplicationsSource).toContain("validateInProgress: devCycleContinuation");
    expect(featureProjectionApplicationsSource).toContain("? validateDevCycleImplementationArtifacts");
    expect(featureProjectionApplicationsSource).toContain(": validatePhaseExecutionArtifacts");
    expect(orchestratorSource).not.toContain("function getRefinementPhaseFileNames");
    expect(executeRefineSource).toContain("this.dependencies.validateArtifacts");
    expect(featurePreparationApplicationsSource).toContain("validateArtifacts: validateRefinePromotionArtifacts");
    expect(executeRefineSource).toContain("Refine Feature skill did not move the FEAT to Ready To Develop");
    expect(executeRefineSource).toContain("this.dependencies.confirmReadiness");
    expect(executeRefineSource).not.toContain('loadPromptNodeContextPack("refine-feature", "generate-artifacts")');
    expect(executeRefineSource).not.toContain("prependHephaContextPackContract");
  });

  it("requires one identity-bound architecture-debt touch plan before refinement or Start Feature succeeds", () => {
    const runStartSource = startImplementationApplicationSource;

    for (const refineContract of [refineFeatureSkill, refineFeatureCommandTemplate]) {
      expect(refineContract).toContain("ArchitectureDebtTouchPlan.json");
      expect(refineContract).toContain("hepha-architecture-debt-touch-plan/v1");
      expect(refineContract).toContain("projectId");
      expect(refineContract).toContain("featureId");
      expect(refineContract.toLowerCase()).toMatch(/at\s+least\s+one/);
    }
    expect(refineFeatureOutputSchema).toContain('"const": "ArchitectureDebtTouchPlan.json"');
    expect(refineFeatureOutputSchema).toContain('"const": "PhaseExecutionContract.json"');
    expect(refineFeatureOutputSchema).toContain('"const": "planning-analysis-report.md"');
    expect(refineFeatureOutputSchema).toContain("Phases/phase-[0-9]+");
    expect(refineFeatureOutputSchema).not.toContain("Phases/[^/]+");
    expect(runStartSource).toContain("validateRefinement(");
    expect(runStartSource).toContain("feature.folderPath, project.id, feature.externalId.toLowerCase()");
    expect(runStartSource).not.toContain("assertArchitectureDebtRefinementReadiness");
    expect(refinedFeatureReadinessApplicationSource).toContain('authority: actorId ? { actorId, verifiedRole: "ARCHITECTURE_STEWARD" } : null');
  });

  it("requires refine-feature to seed phase quality gate checkpoints", () => {
    for (const refineContract of [refineFeatureSkill, refineFeatureCommandTemplate]) {
      const normalizedRefineContract = normalizeSourceText(refineContract);

      expect(refineContract).toContain("## Phase Quality Gate Template");
      expect(refineContract).toContain("## Phase Status Metadata Template");
      expect(refineContract).toContain("**Status:** PENDING");
      expect(refineContract).toContain("**Primary Model:** -");
      expect(normalizedRefineContract).toContain("machine-readable `Status` column");
      expect(refineContract).toContain("## Quality Gate Evidence");
      expect(refineContract).toContain("| Changed files | missing |");
      expect(refineContract).toContain("| Tests | missing |");
      expect(refineContract).toContain("| Gherkin/Playwright E2E | missing |");
      expect(refineContract).toContain("| Code review | <code-review-decision> |");
      expect(normalizedRefineContract).toContain("The Code review gate must be initialized from the ordered tasks, not guessed");
      expect(normalizedRefineContract).toContain("must never appear in a generated phase file");
      expect(normalizedRefineContract).toContain("Production code changes require automated tests or a precise waiver");
      expect(normalizedRefineContract).toContain(
        "Browser/UI behavior changes require Gherkin/Playwright E2E evidence or a precise waiver",
      );
      expect(normalizedRefineContract).toContain("Code-relevant phases require a persisted code-review report");
    }

    expect(normalizeSourceText(refineFeatureSkill)).toContain("Do not mark gate rows `satisfied` during refinement");
    expect(normalizeSourceText(refineFeatureCommandTemplate)).toContain("must not mark implementation gates as satisfied");
  });

  it("keeps both Refine Feature instruction sources on the mandatory V3 phase contract", () => {
    for (const refineContract of [refineFeatureSkill, refineFeatureCommandTemplate]) {
      expect(refineContract).toContain("hepha-phase-execution/v3");
      expect(normalizeSourceText(refineContract)).toContain("V1 and V2 are historical read compatibility only");
      expect(refineContract).toContain('gitCheckpoint: "commit_and_push"');
      expect(refineContract).toContain("## Git Checkpoint");
      expect(refineContract).not.toMatch(/Create `PhaseExecutionContract\.json`[^#]+hepha-phase-execution\/v2/s);
    }
  });

  it("makes contract-declared full-validation boundary roles repair every configured profile failure", () => {
    for (const refineContract of [refineFeatureSkill, refineFeatureCommandTemplate]) {
      const normalizedRefineContract = normalizeSourceText(refineContract);

      expect(normalizedRefineContract).toContain("declared `verification` task with `profile: \"full\"` must request `full-verification` evidence");
      expect(normalizedRefineContract).toContain("every configured full build, typecheck, lint, or test failure is a current regression or exposed contract drift");
      expect(normalizedRefineContract).toContain("cannot be called unrelated, pre-existing, or out of scope");
    }

    const phaseImplementationSource = getFunctionSource("buildPhaseImplementationPrompt");
    expect(phaseImplementationSource).toContain("renderPhaseExecutionPreparationRules");
    expect(phaseExecutionSafetyPromptSource).toContain("Every phase whose execution contract declares final validation `full`");
    expect(phaseExecutionSafetyPromptSource).toContain("Do not complete, waive, or downgrade that gate while any configured full-profile check fails");
    expect(declaredVerificationTaskApplicationSource).toContain("for (;;)");
    expect(declaredVerificationTaskApplicationSource).toContain('verification.aggregate.status === "passed"');
    expect(declaredVerificationTaskApplicationSource).toContain("runRepairWorker");
    expect(declaredVerificationTaskApplicationSource).toContain("reported a genuine blocker");
  });

  it("counts missing phase quality gates only after a phase is resolved", () => {
    const countMissingSource = getFunctionSource("countMissingPhaseQualityGates");
    const getFirstMissingSource = getFunctionSource("getFirstMissingPhaseQualityGate");
    const resolvedPhaseSource = getFunctionSource("isResolvedPhaseQualitySummary");

    expect(countMissingSource).toContain("isResolvedPhaseQualitySummary(phase)");
    expect(getFirstMissingSource).toContain("isResolvedPhaseQualitySummary(phase)");
    expect(resolvedPhaseSource).toContain('normalizedStatus === "COMPLETED"');
    expect(resolvedPhaseSource).toContain('normalizedStatus === "SKIPPED"');
  });

  it("renders a complete table row when Hepha reopens a code-review gate", () => {
    const rerunStateSource = phaseStatusDocumentRepositorySource;

    expect(rerunStateSource).toContain(
      '"$1 missing $2 Fixer responses are complete; awaiting an independent code-review rerun. |"',
    );
    expect(rerunStateSource).toContain("if (!codeReviewRow.test(markdown))");
    expect(rerunStateSource).toContain("return;");
  });

  it("gives refine-feature a stall circuit without a default wall-clock maximum", () => {
    const executeRefineSource = refineFeatureExecutionApplicationSource;

    expect(orchestratorRuntimeSettingsSource).toContain("HEPHA_PI_REFINE_FEATURE_STALL_TIMEOUT_MS");
    expect(orchestratorRuntimeSettingsSource).toContain("HEPHA_PI_REFINE_FEATURE_MAX_RUNTIME_MS");
    expect(orchestratorSource).toContain("refineFeatureStallTimeoutMs");
    expect(orchestratorSource).toContain("refineFeatureMaxRuntimeMs");
    expect(featurePreparationApplicationsSource).toContain("stallTimeoutMs: dependencies.refineFeatureStallTimeoutMs");
    expect(featurePreparationApplicationsSource).toContain("maxRuntimeMs: dependencies.refineFeatureMaxRuntimeMs");
    expect(executeRefineSource).toContain("stallTimeoutMs: this.dependencies.stallTimeoutMs");
    expect(executeRefineSource).toContain("maxRuntimeMs: this.dependencies.maxRuntimeMs");
    expect(executeRefineSource).toContain('timeoutLabel: "Refine Feature Pi run"');
  });

  it("recovers refine-feature timeouts when ready artifacts were created", () => {
    const executeRefineSource = refineFeatureExecutionApplicationSource;
    const recoverySource = refineFeatureExecutionApplicationSource;
    const workflowSummarySource = featureWorkflowSummaryProjectorSource;

    expect(executeRefineSource).toContain("this.recordRecovered");
    expect(recoverySource).toContain('refreshed.stateFolder !== "02_READY_TO_DEVELOP"');
    expect(recoverySource).toContain("this.assertArtifacts(refreshed, input.project)");
    expect(recoverySource).toContain("this.dependencies.confirmReadiness");
    expect(recoverySource).toContain("recordFeatureWorkflowCompletion");
    expect(recoverySource).toContain("createRecoveredSummary");
    expect(workflowSummarySource).toContain("isSupersededWorkflowFailure");
    expect(workflowSummarySource).toContain("recoveredOutcome?.workflowMessage");
    expect(workflowSummarySource).toContain('metadata?.workflowCommand === "refine-feature"');
    expect(featureProjectionApplicationsSource).toContain(
      "isSupersededWorkflowFailure: isSupersededFeatureWorkflowFailure",
    );
    expect(orchestratorSource).not.toContain("function createRecoveredFeatureWorkflowOutcome");
    expect(featureWorkflowRecoveryPolicySource).toContain("No required refinement artifacts are missing.");
  });

  it("resolves phase executor models from workflow routes without ordinal prediction", () => {
    const { resolver, store } = createRoutingTestResolver();
    try {
      expect(implementationRecoveryApplicationsSource).toContain('dependencies.routeResolver.resolvePlan("workflow-recovery")');
      expect(implementationWorkerApplicationsSource).toContain("dependencies.routeResolver.resolvePlan(input.agentAction)");
      expect(resolver.resolvePlan("continue-implementing").resolvedRoute.route.modelId).toBe("catalog-model");
      expect(orchestratorSource).not.toContain("function getPhaseWorkflowModelPrediction");
      expect(phaseScannerSource).toContain("predictedModel: null");
      expect(phaseScannerSource).toContain('predictedModelSource: "unavailable_phase_override"');
    } finally { store.close(); }
  });

  it("persists failed-run recovery context into retry prompts and lessons learned", () => {
    expect(orchestratorSource).toContain("previousWorkflowFailureBriefResolver.resolve(feature)");
    expect(orchestratorSource).not.toContain("function createPreviousWorkflowFailureBrief");
    expect(previousWorkflowFailureBriefResolverSource).toContain("## Previous Workflow Failure Brief");
    expect(getFunctionSource("buildCompleteFeaturePrompt")).toContain(
      "LessonsLearned/${feature.externalId.toLowerCase()}-lessons-learned.md",
    );
    expect(orchestratorSource).toContain("projectLessonsLearnedContextReader.render(project,");
    expect(phaseExecutionSafetyPromptSource).toContain("Every configured full build, typecheck, lint, or test failure is a current regression or exposed contract drift");
    expect(phaseExecutionSafetyPromptSource).toContain("Do not complete, waive, or downgrade that gate while any configured full-profile check fails");
  });

  it("uses LessonsLearned as enforced context for future feature workflows", () => {
    const collectContextSource = featureWorkflowContextCollectorSource;
    const lessonsContextSource = projectLessonsLearnedContextReaderSource;

    expect(collectContextSource).toContain("interface FeatureWorkflowContextOptions");
    expect(collectContextSource).toContain("lessonContext: ProjectLessonsLearnedContextOptions");
    expect(collectContextSource).not.toContain("lessonContext?: ProjectLessonsLearnedContextOptions");
    expect(collectContextSource).toContain("sections.push(this.dependencies.renderLessons(project, options.lessonContext))");
    expect(collectContextSource).not.toContain(
      '...collectMarkdownDocuments(resolve(project.memoryBankPath, "LessonsLearned")',
    );
    expect(lessonsContextSource).toContain("MemoryBank LessonsLearned path");
    expect(lessonsContextSource).toContain("Previous code-review suggestions are prevention rules");
    expect(lessonsContextSource).toContain("collectProjectActiveLessonDocuments");
    expect(lessonsContextSource).toContain("Active Rule Documents Selected For This Run");
    expect(lessonsContextSource).toContain("Raw lesson documents are fallback audit context");
    expect(lessonsContextSource).toContain("Active Rules Selected For This Run");
    expect(projectLessonsLearnedContextReaderSource).toContain("function createProjectLessonsLearnedFocus");
    expect(projectLessonsLearnedContextReaderSource).toContain("function extractLessonFocusTerms");
    expect(projectLessonsLearnedContextReaderSource).toContain("function scoreProjectActiveLessonDocument");
    expect(projectLessonsLearnedContextReaderSource).toContain("function collectProjectLessonActiveRules");
    expect(projectLessonsLearnedContextReaderSource).toContain("safeReadDirectory(project.rootPath)");
    expect(projectLessonsLearnedContextReaderSource).toContain("review suggestions");
    expect(getFunctionSource("buildCompleteFeaturePrompt")).toContain(
      "LessonsLearned target path that must exist before success",
    );
    expect(orchestratorSource).not.toContain("function assertFeatureLessonsLearnedDocument");
    expect(getFunctionSource("buildDesignFeaturePrompt")).toContain("design-feature ${formatProjectSkillTarget(project, feature, \"\")}");
    expect(designFeatureExecutionApplicationSource).toContain("artifactPolicy.assertComplete(currentFeature)");
    expect(designArtifactPolicySource).toContain("requiredDesignArtifacts");
    expect(refineFeatureExecutionApplicationSource).toContain("this.dependencies.validateArtifacts(feature.folderPath");
    expect(orchestratorSource).not.toContain("function assertRefineFeatureArtifacts");
    expect(normalizedRefineFeatureCommandTemplate).toContain("command serialization or lock-contention lesson");
    const startFeaturePostProcessPrompt = getFunctionSource("buildStartFeaturePostProcessPrompt");
    expect(startFeaturePostProcessPrompt).toContain(
      "If Refine Feature missed a relevant prior lesson",
    );
    expect(startFeaturePostProcessPrompt).toContain(
      "Calculate and write both Estimated Human Time and Estimated AI Time",
    );
    expect(startFeaturePostProcessPrompt).toContain(
      "Actual AI execution time is recorded later by Hepha",
    );
    expect(implementationWorkerApplicationsSource).toContain("assertTimingComplete: (feature) => dependencies.timingPolicy.assertComplete(feature)");
    expect(startFeaturePostProcessApplicationSource).toContain("assertTimingComplete(postProcessedFeature)");
    expect(startFeatureTimingPolicySource).toContain("Implementation Timing Summary");
    expect(phaseExecutionSafetyPromptSource).toContain(
      "project stack/tooling lessons and prior code-review suggestions",
    );
    expect(phaseCodeReviewScopePromptSource).toContain(
      "prior-review suggestions cannot create a new requirement for this phase",
    );
    expect(phaseWorkerApplicationsSource).toContain(
      "sharedCodeQualityAssumptions: sharedCodeQualityAssumptionsRule",
    );
    expect(phaseCodeReviewFindingContractPromptSource).toContain(
      "Compatibility Decision",
    );
    expect(getFunctionSource("buildCompleteFeaturePrompt")).toContain(
      "Read Project LessonsLearned Active Rules before finalizing",
    );
    expect(deepDiveApplicationsSource).toContain('agentRole: "deep-dive"');
    expect(designFeatureExecutionApplicationSource).toContain('agentRole: "design-feature"');
    expect(refineFeatureExecutionApplicationSource).toContain('agentRole: "refine-feature"');
    expect(startFeaturePostProcessApplicationSource).toContain('agentRole: "start-feature-postprocess"');
    expect(implementationRunApplicationsSource).toContain("dependencies.startFeaturePostProcess.execute(");
    expect(startFeaturePostProcessApplicationSource).toContain("assertTimingComplete(postProcessedFeature)");
    expect(startImplementationRunApplicationSource).toContain("runImplementation");
    expect(implementationRunApplicationsSource).toContain("autonomousContinuationScheduler.schedule(");
    expect(phaseExecutionAuditSource).toContain("phase-execution.jsonl");
    expect(phaseProgressRecorderSource).toContain('event: "phase_progress"');
    expect(implementationWorkerApplicationSource).toContain('"pi_attempt_started"');
    expect(implementationWorkerApplicationSource).toContain('"pi_attempt_finished"');
    expect(autonomousImplementationWorkflowApplicationSource).toContain("A worker boundary is a hard context boundary");
    expect(implementationWorkerApplicationsSource).toContain("agentRole: input.command");
    expect(completeFeatureExecutionApplicationSource).toContain('agentRole: "complete-feature"');
    expect(featureFindingExecutionApplicationSource).toContain('agentRole: "human-review-finding"');
    expect(orchestratorSource).toContain('agentRole: "human-review-findings"');
    expect(orchestratorSource).toContain('agentRole: "code-review"');
    expect(orchestratorSource).toContain("buildReviewContext: async ({ feature, phase, previousFailureBrief, project }) => featureWorkflowContextCollector.collect");
    expect(phaseReviewExecutionApplicationSource).toContain("buildPhaseCodeReviewPrompt(input.project, input.feature, context");
  });

  it("requires parseable post-start timing estimates in both Web and direct-Pi workflows", () => {
    expect(startFeaturePostProcessApplicationSource).toContain("assertTimingComplete(postProcessedFeature)");
    expect(startFeatureTimingPolicySource).toContain("effortEstimatePattern");
    expect(startFeatureSkill).toContain("## Start-Feature Post-Operation: Estimates");
    expect(startFeatureSkill).toContain("Implementation Timing Summary");
    expect(startFeatureSkill).toContain("Do not invent actual duration");
  });

  it("selects normalized active LessonsLearned rule files before raw lesson archives", () => {
    const activeCollectorSource = getFunctionSource("collectProjectActiveLessonDocuments");
    const activeScorerSource = getFunctionSource("scoreProjectActiveLessonDocument");
    const rawCollectorSource = getFunctionSource("collectProjectLessonsLearnedDocuments");
    const normalizerSource = getFunctionSource("normalizeLessonRuleLine");
    const ruleLineSource = getFunctionSource("isLessonRuleLine");

    expect(activeCollectorSource).toContain('resolve(lessonsRoot, "Active")');
    expect(activeCollectorSource).toContain("readDocumentSnippet(path, 14000)");
    expect(activeCollectorSource).toContain('basename(document.path).toLowerCase() === "common.md"');
    expect(activeCollectorSource).toContain("selected.size >= maxDocuments");
    expect(activeScorerSource).toContain('fileName === "common.md"');
    expect(activeScorerSource).toContain('fileName === "rust.md"');
    expect(activeScorerSource).toContain('fileName === "rust-cargo.md"');
    expect(activeScorerSource).toContain('fileName === "code-review-recovery.md"');
    expect(activeScorerSource).toContain('fileName === "codewhale-command-extraction.md"');
    expect(rawCollectorSource).toContain('resolve(lessonsRoot, "Active")');
    expect(rawCollectorSource).toContain("!isPathInsideDirectory(path, activeRoot)");
    expect(normalizerSource).toContain('replace(/^#+\\s*/, "")');
    expect(ruleLineSource).toContain('/^Rule:\\s+/i.test(line)');
  });

  it("enforces the Phase 1 planning artifact as cross-phase handoff context", () => {
    const collectContextSource = featureWorkflowContextCollectorSource;

    expect(phaseWorkerPromptPoliciesSource).toContain('featurePlanningArtifactFileName = "planning-analysis-report.md"');
    expect(phaseFoundationApplicationsSource).toContain("new FeaturePlanningArtifactPolicy");
    expect(featurePlanningArtifactPolicySource).toContain("assertPresent");
    expect(featurePlanningArtifactPolicySource).toContain("The planning phase did not create a non-empty planning artifact");
    expect(collectContextSource).toContain("sections.push(this.#renderPlanningArtifact(project, feature))");
    expect(normalizedRefineFeatureCommandTemplate).toContain("durable cross-phase planning handoff");
    expect(getFunctionSource("buildStartFeaturePostProcessPrompt")).toContain("Planning artifact alignment:");
    expect(phasePlanningAcceptancePromptSource).toContain("Feature planning artifact:");
    expect(phasePlanningAcceptancePromptSource).toContain("phase dependency map");
    expect(phasePlanningAcceptancePromptSource).toContain("Phase Implementation Index");
    expect(phasePlanningAcceptancePromptSource).toContain("helper-only tests are insufficient");
    expect(phasePlanningAcceptancePromptSource).toContain("Read this phase's row in the planning artifact");
  });

  it("runs constrained phase-template alignment before normal phase dispatch", () => {
    expect(orchestratorSource).toContain("createPhaseBoundaryApplications({");
    expect(phaseBoundaryApplicationsSource).toContain("new PhaseTemplateDispatchApplication");
    expect(orchestratorSource).toContain("phaseTemplateDispatchApplication.prepare");
  });

  it("passes linked EPIC acceptance tests into feature workflow prompts", () => {
    const collectContextSource = featureWorkflowContextCollectorSource;
    const acceptanceContextSource = featureWorkflowContextCollectorSource;

    expect(phaseWorkerPromptPoliciesSource).toContain('epicAcceptanceTestsFileName = "EpicAcceptanceTests.md"');
    expect(collectContextSource).toContain('"Linked EPIC Acceptance Tests"');
    expect(collectContextSource).toContain("this.#collectLinkedEpicAcceptanceTests(project, feature, workItems)");
    expect(acceptanceContextSource).toContain("feature.linkedEpicIds");
    expect(acceptanceContextSource).toContain("this.dependencies.acceptanceTestsFileName");
    expect(acceptanceContextSource).toContain('readFileSync(acceptancePath, "utf8").trim()');
    expect(acceptanceContextSource).toContain('readFileSync(acceptancePath, "utf8").trim()');
  });

  it("requires lifecycle agents to map EPIC acceptance tests to real or existing coverage", () => {
    expect(normalizedRefineFeatureCommandTemplate).toContain("EPIC Acceptance Traceability");
    expect(normalizedRefineFeatureCommandTemplate).toContain("look for existing executable tests");
    expect(refineFeatureSkill).toContain("EpicAcceptanceTests.md");
    expect(refineFeatureSkill).toContain("stable scenario ID/tag");
    expect(refineFeatureSkill).toContain("target Gherkin");
    expect(refineFeatureSkill).toContain("Never silently omit an EPIC scenario.");
    expect(getFunctionSource("buildStartFeaturePostProcessPrompt")).toContain("EPIC acceptance alignment:");
    expect(getFunctionSource("buildStartFeaturePostProcessPrompt")).toContain("add the exact test file/name mapping");
    expect(phasePlanningAcceptancePromptSource).toContain("acceptance traceability");
    expect(phasePlanningAcceptancePromptSource).toContain("Do not mark the phase complete");
    expect(getFunctionSource("buildCompleteFeaturePrompt")).toContain("Product Owner EPIC acceptance test");
    expect(getFunctionSource("buildCompleteFeaturePrompt")).toContain("missing traceability");
  });

  it("uses recovery analysis for implementation failures but routes ordinary review findings directly", () => {
    expect(implementationRecoveryApplicationsSource).toContain("new ImplementationAutoRecoveryApplication");
    expect(startImplementationRunApplicationSource).toContain("attemptRecovery");
    expect(startImplementationRunApplicationSource).toContain("Recovered and started implementation");
    expect(continueImplementationRunApplicationSource).toContain("attemptRecovery");
    expect(workflowRecoveryPromptSource).toContain("Workflow Recovery Agent");
    expect(workflowRecoveryPromptSource).toContain("Recovery Result: RETRY");
    expect(getFunctionSource("parseWorkflowRecoveryResult")).toContain("`?\\**\\s*(RETRY|BLOCKED)");
    expect(implementationAutoRecoveryApplicationSource).toContain("recoveryAttempt: input.recoveryAttempt + 1");
    expect(implementationAutoRecoveryApplicationSource).toContain("appendAnalysis(failureBrief, recoveryOutput)");
    expect(implementationAutoRecoveryApplicationSource).not.toContain("previousFailureBrief: codeReviewFailure ? null");
    const recoverySource = implementationAutoRecoveryApplicationSource;
    expect(recoverySource).not.toContain("findReviewerOwnedRemediationReplan");
    expect(recoverySource).toContain("Code-review findings are being routed directly to the fixer");
    expect(recoverySource).toContain("Direct code-review finding resolution");
    expect(recoverySource).toContain("!codeReviewFailure && input.recoveryAttempt >= 1");
    expect(recoverySource).not.toContain("maxCodeReviewRecoveryAttempts");
    expect(recoverySource).not.toContain("REMEDIATION_REPLAN_REQUIRED");
    const continuationSource = continueImplementationRunApplicationSource;
    expect(continuationSource).not.toContain("selectRemediationReplanFailureRoute({");
    expect(phaseReviewPublicationApplicationSource).toContain("selectPersistedReviewTransition(");
  });

  it("retries host-side command safety stops without launching a recovery agent", () => {
    expect(implementationFailureClassifierSource).toContain("export function isUnsafeCargoExecutionFailure");
    expect(getFunctionSource("isRecoverableImplementationFailure")).toContain(
      "isUnsafeCargoExecutionFailure(normalized)",
    );
    expect(getFunctionSource("prepareKnownWorkflowRecovery")).toContain("Prepared command-safety retry context");
    expect(getFunctionSource("prepareKnownWorkflowRecovery")).toContain("skipRecoveryAgent: true");
    expect(getFunctionSource("prepareKnownWorkflowRecovery")).toContain("Project LessonsLearned Active Rules");
    expect(getFunctionSource("prepareKnownWorkflowRecovery")).toContain("project command sequencing/tool safety rule");
    expect(getFunctionSource("prepareKnownWorkflowRecovery")).toContain("Sequential Cargo invocations may share one shell tool call");
    expect(implementationFailureClassifierSource).toContain("export function extractGenericWorkflowFailedPhaseNumber");
    expect(workflowFailureBriefPresenterSource).toContain("Failed step:");
    expect(implementationAutoRecoveryApplicationSource).toContain(
      "forcedRecoveryPhaseNumber: this.dependencies.extractFailurePhase(failureBrief) ?? input.forcedRecoveryPhaseNumber",
    );
    expect(getFunctionSource("getWorkflowFailureAnalysis")).toContain("Sequential Cargo invocations are permitted");
  });

  it("counts only real Cargo executable positions for command safety", () => {
    expect(countCargoInvocations("cargo check -p codewhale-tui")).toBe(1);
    expect(
      countCargoInvocations(
        'rustdoc-stripper --help 2>/dev/null; cd /repo && cargo doc -p codewhale-tui --no-deps 2>&1 | grep -i "session::save" || echo "no cargo doc output"',
      ),
    ).toBe(1);
    expect(countCargoInvocations('grep -rn "cargo check" docs/ || echo "no cargo checks found"')).toBe(0);
    expect(
      countCargoInvocations(
        'rg -n "Phase 6 NEEDS_CHANGES|cargo test -p codewhale-tui commands::|cargo test -p codewhale-tui acceptance" docs/ tests/ || true',
      ),
    ).toBe(0);
    expect(
      countCargoInvocations(
        "nl -ba docs/architecture/command-dispatch.md | sed -n '1,140p'\nrg -n \"cargo test --workspace|cargo check\" docs/ || true",
      ),
    ).toBe(0);
    expect(countCargoInvocations("cd /repo && cargo check && cargo test -p codewhale-tui")).toBe(2);
    expect(countCargoInvocations("cargo test -p codewhale-tui | tee /tmp/codewhale-tests.log")).toBe(1);
    expect(countCargoInvocations("timeout 120 cargo test -p codewhale-tui")).toBe(1);
  });

  it("loads implementation skills for implementation workers", () => {
    expect(orchestratorSource).toContain("serializedBuildCommandsSkillPath");
    expect(orchestratorSource).toContain("deepDiveSkillPath");
    expect(orchestratorSource).toContain("designFeatureSkillPath");
    expect(orchestratorSource).toContain("refineFeatureSkillPath");
    expect(orchestratorSource).toContain("startFeatureSkillPath");
    expect(orchestratorSource).toContain("continueImplementationSkillPath");
    expect(orchestratorSource).toContain("completeFeatureSkillPath");
    expect(orchestratorSource).toContain("implementationSkillPaths");
    expect(orchestratorRuntimeSettingsSource).toContain("resolveWorkflowSkillPaths({");
    expect(orchestratorRuntimeConfigurationSource).toContain("HEPHA_SERIALIZED_BUILD_COMMANDS_SKILL_PATH");
    expect(orchestratorRuntimeConfigurationSource).toContain("HEPHA_DEEP_DIVE_SKILL_PATH");
    expect(orchestratorRuntimeConfigurationSource).toContain("HEPHA_DESIGN_FEATURE_SKILL_PATH");
    expect(orchestratorRuntimeConfigurationSource).toContain("HEPHA_REFINE_FEATURE_SKILL_PATH");
    expect(orchestratorRuntimeConfigurationSource).toContain("HEPHA_START_FEATURE_SKILL_PATH");
    expect(orchestratorRuntimeConfigurationSource).toContain("HEPHA_CONTINUE_IMPLEMENTATION_SKILL_PATH");
    expect(orchestratorRuntimeConfigurationSource).toContain("HEPHA_COMPLETE_FEATURE_SKILL_PATH");
    expect(orchestratorRuntimeConfigurationSource).toContain("pi-skill-hepha-continue-implementation");
    expect(autonomousImplementationWorkflowApplicationSource).toContain("this.dependencies.directImplementation.execute(");
    expect(directImplementationSkillApplicationSource).toContain('"start-feature"');
    expect(directImplementationSkillApplicationSource).toContain('"continue-implementation"');
    expect(getFunctionSource("buildStartImplementingPrompt")).toContain(
      "Use the start-feature skill for ${formatProjectSkillTarget(project, feature, modeSuffix)}",
    );
    expect(featureEntryPromptsSource).toContain("function formatProjectSkillTarget");
    expect(getFunctionSource("formatProjectSkillTarget")).toContain("project.name");
    expect(getFunctionSource("formatProjectSkillTarget")).toContain("modeSuffix");
    expect(getFunctionSource("formatProjectSkillTarget")).toContain("project.rootPath");
    expect(getFunctionSource("formatProjectSkillTarget")).toContain("project.memoryBankPath");
    expect(getFunctionSource("buildStartImplementingPrompt")).toContain(
      'options.autonomous ? " autonomous" : ""',
    );
    expect(getFunctionSource("buildStartImplementingPrompt")).toContain(
      "formatProjectSkillTarget(project, feature, modeSuffix)",
    );
    expect(getFunctionSource("buildContinueImplementingPrompt")).toContain(
      "Use the continue-implementation skill for ${formatProjectSkillTarget(project, feature, modeSuffix)}",
    );
    expect(getFunctionSource("buildContinueImplementingPrompt")).toContain(
      'options.autonomous ? " autonomous" : ""',
    );
    expect(getFunctionSource("buildCompleteFeaturePrompt")).toContain(
      "Use the complete-feature skill for ${options.projectSkillTarget}",
    );
    expect(getFunctionSource("buildCompleteFeaturePrompt")).toContain(
      "explicit acceptance that code review and manual tests have been completed or accepted",
    );
    expect(getFunctionSource("buildCompleteFeaturePrompt")).toContain(
      "Workflow run id for HEPHA metadata sync",
    );
    expect(getFunctionSource("buildDeepDiveQuestionPrompt")).toContain(
      "Prepare the opening adaptive Deep-Dive question for HEPHA",
    );
    expect(getFunctionSource("buildDeepDiveQuestionPrompt")).not.toContain(
      "Use the deep-dive skill for HEPHA",
    );
    expect(getFunctionSource("buildDeepDiveQuestionPrompt")).toContain(
      "This is Deep-Dive stage 1 only",
    );
    expect(getFunctionSource("buildDeepDiveDocumentUpdatePrompt")).toContain(
      "Use the deep-dive skill for HEPHA",
    );
    expect(getFunctionSource("buildDeepDiveDocumentUpdatePrompt")).toContain(
      "This is Deep-Dive stage 2 only",
    );
    expect(getFunctionSource("buildDesignFeaturePrompt")).toContain(
      'design-feature ${formatProjectSkillTarget(project, feature, "")}',
    );
    expect(getFunctionSource("buildRefineFeaturePrompt")).toContain(
      'refine-feature ${formatProjectSkillTarget(project, feature, "")}',
    );
    expect(deepDiveQuestionPlannerSource).toContain("implementationProfile: true");
    expect(deepDiveDocumentUpdaterSource).toContain("implementationProfile: true");
    expect(getFunctionSource("buildPhaseImplementationPrompt")).toContain("renderPhaseExecutionPreparationRules");
    expect(getFunctionSource("buildCompleteFeaturePrompt")).toContain("serializedBuildCommandsSkillRule");
    expect(phaseWorkerPromptPoliciesSource).toContain("apply the `serialized-build-commands` skill");
    expect(phaseWorkerPromptPoliciesSource).toContain("Cargo invocations may be sequential");
    expect(phaseWorkerPromptPoliciesSource).toContain("Never background Cargo");
    expect(phaseExecutionSafetyPromptSource).toContain("whole-project Boy Scout obligation");
  });

  it("requires validation evidence to include timeout and retry attempts", () => {
    expect(phaseWorkerPromptPoliciesSource).toContain("validationEvidenceAccountingRule");
    expect(phaseWorkerPromptPoliciesSource).toContain("record each attempt separately");
    expect(phaseWorkerPromptPoliciesSource).toContain("total wall-clock validation time");
    expect(phaseWorkerPromptPoliciesSource).toContain("cargoTimeoutSafetyRule");
    expect(phaseWorkerPromptPoliciesSource).toContain("assume a cargo/rustc child process may still be alive");
    expect(phaseWorkerApplicationsSource).toContain("validationEvidenceAccounting: validationEvidenceAccountingRule");
    expect(phaseWorkerApplicationsSource).toContain("cargoTimeoutSafety: cargoTimeoutSafetyRule");
    expect(getFunctionSource("buildPhaseCodeReviewPrompt")).toContain("validationEvidenceAccountingRule");
    expect(getFunctionSource("buildCompleteFeaturePrompt")).toContain("cargoTimeoutSafetyRule");
  });

  it("injects the Cargo validation ladder into implementation workers", () => {
    expect(phaseWorkerPromptPoliciesSource).toContain("cargoValidationLadderRule");
    expect(phaseWorkerPromptPoliciesSource).toContain("focused changed-file/exact tests first");
    expect(phaseWorkerPromptPoliciesSource).toContain("broad full-suite commands");
    expect(phaseWorkerApplicationsSource).toContain("cargoValidationLadder: cargoValidationLadderRule");
    expect(phaseExecutionSafetyPromptSource).toContain("full-verification phase must resolve every configured-profile failure");
    expect(getFunctionSource("buildCompleteFeaturePrompt")).toContain("cargoValidationLadderRule");
  });

  it("injects a persistent phase task ledger into implementation resume prompts", () => {
    const contextSource = featureWorkflowContextCollectorSource;
    const phasePromptSource = getFunctionSource("buildPhaseImplementationPrompt");
    const startPromptSource = getFunctionSource("buildStartFeaturePostProcessPrompt");
    const blockerSource = getFunctionSource("renderCodeReviewBlockerSection");

    expect(phaseWorkerPromptPoliciesSource).toContain("phaseTaskLedgerRule");
    expect(phaseWorkerPromptPoliciesSource).toContain("codeReviewFindingLedgerRule");
    expect(contextSource).toContain("this.dependencies.renderPhaseTaskLedger");
    expect(phaseWorkerPromptPoliciesSource).toContain("existing `[x]` items are COMPLETED");
    expect(phasePromptSource).toContain("Use the Phase Task Resume Ledger context below as the current work queue");
    expect(phaseImplementationEntryPolicySource).toContain("Orchestrator-selected active task");
    expect(phaseGateEvidencePromptSource).toContain("entire Phase Task Ledger");
    expect(phasePromptSource).toContain("phaseTaskLedgerRule");
    expect(workflowFailureBriefPresenterSource).toContain("Stale-claim sweep");
    expect(phaseReviewRemediationPromptSource).toContain("false-evidence or overclaim");
    expect(implementationRunApplicationsSource).toContain("dependencies.phaseTaskCursor.resolve");
    expect(startPromptSource).toContain("A Phase Task Ledger only when the phase lacks one");
    expect(blockerSource).toContain("preserve checked items");
    expect(blockerSource).toContain("Finding ledger behavior");
    expect(phaseEntryApplicationsSource).toContain("workflowMachineState.capturePhaseWorker");
    expect(phaseEntryApplicationsSource).toContain("workflowMachineState.restorePhaseWorker");
    expect(workflowMachineStateRepositorySource).toContain("phaseTaskLedger: readMarkdownSection");
  });

  it("tells implementation workers the exact phase quality-gate decision vocabulary", () => {
    const phasePromptSource = getFunctionSource("buildPhaseImplementationPrompt");

    expect(phaseGateEvidencePromptSource).toContain("Quality Gate Evidence decision values");
    expect(phaseGateEvidencePromptSource).toContain("`missing`, `satisfied`, `waived`, or `not applicable`");
    expect(phaseGateEvidencePromptSource).toContain("Do not write `pass`");
    expect(phaseGateEvidencePromptSource).toContain("Keep every Quality Gate Evidence entry on one physical Markdown table row");
  });

  it("injects LessonsLearned execution constraints into workflow recovery prompts", () => {
    const recoveryPromptSource = getFunctionSource("buildWorkflowRecoveryPrompt");

    expect(implementationRecoveryApplicationsSource).toContain("lessonsLearnedContext: dependencies.lessons.render(input.project");
    expect(implementationRecoveryApplicationsSource).toContain('agentRole: "workflow-recovery"');
    expect(recoveryPromptSource).toContain("options.lessonsLearnedContext");
    expect(recoveryPromptSource).toContain("Project LessonsLearned Active Rules");
    expect(recoveryPromptSource).toContain("project stack/tooling execution rules should shape recovery");
    expect(recoveryPromptSource).toContain("lessonsLearnedExecutionConstraintsRule");
    expect(recoveryPromptSource).toContain("If LessonsLearned contains a command serialization");
    expect(recoveryPromptSource).toContain("Never edit a phase document, FeatureTasks.md");
    expect(recoveryPromptSource).toContain("diagnostic-only for machine-owned workflow state");
    expect(implementationRecoveryApplicationsSource).toContain("dependencies.machineState.captureRecovery");
    expect(implementationRecoveryApplicationsSource).toContain("dependencies.machineState.restoreRecovery");
    expect(recoveryPromptSource).not.toContain("cargoSerializationRule");
  });

  it("recovers missing Pi CLI failures before launching Pi-backed recovery agents", () => {
    expect(implementationFailureClassifierSource).toContain("export function isMissingPiCliFailure");
    expect(implementationRecoveryApplicationsSource).toContain("formatMissingPiCliError");
    expect(knownWorkflowRecoveryPreparerSource).toContain("skipRecoveryAgent: true");
    expect(implementationAutoRecoveryApplicationSource).toContain("Retrying implementation after host-side recovery");
    expect(knownWorkflowRecoveryPreparerSource).toContain("Pi resolver:");
  });

  it("reconciles recovered phase-run summaries after workflow recovery completes", () => {
    expect(workflowInfrastructureApplicationsSource).toContain("new ImplementationRunSummaryProjector");
    expect(implementationRunSummaryProjectorSource).toContain("phase Markdown status is");
    expect(implementationRunSummaryProjectorSource).toContain("recovered after workflow completion");
    expect(implementationRunSummaryProjectorSource).toContain('lastRun.status !== "completed"');
  });

  it("does not reattach unresolved review reports after a workflow completes", () => {
    expect(implementationRunSummaryProjectorSource).toContain('lastRun.status === "completed"');
    expect(implementationRunSummaryProjectorSource).toContain("this.dependencies.findLatestReviewReport");
    expect(implementationRunSummaryProjectorSource.indexOf('lastRun.status === "completed"')).toBeLessThan(
      implementationRunSummaryProjectorSource.indexOf("this.dependencies.findLatestReviewReport"),
    );
  });

  it("shares a generic resilient error path across implementation prompts", () => {
    expect(resilientErrorPathSource).toContain("Resilient error path:");
    expect(resilientErrorPathSource).toContain("do not stop at the first failure");
    expect(resilientErrorPathSource).toContain("diagnose -> fix -> verify");
    expect(resilientErrorPathSource).toContain("command sequencing, concurrency, and tool safety rules from LessonsLearned");
    expect(resilientErrorPathSource).toContain("same failure repeats after documented recovery attempts");
    expect(getFunctionSource("buildPhaseImplementationPrompt")).toContain("renderResilientImplementationErrorPath");
    expect(getFunctionSource("buildCompleteFeaturePrompt")).toContain("renderResilientImplementationErrorPath");
    expect(getFunctionSource("buildCompleteFeaturePrompt")).toContain(
      'blockedEscalation: "Escalate with `Complete Feature Result: BLOCKED`"',
    );
  });

  it("treats autonomous code-review findings as retryable implementation gates", () => {
    expect(implementationFailureClassifierSource).toContain("export function isCodeReviewBlockedFailure");
    expect(workflowFailureBriefPresenterSource).toContain("Code Review Blocker");
    expect(implementationRunApplicationsSource).toContain("forcedRecoveryPhaseNumber");
    expect(autonomousImplementationWorkflowApplicationSource).toContain("this.dependencies.entry.prepare({");
    expect(phaseEntryPreparationApplicationSource).toContain("phase.number !== input.forcedRecoveryPhaseNumber");
    expect(implementationRecoveryRetryApplicationSource).toContain("attemptNestedRecovery");
    expect(codeReviewFailureContextRepositorySource).toContain("isSupersededByApproval(");
    expect(codeReviewFailureContextRepositorySource).toContain("hasNewerApproval(");
    expect(implementationAutoRecoveryApplicationSource).toContain("extractFailurePhase(failureBrief)");
    expect(continueImplementationApplicationSource).toContain("findFailurePhase(previousFailureBrief");
    expect(implementationFailureClassifierSource).toContain("extractCodeReviewBlockedPhaseNumber(text)");
    expect(workflowFailureBriefPresenterSource).toContain("Review Finding Decision Queue");
    expect(phaseWorkerPromptPoliciesSource).toContain("Review Finding Decision Ledger");
    expect(phaseWorkerPromptPoliciesSource).toContain("blocked_needs_user");
    expect(workflowFailureBriefPresenterSource).toContain("accepted_risk");
    expect(phaseReviewRemediationPromptSource).toContain("do not silently ignore them");
    expect(codeReviewFindingParserSource).toContain("function extractTableFindings");
    expect(codeReviewFailureContextRepositorySource).toContain("CodeReviewFindingDecisionItem");
    expect(previousCodeReviewFollowUpPresenterSource).toContain("formatCodeReviewFindingForPrompt");
    expect(phaseWorkerPromptPoliciesSource).toContain("Review fixes applied; awaiting independent code review rerun");
    expect(workflowFailureBriefPresenterSource).toContain("focused local commit");
    expect(implementationRecoveryRetryApplicationSource).toContain("Keep the final failure authoritative");
    expect(orchestratorSource).not.toContain("HEPHA_CODE_REVIEW_RECOVERY_ATTEMPTS");
    expect(codeReviewFailureContextRepositorySource).toContain("function selectLatestContext");
    expect(codeReviewFailureContextRepositorySource).toContain("The newest\n    // actionable on-disk report must win");
    expect(codeReviewFailureContextRepositorySource).toContain("const latestReport = this.findLatest");
    expect(orchestratorSource).not.toContain("function hasNewCodeReviewFindingsSincePreviousBrief");
    expect(orchestratorSource).not.toContain("function createCodeReviewFindingSignature");
  });

  it("routes autonomous review only to code-producing non-waived phases", () => {
    const workflowSource = autonomousImplementationWorkflowApplicationSource;
    const reviewPromptSource = getFunctionSource("buildPhaseCodeReviewPrompt");
    const collectContextSource = featureWorkflowContextCollectorSource;

    expect(workflowSource).toContain("this.dependencies.postWorkerReview.prepare({");
    expect(phasePostWorkerReviewApplicationSource).toContain("this.dependencies.planReviewRequirement({");
    expect(phaseReviewRequirementPlannerSource).toContain("requiresAutonomousCodeReview");
    expect(workflowSource).toContain("phaseRequiresAutonomousCodeReview");
    expect(workflowSource).not.toContain("findReviewerOwnedRemediationReplanForPhase(feature, phase.number)");
    expect(workflowSource).not.toContain("requiresReviewerRemediationPlan");
    expect(orchestratorSource).not.toContain("countFixerProposalReviewerOpenCycles");
    expect(workflowSource).toContain("this.dependencies.planning.prepare({");
    expect(phaseExecutionPlanningApplicationSource).toContain("this.dependencies.resolveReviewState({");
    expect(phaseReviewStateApplicationSource).toContain("this.dependencies.findLatestReport");
    expect(phaseReviewStateApplicationSource).toContain("this.dependencies.plan({");
    expect(phaseReviewResumePlannerSource).toContain("selectReviewResumeRoute({");
    expect(phaseReviewResumePlannerSource).toContain('resolvingReviewFindings: reviewResumeRoute === "fixer"');
    expect(phaseReviewStateApplicationSource).toContain("this.dependencies.readCurrentEvidence({");
    expect(implementationAutoRecoveryApplicationSource).toContain("Fixer response did not complete; no code-review rerun was started");
    expect(implementationAutoRecoveryApplicationSource).toContain("Retrying incomplete code-review finding resolution");
    expect(phaseCodeReviewScopePromptSource).toContain("This is a Reviewer Remediation Plan run, not a normal rerun");
    expect(phaseCodeReviewScopePromptSource).toContain("## Reviewer Remediation Plan");
    expect(phaseReviewResumePlannerSource).toContain("validated.reviewRequired && (");
    expect(phaseExecutionPlanningApplicationSource).toContain("this.dependencies.prepareReviewRequirement({");
    expect(phaseReviewRequirementApplicationSource).toContain("recovered stale documentation-only review state; phase completed.");
    expect(workflowSource).not.toContain("PlanReviewer baseline review started");
    expect(phaseLifecyclePolicySource).toContain("export function isPhaseAwaitingReview");
    expect(phaseStatusDocumentRepositorySource).toContain('"AWAITING_REVIEW"');
    expect(orchestratorSource).toContain('contextMode: "code-review"');
    expect(phaseReviewExecutionApplicationSource).toContain("this.dependencies.buildContext");
    expect(collectContextSource).toContain('if (contextMode === "code-review")');
    expect(collectContextSource).toContain("this.#renderCodeReviewScope");
    expect(collectContextSource).toContain("## Scoped Code Review Context");
    expect(phaseCodeReviewFindingContractPromptSource).toContain("Every BLOCKER/REQUIRED finding is a complete contract for the fixer");
    expect(phaseCodeReviewFindingContractPromptSource).toContain("Acceptance Matrix");
    expect(phaseCodeReviewFindingContractPromptSource).toContain("Do not use unresolved shorthand");
    expect(phaseCodeReviewFindingContractPromptSource).toContain("Do not reveal another condition");
    expect(phaseCodeReviewScopePromptSource).toContain("You are a Code Reviewer, not the FEAT analyst");
    expect(phaseCodeReviewScopePromptSource).toContain("Treat an explicit phase boundary as normative");
    expect(phaseCodeReviewScopePromptSource).toContain("do not require that API to duplicate the upstream full semantic validator");
    expect(phaseCodeReviewFindingContractPromptSource).toContain("Do not split one field's contract across serial reviews");
    expect(phaseCodeReviewFindingContractPromptSource).toContain("Do not use a rerun to correct an incomplete reviewer analysis");
    expect(phaseCodeReviewScopePromptSource).toContain("Technical-debt discovery belongs to the separate TechnicalDebts/architecture process");
    expect(phaseCodeReviewAdjudicationPromptSource).toContain("Do not create `NEW`, `SCOPE_EXPANSION`, or `OUT_OF_SCOPE` findings");
    expect(phaseCodeReviewScopePromptSource).toContain("General architecture rules, future policy requirements, and prior-review suggestions cannot create a new requirement for this phase");
    expect(phaseCodeReviewManifestPromptSource).toContain("They do not add review scope, production requirements, or a mandate to inspect the catalog/policy implementation");
    expect(phaseCodeReviewManifestPromptSource).toContain("Return exactly one raw JSON object");
    expect(phaseCodeReviewManifestPromptSource).toContain("review_manifest");
    expect(phaseCodeReviewManifestPromptSource).toContain("no Markdown, no code fence");
    expect(phaseCodeReviewFindingContractPromptSource).toContain("Do not perform another exploratory sweep");
    expect(featureWorkflowContextCollectorSource).toContain("### Production Code Review Target");
    expect(orchestratorSource).toContain("selectProductionCodeReviewFiles(");
    expect(orchestratorSource).toContain("getObservedPhaseChangedFiles(project, feature, phaseNumber)");
    expect(phaseCodeReviewScopePromptSource).toContain("List every reviewed Production Code Review Target file at the top of the report");
    expect(phaseCodeReviewScopePromptSource).toContain("Do not broaden scope to documentation, tests, TestProjects, test-only helpers");
    expect(phaseCodeReviewScopePromptSource).toContain("Never create a finding against it.");
    expect(reviewPromptSource).toContain("serializedBuildCommandsSkillRule");
    expect(reviewPromptSource).toContain("cargoValidationLadderRule");
    expect(phaseCodeReviewExecutionPromptSource).toContain("use `cargo test ... -- --test-threads=1`");
    expect(phaseCodeReviewExecutionPromptSource).toContain("reviewer-tooling error");
    expect(phaseCodeReviewExecutionPromptSource).toContain("Test coverage is assessed later as non-gating quality telemetry; do not review test code.");
    expect(phaseCodeReviewExecutionPromptSource).toContain("BLOCKER, REQUIRED, WITH_NOTES, NON_BLOCKING, POLISH, or OUT_OF_SCOPE");
    expect(workflowSource).toContain("previousFailureBrief: input.previousFailureBrief");
  });

  it("reruns code review after recovery fixes before phase advancement", () => {
    const workflowSource = autonomousImplementationWorkflowApplicationSource;

    expect(phaseStatusDocumentRepositorySource).toContain("isAwaitingReviewRerun(");
    expect(phaseStatusDocumentRepositorySource).toContain("readFeatureTasksRow(");
    expect(phaseStatusDocumentRepositorySource).toContain('resolve(dirname(dirname(phase.documentPath)), "FeatureTasks.md")');
    expect(workflowSource).toContain("phaseReadyForReviewRerun");
    expect(workflowSource).toContain("phaseReadyForReviewGate");
    expect(workflowSource).toContain("phaseAwaitsReviewRerun");
    expect(workflowSource).toContain("phaseAwaitsReviewBaseline");
    expect(workflowSource).toContain("phaseReadyForCodeReviewRerun");
    expect(workflowSource).not.toContain("isRecoveringFromCodeReviewFindings");
    expect(workflowSource).toContain("this.dependencies.preReview.route({");
    expect(phasePreReviewRoutingApplicationSource).toContain("this.dependencies.prepareReviewHandoff({");
    expect(phaseReviewGateHandoffApplicationSource).toContain("input.rerunReady || this.dependencies.isAwaitingRerun(phase)");
    expect(workflowSource).toContain("phaseRequiresBaselineCodeReview");
    expect(workflowSource).toContain("const phaseRequiresBaselineCodeReview = phaseAwaitsReviewBaseline");
    expect(workflowSource).toContain("Production-code attribution establishes that this phase is reviewable");
    expect(phasePostWorkerReviewApplicationSource).toContain("observedChangedFiles: changedFiles");
    expect(phaseReviewRequirementPlannerSource).toContain("changedFiles: input.observedChangedFiles");
    expect(workflowSource).toContain("this.dependencies.workerEntry.enter({");
    expect(phaseWorkerEntryApplicationSource).toContain("review fixes already applied; rerunning review");
    expect(phaseWorkerDispatchPlannerSource).toContain("Resolve Code Review Findings");
    expect(workflowSource).toContain("phaseAwaitsReviewRerun");
    expect(phaseReviewExecutionApplicationSource).toContain("Code review rerun started after review fixes were applied.");
    expect(phaseBoundaryApplicationsSource).toContain("phaseCompletionAuthorizationApplication.completeAfterReview");
    expect(focusedGitCommitAdapterSource).toContain("commitReviewReport(");
    expect(focusedGitCommitAdapterSource).toContain("commit(input: FocusedGitCommitInput)");
    expect(focusedGitCommitAdapterSource).toContain("function canonicalExistingPath");
    expect(focusedGitCommitAdapterSource).toContain("realpathSync");
    expect(focusedGitCommitAdapterSource).toContain("buildReviewReportArtifactCommitMessage");
    expect(workflowSource).toContain("this.dependencies.review.dispatch({");
    expect(phaseReviewDispatchApplicationSource).toContain("this.dependencies.executeReview({");
    expect(phaseReviewLifecycleApplicationSource).toContain("this.dependencies.publishReview");
    expect(phaseReviewPublicationApplicationSource).toContain("ingestAndRenderAuthoritativeReview");
    expect(phaseExitApplicationSource).toContain("authoritativeReview: reviewAuthority");
    expect(phaseExitApplicationSource).toContain("openReviewStore");
    expect(workflowSource).not.toContain("reviewContractAuthorityPendingMessage");
    expect(workflowSource).not.toContain("usesReviewContractAuthorityBootstrap");
    expect(orchestratorSource).not.toContain("function isReviewContractAuthorityBootstrapPhase");
    expect(phaseReviewPublicationApplicationSource).toContain("recordApprovedEvidence(input.phase, reportPath)");
    expect(phaseExitApplicationSource).toContain("markCompletedAfterReview");
    expect(phaseExitApplicationSource).toContain("completionEvidencePresent: input.v1ReviewRequired");
  });

  it("keeps missing-gate recovery below the authoritative terminal boundary", () => {
    const runContinueSource = continueImplementationApplicationSource;
    const workflowSummarySource = featureWorkflowSummaryProjectorSource;
    const executionSource = continueImplementationRunApplicationSource;

    expect(runContinueSource).toContain("missingQualityGateCount === 0");
    expect(runContinueSource).toContain("Resolving missing phase quality gates");
    expect(workflowSummarySource).toContain("missingQualityGateCount > 0");
    expect(featureWorkflowMessagePolicySource).toContain("Continue Implementation can resolve them");
    expect(phaseFoundationApplicationsSource).toContain("findFirstMissingQualityGate: getFirstMissingPhaseQualityGate");
    expect(executionSource).toContain("this.isTerminal(preRunReconciliation)");
    expect(executionSource).toContain("this.isTerminal(postWorkerReconciliation)");
    expect(executionSource).toContain("return result.allTerminal;");
    expect(implementationRunApplicationsSource).toContain(
      "hasRemainingWork: (feature) => !areAllImplementationPhasesResolved(feature)",
    );
    expect(phaseQualityEvidencePolicySource).toContain("export function getFirstMissingPhaseQualityGate");
  });

  it("labels code-review provider failures with the code-review model context", () => {
    expect(implementationWorkerApplicationSource).toContain("formatFailure({");
    expect(implementationWorkerFailureSource).toContain("This failure came from the code-review model");
    expect(implementationWorkerFailureSource).toContain("not the phase implementation model");
    expect(autonomousImplementationWorkflowApplicationSource).toContain("activePhaseFailureContext");
    expect(implementationFailureClassifierSource).toContain("export function isCodeReviewAgentFailure");
    expect(getFunctionSource("isRecoverableImplementationFailure")).toContain("isCodeReviewAgentFailure(errorMessage)");
    expect(getFunctionSource("prepareKnownWorkflowRecovery")).toContain("Prepared code-review worker retry context");
    expect(getFunctionSource("prepareKnownWorkflowRecovery")).toContain("rerun the code-review worker instead of launching another implementation worker");
    expect(getFunctionSource("getWorkflowFailureAnalysis")).toContain("The code-review worker failed before producing a review verdict.");
  });

  it("hardens code-review prompts and malformed review verdicts", () => {
    expect(phaseCodeReviewExecutionPromptSource).toContain("Use simple inspection commands with absolute paths");
    expect(phaseCodeReviewExecutionPromptSource).toContain("Avoid fragile shell headings");
    expect(phaseCodeReviewExecutionPromptSource).toContain("optional diagnostic search may return no matches");
    expect(phaseCodeReviewExecutionPromptSource).toContain("Never end the review without one exact `Review Result:` line");
    expect(phaseCodeReviewFindingContractPromptSource).toContain("Acceptance evidence required");
    expect(phaseCodeReviewFindingContractPromptSource).toContain("Compatibility Decision");
    expect(phaseCodeReviewFindingContractPromptSource).toContain("Never leave compatibility to fixer inference");
    expect(phaseCodeReviewFindingContractPromptSource).toContain("Compatibility approval source");
    expect(phaseCodeReviewFindingContractPromptSource).toContain("planning narrative, local caller, test, fixture, or development data is not such authority");
    expect(phaseCodeReviewAdjudicationPromptSource).toContain("REBUTTAL_ACCEPTED_DEFERRED");
    expect(phaseCodeReviewAdjudicationPromptSource).toContain("REBUTTAL_REJECTED");
    expect(phaseCodeReviewAdjudicationPromptSource).toContain("REFRAME_INTO_SCOPE");
    expect(phaseCodeReviewAdjudicationPromptSource).toContain("OUTSIDE_OF_SCOPE");
    expect(phaseCodeReviewAdjudicationPromptSource).toContain("REJECT_REFRAME");
    expect(phaseCodeReviewAdjudicationPromptSource).toContain("MemoryBank/Overview/TechnicalDebts.md");
    expect(phaseCodeReviewAdjudicationPromptSource).toContain("Do not turn a rejected rebuttal into a NEW finding");
    expect(phaseCodeReviewAdjudicationPromptSource).toContain("A prior `FIX_ACCEPTED`, `NOT_APPLICABLE`, or `REBUTTAL_ACCEPTED_DEFERRED` finding ID is settled");
    expect(phaseCodeReviewAdjudicationPromptSource).toContain("the reviewer identifies a specific acceptance condition from the original finding");
    expect(phaseCodeReviewAdjudicationPromptSource).toContain("Do not silently broaden its required remediation to sibling validators");
    expect(phaseReviewRemediationPromptSource).toContain("REBUTTAL_PROPOSED");
    expect(phaseReviewRemediationPromptSource).toContain("ACCEPT_REFRAME");
    expect(phaseReviewRemediationPromptSource).toContain("Scope guardrail");
    expect(previousCodeReviewFollowUpPresenterSource).toContain("Fixer Decision, Reviewer Decision");
    expect(previousCodeReviewFollowUpPresenterSource).toContain("FIX_ACCEPTED");
    expect(previousCodeReviewFollowUpPresenterSource).toContain("this.repository.findLatest(featureFolderPath, phaseNumber)");
    expect(previousCodeReviewFollowUpPresenterSource).toContain("Fixer Response\\` is its fixer position");
    expect(previousCodeReviewFollowUpPresenterSource).toContain("formatCodeReviewFindingForPrompt(finding)");
    expect(phaseReviewPublicationApplicationSource).toContain("selectPersistedReviewTransition(");
    expect(orchestratorSource).not.toContain("function reviewResultRequiresFindingsResolution");
    expect(orchestratorSource).not.toContain("function parseReviewResult");
  });

  it("persists code-review reports into the next failure brief", () => {
    expect(workflowFailureBriefPresenterSource).toContain("compact(");
    expect(workflowFailureBriefPresenterSource).toContain("export function renderCodeReviewBlockerSection");
    expect(codeReviewFailureContextRepositorySource).toContain("extract(rawError: string)");
    expect(codeReviewFailureContextRepositorySource).toContain("function extractReportPath");
    expect(codeReviewFindingParserSource).toContain("export function extractCodeReviewFindings");
    expect(phaseReviewApplicationsSource).toContain('from "../workflows/reviews/code-review-finding-parser.js"');
    expect(workflowFailureBriefPresenterSource).toContain("### Review Finding Decision Queue");
    expect(codeReviewFindingParserSource).toContain("function createFinding");
    expect(workflowFailureBriefPresenterSource).toContain("Review report:");
  });

  it("keeps phase routing metadata on the same markdown line", () => {
    expect(markdownParsingSource).toContain("^\\\\s*(?:[-*]\\\\s*)?(?:\\\\*\\\\*)?");
    expect(markdownParsingSource).toContain("[ \\\\t]*:[ \\\\t]*");
    expect(markdownParsingSource).not.toContain("\\\\s*:\\\\s*`?([^\\\\`\\\\r\\\\n]+)");
  });
});
