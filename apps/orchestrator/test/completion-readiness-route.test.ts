import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { expect, it, vi } from "vitest";
import { handleCompletionReadinessRoute } from "../src/transport/http/routes/completion-readiness-route.js";
const url = new URL("http://localhost/api/projects/example/completion-readiness");
const response = () => ({ writeHead: vi.fn(), end: vi.fn() }) as unknown as ServerResponse;
const request = (body: unknown) => Object.assign(Readable.from([JSON.stringify(body)]), { method: "POST" }) as IncomingMessage;
it("accepts only project-scoped explicit refresh/confirmation commands", async () => {
  const result = { items: [], assessment: { ready: false, blockers: [], assessedAt: "now" }, message: "Reassessed" };
  const refresh = vi.fn(async () => result), reply = response();
  await handleCompletionReadinessRoute(request({ cardId: "card", confirmProposalId: "proposal", confirm: true, projectId: "ignored", folderPath: "/ignored" }), reply, url, { refresh });
  expect(refresh).toHaveBeenCalledWith({ projectId: "example", cardId: "card", confirmProposalId: "proposal", confirm: true });
  expect(reply.end).toHaveBeenCalledWith(JSON.stringify(result));
  expect(await handleCompletionReadinessRoute({ method: "GET" } as IncomingMessage, response(), url, { refresh })).toBe(false);
  expect(refresh).toHaveBeenCalledOnce();
});
it.each([{}, null, { cardId: 123 }, { cardId: "card", confirm: "true" }, { cardId: "card", reassess: "true" },
  { cardId: "card", reassess: true, confirmProposalId: "proposal", confirm: true },
  { cardId: "card", verifyExisting: true }, { cardId: "card", reassess: true, verifyExisting: "true" },
  { cardId: "card", reassess: true, verifyExisting: true, confirm: true },
  { cardId: "card", verificationGuidance: "Use another directory" },
  { cardId: "card", reassess: true, verifyExisting: true, verificationGuidance: 123 },
  { cardId: "card", reassess: true, verifyExisting: true, verificationGuidance: "x".repeat(4001) },
  { cardId: "card", reassess: true, coveragePhaseNumber: 2 }])("rejects invalid payload before dispatch: %s", async body => {
  const refresh = vi.fn(), reply = response();
  await handleCompletionReadinessRoute(request(body), reply, url, { refresh });
  expect(refresh).not.toHaveBeenCalled();
  expect(reply.writeHead).toHaveBeenCalledWith(400, expect.anything());
});

it("forwards explicit reassessment authority separately from confirmation", async () => {
  const refresh = vi.fn(), reply = response();
  await handleCompletionReadinessRoute(request({ cardId: "card", reassess: true }), reply, url, { refresh });
  expect(refresh).toHaveBeenCalledWith(expect.objectContaining({ projectId: "example", cardId: "card", reassess: true }));
});

it("forwards user verification authority without inventing prerequisite confirmation", async () => {
  const refresh = vi.fn(), reply = response();
  await handleCompletionReadinessRoute(request({ cardId: "card", reassess: true, verifyExisting: true }), reply, url, { refresh });
  expect(refresh).toHaveBeenCalledWith({ projectId: "example", cardId: "card", reassess: true, verifyExisting: true, confirmProposalId: undefined, confirm: undefined });
});

it("forwards browser recovery guidance only to explicit verification", async () => {
  const refresh = vi.fn(), reply = response();
  await handleCompletionReadinessRoute(request({ cardId: "card", reassess: true, verifyExisting: true, verificationGuidance: "Use the configured output directory." }), reply, url, { refresh });
  expect(refresh).toHaveBeenCalledWith(expect.objectContaining({ verifyExisting: true, verificationGuidance: "Use the configured output directory.", confirm: undefined }));
});
