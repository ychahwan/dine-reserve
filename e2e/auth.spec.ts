/**
 * Auth flow tests — 8 tests.
 * Uses pre-authenticated admin storage state for login capability.
 */
import { test, expect } from "@playwright/test";
import { USERS } from "./helpers";

test.describe("Auth Flow", () => {
  test("A-01: Auth page loads with phone input", async ({ page }) => {
    await page.goto("/auth");
    await page.waitForLoadState("domcontentloaded");
    const phoneInput = page.locator('input[name="phone"], input[type="tel"]').first();
    await expect(phoneInput).toBeVisible({ timeout: 10_000 });
  });

  test("A-02: Phone routes to password for existing account", async ({ page }) => {
    await page.goto("/auth");
    await page.waitForLoadState("domcontentloaded");
    const phoneInput = page.locator('input[name="phone"], input[type="tel"]').first();
    await expect(phoneInput).toBeVisible({ timeout: 10_000 });
    await phoneInput.fill(USERS.admin.phone);
    await phoneInput.press("Enter");
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 15_000 });
  });

  test("A-03: Password login works for admin", async ({ page }) => {
    await page.goto("/auth");
    await page.waitForLoadState("domcontentloaded");
    const phoneInput = page.locator('input[name="phone"], input[type="tel"]').first();
    await expect(phoneInput).toBeVisible({ timeout: 10_000 });
    await phoneInput.fill(USERS.admin.phone);
    await phoneInput.press("Enter");
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 15_000 });
    await passwordInput.fill(USERS.admin.password);
    const submitBtn = page.getByRole("button", { name: /sign in/i }).first();
    await submitBtn.click();
    await page.waitForURL((url) => url.pathname.includes("/admin"), { timeout: 20_000 });
  });

  test("A-04: Wrong password shows error", async ({ page }) => {
    await page.goto("/auth");
    await page.waitForLoadState("domcontentloaded");
    const phoneInput = page.locator('input[name="phone"], input[type="tel"]').first();
    await expect(phoneInput).toBeVisible({ timeout: 10_000 });
    await phoneInput.fill(USERS.admin.phone);
    await phoneInput.press("Enter");
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 15_000 });
    await passwordInput.fill("WrongPassword123!");
    const submitBtn = page.getByRole("button", { name: /sign in/i }).first();
    await submitBtn.click();
    await page.waitForTimeout(3000);
    const body = await page.textContent("body");
    expect(body).toMatch(/invalid|wrong|error|incorrect|failed/i);
  });

  test("A-05: Back button returns to phone entry", async ({ page }) => {
    await page.goto("/auth");
    await page.waitForLoadState("domcontentloaded");
    const phoneInput = page.locator('input[name="phone"], input[type="tel"]').first();
    await expect(phoneInput).toBeVisible({ timeout: 10_000 });
    await phoneInput.fill(USERS.admin.phone);
    await phoneInput.press("Enter");
    await page.locator('input[name="password"], input[type="password"]').first().waitFor({ timeout: 15_000 });
    const backBtn = page.getByRole("button", { name: /different number|back|change/i });
    if (await backBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await backBtn.click();
      await expect(phoneInput).toBeVisible();
    }
  });

  test("A-06: Empty phone prevents submission", async ({ page }) => {
    await page.goto("/auth");
    await page.waitForLoadState("domcontentloaded");
    const phoneInput = page.locator('input[name="phone"], input[type="tel"]').first();
    await expect(phoneInput).toBeVisible({ timeout: 10_000 });
    await phoneInput.press("Enter");
    await expect(page).toHaveURL(/\/auth/);
  });

  test("A-07: Auth page shows brand logo", async ({ page }) => {
    await page.goto("/auth");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("text=Kamix").first()).toBeVisible({ timeout: 10_000 });
  });

  test("A-08: Submit disabled with short password", async ({ page }) => {
    await page.goto("/auth");
    await page.waitForLoadState("domcontentloaded");
    const phoneInput = page.locator('input[name="phone"], input[type="tel"]').first();
    await expect(phoneInput).toBeVisible({ timeout: 10_000 });
    await phoneInput.fill(USERS.admin.phone);
    await phoneInput.press("Enter");
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 15_000 });
    await passwordInput.fill("short");
    const submitBtn = page.getByRole("button", { name: /sign in/i }).first();
    await expect(submitBtn).toBeDisabled();
  });
});
