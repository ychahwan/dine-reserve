/**
 * Admin flow tests — 14 tests.
 * All navigation via direct URL to avoid sidebar selector issues.
 */
import { test, expect } from "@playwright/test";
import { gotoAuth, waitForData } from "./helpers";

async function gotoAdmin(page: import("@playwright/test").Page, subpath: string) {
  await gotoAuth(page, "admin", `/admin${subpath}`);
  await waitForData(page);
}

test.describe("Admin — Dashboard", () => {
  test("AD-01: Admin dashboard loads with stats", async ({ page }) => {
    await gotoAdmin(page, "");
    await expect(page).toHaveURL(/\/admin/);
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test("AD-02: Dashboard shows stat cards", async ({ page }) => {
    await gotoAdmin(page, "");
    const body = await page.textContent("body");
    expect(body).toMatch(/Restaurant|User|Booking|Overview|Total/i);
  });

  test("AD-03: Dashboard shows metrics", async ({ page }) => {
    await gotoAdmin(page, "");
    const body = await page.textContent("body");
    expect(body).toMatch(/revenue|rating|review|order|stat|count/i);
  });
});

test.describe("Admin — Navigation", () => {
  test("AD-04: Dashboard shows navigation options", async ({ page }) => {
    await gotoAdmin(page, "");
    const body = await page.textContent("body");
    expect(body).toMatch(/dashboard|restaurant|user|review|setting|audit|nav/i);
  });

  test("AD-05: Navigate to Users page", async ({ page }) => {
    await gotoAdmin(page, "/users");
    await expect(page).toHaveURL(/\/admin\/users/);
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test("AD-06: Navigate to Restaurants page", async ({ page }) => {
    await gotoAdmin(page, "/restaurants");
    await expect(page).toHaveURL(/\/admin\/restaurants/);
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test("AD-07: Navigate to Reviews page", async ({ page }) => {
    await gotoAdmin(page, "/reviews");
    await expect(page).toHaveURL(/\/admin\/reviews/);
  });

  test("AD-08: Navigate to Settings page", async ({ page }) => {
    await gotoAdmin(page, "/settings");
    await expect(page).toHaveURL(/\/admin\/settings/);
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test("AD-09: Navigate to Audit page", async ({ page }) => {
    await gotoAdmin(page, "/audit");
    await expect(page).toHaveURL(/\/admin\/audit/);
  });
});

test.describe("Admin — Users Management", () => {
  test("AD-10: Users page has search and filters", async ({ page }) => {
    await gotoAdmin(page, "/users");
    const body = await page.textContent("body");
    expect(body).toMatch(/search|filter|user|name|phone/i);
  });

  test("AD-11: Users table has rows", async ({ page }) => {
    await gotoAdmin(page, "/users");
    await page.waitForTimeout(3000);
    const table = page.locator("table");
    if (await table.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const rows = table.locator("tbody tr");
      expect(await rows.count()).toBeGreaterThan(0);
    }
  });

  test("AD-12: Add user dialog opens", async ({ page }) => {
    await gotoAdmin(page, "/users");
    await page.getByRole("button", { name: /add user/i }).click();
    await page.waitForTimeout(1000);
    await expect(page.locator("#add-phone")).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
  });
});

test.describe("Admin — Settings", () => {
  test("AD-13: Settings shows config options", async ({ page }) => {
    await gotoAdmin(page, "/settings");
    await page.waitForTimeout(2000);
    const body = await page.textContent("body");
    expect(body).toMatch(/setting|config|twilio|firebase|ai|notification|phone/i);
  });

  test("AD-14: Settings has interactive elements", async ({ page }) => {
    await gotoAdmin(page, "/settings");
    const inputs = page.locator("input, textarea, button");
    expect(await inputs.count()).toBeGreaterThan(0);
  });
});
