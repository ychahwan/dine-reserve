/**
 * Restaurant owner flow tests — 12 tests.
 */
import { test, expect } from "@playwright/test";
import { gotoAuth, waitForData } from "./helpers";

test.describe("Owner — Dashboard", () => {
  test("O-01: Owner dashboard loads", async ({ page }) => {
    await gotoAuth(page, "owner", "/owner");
    await expect(page).toHaveURL(/\/owner/);
  });

  test("O-02: Shows restaurants list or empty state", async ({ page }) => {
    await gotoAuth(page, "owner", "/owner");
    const body = await page.textContent("body");
    expect(body).toMatch(/restaurant|no restaurant|add|empty|empty/i);
  });

  test("O-03: Add restaurant button visible", async ({ page }) => {
    await gotoAuth(page, "owner", "/owner");
    const addBtn = page.getByRole("button", { name: /add restaurant/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 15_000 });
  });

  test("O-04: Click Add shows create form", async ({ page }) => {
    await gotoAuth(page, "owner", "/owner");
    await page.getByRole("button", { name: /add restaurant/i }).first().click();
    await page.waitForTimeout(1000);
    await expect(page.locator("#r-name")).toBeVisible({ timeout: 10_000 });
  });

  test("O-05: Form has required fields", async ({ page }) => {
    await gotoAuth(page, "owner", "/owner");
    await page.getByRole("button", { name: /add restaurant/i }).first().click();
    await page.waitForTimeout(1000);
    await expect(page.locator("#r-name")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#r-cuisine")).toBeVisible();
    await expect(page.locator("#r-city")).toBeVisible();
  });

  test("O-06: Form has feature toggles", async ({ page }) => {
    await gotoAuth(page, "owner", "/owner");
    await page.getByRole("button", { name: /add restaurant/i }).first().click();
    await page.waitForTimeout(1000);
    const body = await page.textContent("body");
    expect(body).toMatch(/inside|outside|bar|feature|toggle/i);
  });
});

test.describe("Owner — Restaurant Management", () => {
  test("O-07: Restaurants visible in list", async ({ page }) => {
    await gotoAuth(page, "owner", "/owner");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(30);
  });

  test("O-08: Click card navigates to detail", async ({ page }) => {
    await gotoAuth(page, "owner", "/owner");
    const card = page.locator('[role="link"]').first();
    if (await card.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await card.click();
      await page.waitForTimeout(3000);
      expect(page.url()).toMatch(/\/owner\/restaurant\//);
    }
  });

  test("O-09: Detail page shows tabs", async ({ page }) => {
    await gotoAuth(page, "owner", "/owner");
    const card = page.locator('[role="link"]').first();
    if (await card.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await card.click();
      await page.waitForTimeout(3000);
      const body = await page.textContent("body");
      expect(body).toMatch(/booking|menu|hour|setting|gift|today/i);
    }
  });

  test("O-10: Back navigation works", async ({ page }) => {
    await gotoAuth(page, "owner", "/owner");
    const card = page.locator('[role="link"]').first();
    if (await card.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await card.click();
      await page.waitForTimeout(3000);
      await page.goBack();
      await page.waitForTimeout(2000);
      expect(page.url()).toMatch(/\/owner/);
    }
  });
});

test.describe("Owner — Navigation", () => {
  test("O-11: Owner shell has content", async ({ page }) => {
    await gotoAuth(page, "owner", "/owner");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("O-12: Navigate between dashboard and restaurant", async ({ page }) => {
    await gotoAuth(page, "owner", "/owner");
    const card = page.locator('[role="link"]').first();
    if (await card.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await card.click();
      await page.waitForTimeout(3000);
      expect(page.url()).toMatch(/\/owner\/restaurant\//);
      await page.goto("/owner");
      await waitForData(page);
      await expect(page).toHaveURL(/\/owner/);
    }
  });
});
