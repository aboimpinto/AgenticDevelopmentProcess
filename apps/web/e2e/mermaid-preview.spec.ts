/** @see apps/web/e2e/features/mermaid-preview.feature */
import { test, expect } from "@playwright/test";
import { installDashboardFixtures, makeWorkItem } from "./fixtures/dashboard-fixtures";

const feature = makeWorkItem({ id: "diagram-fixture", title: "Diagram preview fixture" });

test.describe("Mermaid document compatibility", () => {
  for (const [name, source, labels] of [
    ["flowchart", "flowchart LR\n  A[Review] --> B[Complete]", ["Review", "Complete"]],
    ["sequence", "sequenceDiagram\n  Alice->>Bob: Verify feature", ["Alice", "Verify feature"]],
    ["state", "stateDiagram-v2\n  [*] --> Draft\n  Draft --> Reviewed", ["Draft", "Reviewed"]],
    ["class", "classDiagram\n  Feature --> Phase\n  class Feature", ["Feature", "Phase"]],
  ] as const) {
    test(`renders a real ${name} diagram in the document preview`, async ({ page }) => {
      await installDashboardFixtures(page, [feature]);
      await page.route("**/api/**/document", (route) => route.fulfill({ json: {
        content: "```mermaid\n" + source + "\n```", readStatus: "ok", readError: null,
      } }));
      await page.goto("/");
      await page.getByRole("region", { name: "MemoryBank work board" })
        .locator("article.feature-card").first().click();
      const diagram = page.locator(".mermaid-diagram svg");
      await expect(diagram).toBeVisible();
      for (const label of labels) await expect(diagram).toContainText(label);
      await expect(page.locator(".mermaid-diagram-error")).toHaveCount(0);
    });
  }

  test("shows malformed source safely and recovers when the document is reloaded", async ({ page }) => {
    await installDashboardFixtures(page, [feature]);
    let source = "this-is-not-a-diagram";
    await page.route("**/api/**/document", (route) => route.fulfill({ json: {
      content: "```mermaid\n" + source + "\n```", readStatus: "ok", readError: null,
    } }));
    await page.goto("/");
    await page.getByRole("region", { name: "MemoryBank work board" })
      .locator("article.feature-card").first().click();
    await expect(page.getByText("Mermaid diagram could not be rendered.")).toBeVisible();
    await expect(page.locator(".mermaid-diagram-error code")).toHaveText(source);
    source = "flowchart LR\n  A[Recovered] --> B[Ready]";
    await page.getByRole("button", { name: "Reload document from disk" }).click();
    await expect(page.locator(".mermaid-diagram svg")).toBeVisible();
    await expect(page.locator(".mermaid-diagram svg")).toContainText("Recovered");
    await expect(page.locator(".mermaid-diagram-error")).toHaveCount(0);
  });
});
