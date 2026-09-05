// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoutingMatrixPreviewV1, RoutingMatrixRowDraftV1, RoutingMatrixRowV1, RoutingMatrixSnapshotV1 } from "@hepha/shared";
import { RoutingDefaultsPanel } from "./RoutingDefaultsPanel.js";
import { routeIdentityKey } from "./routing-matrix-presentation.js";
import { RoutingPolicyPresentationError, type RoutingPolicyApi } from "./routing-policy-api.js";
import { fallbackRoute, globalRoute, implementationRoute, routingMatrixFixture } from "./test-support/routing-matrix-fixture.js";

const initial = routingMatrixFixture();

afterEach(() => cleanup());

describe("RoutingDefaultsPanel", () => {
  it("renders the complete server-ordered Global-only hierarchy with friendly and effective facts", async () => {
    render(<RoutingDefaultsPanel api={mockApi()} />);
    expect(await screen.findByRole("heading", { name: "Global Default", level: 3 })).toBeTruthy();
    const groupHeadings = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(groupHeadings).toEqual(["Global Default", "Discovery & Planning", "Implementation", "Review", "Completion", "Knowledge & Documentation"]);
    expect(screen.getAllByText("Type default")).toHaveLength(5);
    expect(screen.getAllByText("Action")).toHaveLength(17);
    expect(screen.getAllByRole("combobox")).toHaveLength(23);
    expect(screen.getByLabelText("Configured route for Continue Implementing")).toHaveProperty("value", "inherit");
    expect(screen.getAllByText("OpenAI Personal · global-model").length).toBeGreaterThan(17);
    expect(screen.getAllByText(/^connection-global \/ global-model$/)).toHaveLength(23);
    expect(screen.getAllByText(/Effective identity:/).length).toBe(23);
  });

  it("renders server effective inheritance, durable attention, and sends a revision-aware selector mutation", async () => {
    const attentionSnapshot: RoutingMatrixSnapshotV1 = {
      ...initial,
      attention: [{
        attentionId: "attention-regression",
        attentionRevisionId: initial.policy.revisionId,
        affectedRoute: implementationRoute.route,
        reasonCode: "catalog_reset",
        occurredAt: "2026-07-25T00:00:02.000Z",
        acknowledgedAt: null,
      }],
    };
    const api = mockApi(attentionSnapshot);
    render(<RoutingDefaultsPanel api={api} />);

    const continueRow = (await screen.findByRole("heading", { name: "Continue Implementing" })).closest("article")!;
    expect(within(continueRow).getByLabelText("Configured route for Continue Implementing")).toHaveProperty("value", "inherit");
    expect(within(continueRow).getByText("Global", { selector: "dd" })).toBeTruthy();
    expect(await screen.findByText("Routing attention required")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Acknowledge notice" }));
    await waitFor(() => expect(api.acknowledge).toHaveBeenCalledTimes(1));
    expect(api.acknowledge.mock.calls[0]?.[0]).toMatchObject({
      attentionIdentity: { attentionId: "attention-regression", affectedRoute: implementationRoute.route },
      expectedRevision: { revisionId: "routing-revision-1", revisionNumber: 1 },
      revisionGuard: "opaque-guard-1",
    });

    fireEvent.change(screen.getByLabelText("Configured route for Implementation"), { target: { value: routeIdentityKey(implementationRoute.route) } });
    fireEvent.click(await screen.findByRole("button", { name: "Save Implementation" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    expect(api.save.mock.calls[0]?.[0]).toMatchObject({
      policyId: "installation-global",
      scope: { kind: "action_type", actionType: "implementation" },
      expectedRevision: { revisionId: "routing-revision-1", revisionNumber: 1 },
      revisionGuard: "opaque-guard-1",
    });
  });

  it("explains each unmet server-rejected route capability without displaying the rejection payload", async () => {
    const ineligibleRoute = {
      ...fallbackRoute,
      route: {
        connectionId: "connection-ineligible" as typeof fallbackRoute.route.connectionId,
        modelId: "small-model",
      },
      connectionLabel: "Small Model Team",
      eligible: false,
      reasons: [
        { code: "context_window_too_small" as const, message: "The model context window is too small." },
        { code: "tools_required" as const, message: "Tool support is required." },
        { code: "api_required" as const, message: "API support is required." },
      ],
    };
    const capabilitySnapshot: RoutingMatrixSnapshotV1 = {
      ...initial,
      groups: initial.groups.map((group) => group.actionType !== "review" ? group : {
        ...group,
        actions: group.actions.map((row) => ({ ...row, routeChoices: [...row.routeChoices, ineligibleRoute] })),
      }),
    };
    const api = mockApi(capabilitySnapshot);
    render(<RoutingDefaultsPanel api={api} />);

    const reviewRow = (await screen.findByRole("heading", { name: "Code Review" })).closest("article")!;
    const rejectedOption = within(reviewRow).getByRole("option", { name: /Small Model Team · small-model/ });
    expect(rejectedOption).toHaveProperty("disabled", true);
    const eligibilityText = within(reviewRow).getByText(/Small Model Team · small-model:/).closest("li")?.textContent ?? "";
    expect(eligibilityText).toContain("model context window is too small");
    expect(eligibilityText).toContain("Tool support is required");
    expect(eligibilityText).toContain("API support is required");
    expect(reviewRow.textContent).not.toContain("feat-061-routing-secret-never-expose");
    expect(api.save).not.toHaveBeenCalled();
  });

  it("keeps independent row drafts while one atomic save clears only its own scope", async () => {
    const api = mockApi();
    render(<RoutingDefaultsPanel api={api} />);
    await screen.findByRole("heading", { name: "Routing Defaults" });

    fireEvent.change(screen.getByLabelText("Configured route for Implementation"), { target: { value: routeIdentityKey(implementationRoute.route) } });
    fireEvent.change(screen.getByLabelText("Configured route for Continue Implementing"), { target: { value: routeIdentityKey(fallbackRoute.route) } });
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByText("Unsaved")).toHaveLength(2));

    fireEvent.click(await screen.findByRole("button", { name: "Save Implementation" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    expect(api.save.mock.calls[0]?.[0]).toMatchObject({
      scope: { kind: "action_type", actionType: "implementation" },
      selection: { kind: "route", route: implementationRoute.route, failurePolicy: { kind: "fail_immediately" } },
      expectedRevision: { revisionId: "routing-revision-1", revisionNumber: 1 }, revisionGuard: "opaque-guard-1",
    });
    await waitFor(() => expect(screen.getAllByText("Unsaved")).toHaveLength(1));
    expect(screen.getByLabelText("Configured route for Continue Implementing")).toHaveProperty("value", routeIdentityKey(fallbackRoute.route));
    expect(screen.getByText("Implementation saved in routing revision 2.")).toBeTruthy();
  });

  it("admits only one save while retaining local edits made to another row in flight", async () => {
    const api = mockApi();
    let settleSave!: (value: RoutingMatrixSnapshotV1) => void;
    api.save.mockReturnValue(new Promise((resolve) => { settleSave = resolve; }));
    render(<RoutingDefaultsPanel api={api} />);
    await screen.findByRole("heading", { name: "Routing Defaults" });

    fireEvent.change(screen.getByLabelText("Configured route for Start Feature"), { target: { value: routeIdentityKey(implementationRoute.route) } });
    fireEvent.click(await screen.findByRole("button", { name: "Save Start Feature" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    const savingRow = screen.getByRole("heading", { name: "Start Feature" }).closest("article")!;
    expect(savingRow.getAttribute("aria-busy")).toBe("true");
    expect(within(savingRow).getByText("Saving")).toBeTruthy();
    expect(within(savingRow).getByLabelText("Configured route for Start Feature")).toHaveProperty("disabled", true);
    expect(within(savingRow).getByRole("button", { name: "Discard Start Feature changes" })).toHaveProperty("disabled", true);
    expect(within(savingRow).getByRole("button", { name: "Saving Start Feature" })).toHaveProperty("disabled", true);
    expect(screen.getAllByText("Saving")).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("Configured route for Continue Implementing"), { target: { value: routeIdentityKey(fallbackRoute.route) } });
    expect(screen.getByLabelText("Configured route for Continue Implementing")).toHaveProperty("disabled", false);
    const secondSave = await screen.findByRole("button", { name: "Save Continue Implementing" });
    expect(secondSave).toHaveProperty("disabled", true);
    fireEvent.click(secondSave);
    expect(api.save).toHaveBeenCalledTimes(1);

    settleSave(routingMatrixFixture(2));
    await screen.findByText("Start Feature saved in routing revision 2.");
    expect(screen.getByLabelText("Configured route for Continue Implementing")).toHaveProperty("value", routeIdentityKey(fallbackRoute.route));
    expect(screen.getAllByText("Unsaved")).toHaveLength(1);
  });

  it("edits all explicit failure modes and uses server-classified fallback choices", async () => {
    const api = mockApi();
    render(<RoutingDefaultsPanel api={api} />);
    await screen.findByRole("heading", { name: "Routing Defaults" });

    fireEvent.change(screen.getByLabelText("Configured route for Code Review"), { target: { value: routeIdentityKey(implementationRoute.route) } });
    await screen.findByLabelText("Failure policy for Code Review");
    fireEvent.change(screen.getByLabelText("Failure policy for Code Review"), { target: { value: "reroute_global_once" } });
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText("Failure policy for Code Review"), { target: { value: "reroute_route_once" } });
    const fallback = await screen.findByLabelText("Fallback route for Code Review");
    await waitFor(() => expect(fallback).toHaveProperty("disabled", false));
    fireEvent.change(fallback, { target: { value: routeIdentityKey(fallbackRoute.route) } });
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(4));
    fireEvent.click(await screen.findByRole("button", { name: "Save Code Review" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    expect(api.save.mock.calls[0]?.[0].selection).toEqual({
      kind: "route", route: implementationRoute.route,
      failurePolicy: { kind: "reroute_route_once", fallbackRoute: fallbackRoute.route },
    });
  });

  it("removes semantic drafts when inherited and complete explicit values return to their authoritative configuration", async () => {
    const api = mockApi();
    const { unmount } = render(<RoutingDefaultsPanel api={api} />);
    await screen.findByRole("heading", { name: "Routing Defaults" });

    const inheritedRoute = screen.getByLabelText("Configured route for Start Feature");
    fireEvent.change(inheritedRoute, { target: { value: routeIdentityKey(implementationRoute.route) } });
    await screen.findByRole("button", { name: "Save Start Feature" });
    fireEvent.change(inheritedRoute, { target: { value: "inherit" } });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save Start Feature" })).toBeNull());
    expect(screen.queryByText("Unsaved")).toBeNull();
    expect(api.save).not.toHaveBeenCalled();
    unmount();

    const explicitSnapshot = withExplicitStartRoute(initial);
    const explicitApi = mockApi(explicitSnapshot);
    render(<RoutingDefaultsPanel api={explicitApi} />);
    await screen.findByRole("heading", { name: "Routing Defaults" });
    const failure = screen.getByLabelText("Failure policy for Start Feature");
    fireEvent.change(failure, { target: { value: "reroute_global_once" } });
    await screen.findByRole("button", { name: "Save Start Feature" });
    fireEvent.change(failure, { target: { value: "reroute_route_once" } });
    const fallback = await screen.findByLabelText("Fallback route for Start Feature");
    fireEvent.change(fallback, { target: { value: routeIdentityKey(fallbackRoute.route) } });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save Start Feature" })).toBeNull());
    expect(explicitApi.save).not.toHaveBeenCalled();
  });

  it("ignores an older preview that settles after a newer local route draft", async () => {
    const api = mockApi();
    const previews: Array<{ input: RoutingMatrixRowDraftV1; resolve: (value: RoutingMatrixPreviewV1) => void; reject: (error: unknown) => void }> = [];
    api.preview.mockImplementation((input) => new Promise((resolve, reject) => previews.push({ input, resolve, reject })));
    render(<RoutingDefaultsPanel api={api} />);
    await screen.findByRole("heading", { name: "Routing Defaults" });

    const route = screen.getByLabelText("Configured route for Start Feature");
    fireEvent.change(route, { target: { value: routeIdentityKey(implementationRoute.route) } });
    fireEvent.change(route, { target: { value: routeIdentityKey(fallbackRoute.route) } });
    await waitFor(() => expect(previews).toHaveLength(2));
    previews[1]!.resolve(previewFor(initial, previews[1]!.input));
    await screen.findByRole("button", { name: "Save Start Feature" });
    previews[0]!.reject(new RoutingPolicyPresentationError("ROUTING_POLICY_CONFLICT"));
    await waitFor(() => expect(screen.queryByText("Routing policy conflict.")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Save Start Feature" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    expect(api.save.mock.calls[0]?.[0]).toMatchObject({ selection: { kind: "route", route: fallbackRoute.route } });
  });

  it("preserves every draft and removes only saving state after a network mutation failure", async () => {
    const api = mockApi();
    api.save.mockRejectedValueOnce(new RoutingPolicyPresentationError());
    render(<RoutingDefaultsPanel api={api} />);
    await screen.findByRole("heading", { name: "Routing Defaults" });
    fireEvent.change(screen.getByLabelText("Configured route for Start Feature"), { target: { value: routeIdentityKey(implementationRoute.route) } });
    fireEvent.change(screen.getByLabelText("Configured route for Continue Implementing"), { target: { value: routeIdentityKey(fallbackRoute.route) } });
    await waitFor(() => expect(screen.getAllByText("Unsaved")).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: "Save Start Feature" }));
    await screen.findByText("Routing data could not be processed safely. Refresh and try again.");
    expect(screen.getAllByText("Unsaved")).toHaveLength(2);
    expect(screen.queryByText("Saving")).toBeNull();
    expect(screen.getByLabelText("Configured route for Start Feature")).toHaveProperty("disabled", false);
    expect(screen.getByLabelText("Configured route for Continue Implementing")).toHaveProperty("disabled", false);
  });

  it("keeps retained drafts conflicted when a post-Save preview rejects the rebound guard", async () => {
    const api = mockApi();
    let previewCalls = 0;
    api.preview.mockImplementation(async (input) => {
      previewCalls += 1;
      if (previewCalls === 3) throw new RoutingPolicyPresentationError("ROUTING_POLICY_CONFLICT");
      return previewFor(initial, input);
    });
    render(<RoutingDefaultsPanel api={api} />);
    await screen.findByRole("heading", { name: "Routing Defaults" });
    fireEvent.change(screen.getByLabelText("Configured route for Start Feature"), { target: { value: routeIdentityKey(implementationRoute.route) } });
    fireEvent.change(screen.getByLabelText("Configured route for Continue Implementing"), { target: { value: routeIdentityKey(fallbackRoute.route) } });
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Save Start Feature" }));

    const conflict = (await screen.findByText("Routing policy conflict.")).parentElement!;
    expect(within(conflict).getByRole("button", { name: "Reload latest and compare" })).toBeTruthy();
    expect(screen.getByLabelText("Configured route for Continue Implementing")).toHaveProperty("value", routeIdentityKey(fallbackRoute.route));
    expect(screen.getByRole("button", { name: "Save Continue Implementing" })).toHaveProperty("disabled", true);
    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it("does not let a retained refresh overwrite a newer local edit made after Save settlement", async () => {
    const api = mockApi();
    const deferred: Array<{ input: RoutingMatrixRowDraftV1; resolve: (value: RoutingMatrixPreviewV1) => void }> = [];
    let calls = 0;
    api.preview.mockImplementation(async (input) => {
      calls += 1;
      if (calls <= 2) return previewFor(initial, input);
      return new Promise((resolve) => deferred.push({ input, resolve }));
    });
    render(<RoutingDefaultsPanel api={api} />);
    await screen.findByRole("heading", { name: "Routing Defaults" });
    fireEvent.change(screen.getByLabelText("Configured route for Start Feature"), { target: { value: routeIdentityKey(implementationRoute.route) } });
    fireEvent.change(screen.getByLabelText("Configured route for Continue Implementing"), { target: { value: routeIdentityKey(fallbackRoute.route) } });
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Save Start Feature" }));
    await waitFor(() => expect(deferred).toHaveLength(1));

    fireEvent.change(screen.getByLabelText("Configured route for Continue Implementing"), { target: { value: routeIdentityKey(implementationRoute.route) } });
    await waitFor(() => expect(deferred).toHaveLength(2));
    deferred[1]!.resolve(previewFor(routingMatrixFixture(2), deferred[1]!.input));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Continue Implementing" })).toHaveProperty("disabled", true));
    deferred[0]!.resolve(previewFor(routingMatrixFixture(2), deferred[0]!.input));
    await screen.findByText("Start Feature saved in routing revision 2.");

    expect(screen.getByLabelText("Configured route for Continue Implementing")).toHaveProperty("value", routeIdentityKey(implementationRoute.route));
    const save = screen.getByRole("button", { name: "Save Continue Implementing" });
    expect(save).toHaveProperty("disabled", false);
    fireEvent.click(save);
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save.mock.calls[1]?.[0]).toMatchObject({ selection: { kind: "route", route: implementationRoute.route } });
  });

  it("keeps acknowledgement rebound-preview conflicts visible with drafts retained", async () => {
    const attentionSnapshot: RoutingMatrixSnapshotV1 = {
      ...initial,
      attention: [{ attentionId: "attention-conflict", attentionRevisionId: initial.policy.revisionId, affectedRoute: implementationRoute.route, reasonCode: "catalog_reset", occurredAt: "2026-07-25T00:00:02.000Z", acknowledgedAt: null }],
    };
    const api = mockApi(attentionSnapshot);
    let calls = 0;
    api.preview.mockImplementation(async (input) => {
      calls += 1;
      if (calls === 2) throw new RoutingPolicyPresentationError("ROUTING_POLICY_CONFLICT");
      return previewFor(attentionSnapshot, input);
    });
    render(<RoutingDefaultsPanel api={api} />);
    await screen.findByText("Routing attention required");
    fireEvent.change(screen.getByLabelText("Configured route for Continue Implementing"), { target: { value: routeIdentityKey(fallbackRoute.route) } });
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge notice" }));

    const conflict = (await screen.findByText("Routing policy conflict.")).parentElement!;
    expect(within(conflict).getByRole("button", { name: "Reload latest and compare" })).toBeTruthy();
    expect(screen.getByLabelText("Configured route for Continue Implementing")).toHaveProperty("value", routeIdentityKey(fallbackRoute.route));
    expect(screen.getByRole("button", { name: "Save Continue Implementing" })).toHaveProperty("disabled", true);
  });

  it("does not hide a rebound-preview conflict after Reload latest and compare", async () => {
    const api = mockApi();
    api.matrix.mockResolvedValueOnce(initial).mockResolvedValueOnce(routingMatrixFixture(2));
    let calls = 0;
    api.preview.mockImplementation(async (input) => {
      calls += 1;
      if (calls === 2) throw new RoutingPolicyPresentationError("ROUTING_POLICY_CONFLICT");
      return previewFor(initial, input);
    });
    api.save.mockRejectedValueOnce(new RoutingPolicyPresentationError("ROUTING_POLICY_CONFLICT"));
    render(<RoutingDefaultsPanel api={api} />);
    await screen.findByRole("heading", { name: "Routing Defaults" });
    fireEvent.change(screen.getByLabelText("Configured route for Start Feature"), { target: { value: routeIdentityKey(implementationRoute.route) } });
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Save Start Feature" }));
    const firstConflict = (await screen.findByText("Routing policy conflict.")).parentElement!;
    fireEvent.click(within(firstConflict).getByRole("button", { name: "Reload latest and compare" }));

    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Routing policy conflict.")).toBeTruthy();
    expect(screen.queryByText("Latest policy loaded for comparison.")).toBeNull();
    expect(screen.getByRole("button", { name: "Reload latest and compare" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save Start Feature" })).toHaveProperty("disabled", true);
  });

  it("retains a conflicting draft, focuses safe recovery, reloads the latest guard, and requires explicit retry", async () => {
    const api = mockApi();
    api.matrix.mockResolvedValueOnce(initial).mockResolvedValueOnce(routingMatrixFixture(2));
    api.save.mockRejectedValueOnce(new RoutingPolicyPresentationError("ROUTING_POLICY_CONFLICT")).mockResolvedValueOnce(routingMatrixFixture(3));
    render(<RoutingDefaultsPanel api={api} />);
    await screen.findByRole("heading", { name: "Routing Defaults" });
    fireEvent.change(screen.getByLabelText("Configured route for Start Feature"), { target: { value: routeIdentityKey(implementationRoute.route) } });
    fireEvent.click(await screen.findByRole("button", { name: "Save Start Feature" }));

    const conflict = (await screen.findByText("Routing policy conflict.")).parentElement!;
    await waitFor(() => expect(document.activeElement).toBe(conflict));
    expect(screen.getByLabelText("Configured route for Start Feature")).toHaveProperty("value", routeIdentityKey(implementationRoute.route));
    expect(screen.queryByText(/private conflict/i)).toBeNull();

    fireEvent.click(within(conflict).getByRole("button", { name: "Reload latest and compare" }));
    await screen.findByText("Latest policy loaded for comparison.");
    expect(screen.getByText(/Pending values remain unsaved/)).toBeTruthy();
    expect(screen.getByLabelText("Configured route for Start Feature")).toHaveProperty("value", routeIdentityKey(implementationRoute.route));
    expect(api.save).toHaveBeenCalledTimes(1);

    fireEvent.click(await screen.findByRole("button", { name: "Save Start Feature" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save.mock.calls[1]?.[0]).toMatchObject({ expectedRevision: { revisionNumber: 2 }, revisionGuard: "opaque-guard-2" });
  });

  it("preserves drafts when acknowledging durable attention and makes no repair claim", async () => {
    const attentionSnapshot: RoutingMatrixSnapshotV1 = {
      ...initial,
      attention: [{ attentionId: "attention-1", attentionRevisionId: initial.policy.revisionId, affectedRoute: implementationRoute.route, reasonCode: "catalog_reset", occurredAt: "2026-07-25T00:00:02.000Z", acknowledgedAt: null }],
    };
    const acknowledged = { ...attentionSnapshot, attention: [{ ...attentionSnapshot.attention[0]!, acknowledgedAt: "2026-07-25T00:00:03.000Z" }] };
    const api = mockApi(attentionSnapshot);
    api.acknowledge.mockResolvedValue(acknowledged);
    render(<RoutingDefaultsPanel api={api} />);
    await screen.findByText("Routing attention required");
    fireEvent.change(screen.getByLabelText("Configured route for Continue Implementing"), { target: { value: routeIdentityKey(fallbackRoute.route) } });
    await screen.findByText("Unsaved");
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge notice" }));
    await waitFor(() => expect(api.acknowledge).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Configured route for Continue Implementing")).toHaveProperty("value", routeIdentityKey(fallbackRoute.route));
    expect(screen.getByText("Routing notice acknowledged. No routing policy was changed.")).toBeTruthy();
  });

  it("presents bounded safe states and never renders raw failures", async () => {
    const api = mockApi();
    api.matrix.mockRejectedValue(new RoutingPolicyPresentationError("ROUTING_BOOTSTRAP_REQUIRED"));
    const { rerender } = render(<RoutingDefaultsPanel api={api} />);
    expect(await screen.findByText(/Global Default has not been established/)).toBeTruthy();
    expect(screen.queryByText(/secret|stack|provider payload/i)).toBeNull();

    const unavailable = { ...routingMatrixFixture(), state: "global_unavailable" as const, global: { ...initial.global, effectiveRoute: { ...initial.global.effectiveRoute, availability: "unavailable" as const, eligible: false, reasons: [{ code: "route_unavailable" as const, message: "The connection/model route is unavailable." }] }, eligibility: { eligible: false, reasons: [{ code: "route_unavailable" as const, message: "The connection/model route is unavailable." }] } } };
    const nextApi = mockApi(unavailable);
    rerender(<RoutingDefaultsPanel api={nextApi} />);
    expect(await screen.findByText(/Global Default is unavailable/)).toBeTruthy();
    expect(screen.getByLabelText("Configured route for Global Default")).toBeTruthy();
  });
});

function withExplicitStartRoute(snapshot: RoutingMatrixSnapshotV1): RoutingMatrixSnapshotV1 {
  return {
    ...snapshot,
    groups: snapshot.groups.map((group) => group.actionType !== "implementation" ? group : {
      ...group,
      actions: group.actions.map((row) => row.scopeKey !== "action:start-feature" ? row : {
        ...row,
        configured: { kind: "route", route: implementationRoute.route },
        configuredFailurePolicy: { kind: "reroute_route_once", fallbackRoute: fallbackRoute.route },
        effectiveRoute: implementationRoute,
        effectiveFailurePolicy: { kind: "reroute_route_once", fallbackRoute: fallbackRoute.route },
        policySource: "action",
      }),
    }),
  };
}

function mockApi(snapshot: RoutingMatrixSnapshotV1 = initial) {
  const api = {
    matrix: vi.fn().mockResolvedValue(snapshot),
    preview: vi.fn(async (draft: RoutingMatrixRowDraftV1) => previewFor(snapshot, draft)),
    save: vi.fn().mockResolvedValue(routingMatrixFixture(snapshot.policy.revisionNumber + 1)),
    acknowledge: vi.fn(async (input: Parameters<RoutingPolicyApi["acknowledge"]>[0]) => ({
      ...snapshot,
      attention: snapshot.attention.map((item) => item.attentionId === input.attentionIdentity.attentionId
        ? { ...item, acknowledgedAt: input.acknowledgedAt }
        : item),
    })),
  };
  return api satisfies RoutingPolicyApi;
}

function previewFor(snapshot: RoutingMatrixSnapshotV1, draft: RoutingMatrixRowDraftV1): RoutingMatrixPreviewV1 {
  const rows = [snapshot.global, ...snapshot.groups.flatMap((group) => [group.typeDefault, ...group.actions])];
  const row = rows.find((candidate) => candidate.scopeKey === (draft.scope.kind === "global" ? "global" : draft.scope.kind === "action_type" ? `action_type:${draft.scope.actionType}` : `action:${draft.scope.actionId}`))!;
  let projectedRow: RoutingMatrixRowV1 = row;
  if (draft.selection.kind === "route") {
    const selection = draft.selection;
    const selected = row.routeChoices.find((choice) => routeIdentityKey(choice.route) === routeIdentityKey(selection.route));
    if (!selected) throw new Error("Missing selected route fixture.");
    projectedRow = {
      ...row, configured: { kind: "route", route: selection.route }, configuredFailurePolicy: selection.failurePolicy,
      effectiveRoute: selected, effectiveFailurePolicy: selection.failurePolicy,
      policySource: row.kind === "global" ? "global" : row.kind === "action_type" ? "action_type" : "action",
      eligibility: { eligible: selected.eligible, reasons: selected.reasons },
    };
  }
  return {
    schemaVersion: snapshot.schemaVersion, policyId: snapshot.policy.policyId,
    expectedRevision: draft.expectedRevision, revisionGuard: draft.revisionGuard,
    scope: draft.scope, scopeKey: row.scopeKey, projectedRow,
    allowedFallbackRoutes: row.kind === "global" || draft.selection.kind === "inherit" ? [] : row.routeChoices,
  };
}
