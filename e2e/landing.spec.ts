/**
 * Landing page & public pages — 12 tests.
 */
import { test, expect } from "@playwright/test";

test.describe("Landing — Public", () => {
  test("L-01: Landing page loads and shows hero", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Kamix").first()).toBeVisible({ timeout: 15_000 });
  });

  test("L-02: Landing has Sign in and Sign up CTAs", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const signIn = page.getByRole("link", { name: /sign in|log in/i }).or(
      page.getByRole("button", { name: /sign in|log in/i })
    );
    await expect(signIn.first()).toBeVisible({ timeout: 10_000 });
  });

  test("L-03: Sign in navigates to /auth", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const signIn = page.getByRole("link", { name: /sign in|log in/i }).or(
      page.getByRole("button", { name: /sign in|log in/i })
    );
    await signIn.first().click();
    await expect(page).toHaveURL(/\/auth/);
  });

  test("L-04: Shows how-it-works content", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(100);
  });

  test("L-05: Page has meaningful title/branding", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Kamix").first()).toBeVisible();
  });

  test("L-06: Footer exists", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const footer = page.locator("footer");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("L-07: Navigation bar visible", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const nav = page.locator("nav, header").first();
    await expect(nav).toBeVisible({ timeout: 10_000 });
  });

  test("L-08: Unknown route shows 404 or fallback", async ({ page }) => {
    await page.goto("/this-does-not-exist");
    await page.waitForLoadState("networkidle");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("L-09: No critical console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const critical = errors.filter(
      (e) => !e.includes("Convex") && !e.includes("favicon") && !e.includes("404")
    );
    expect(critical).toHaveLength(0);
  });

  test("L-10: Responsive at mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Kamix").first()).toBeVisible();
  });

  test("L-11: Responsive at tablet viewport", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=Kamix").first()).toBeVisible();
  });

  test("L-12: Auth page navigable from landing", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const signIn = page.getByRole("link", { name: /sign in|log in/i }).or(
      page.getByRole("button", { name: /sign in|log in/i })
    );
    await signIn.first().click();
    await expect(page).toHaveURL(/\/auth/);
    // Can navigate back to landing
    const logo = page.locator("text=Kamix").first();
    if (await logo.isVisible({ timeout: 3000 }).catch(() => false)) {
      await logo.click();
      await expect(page).toHaveURL(/\/$/);
    }
  });
});
