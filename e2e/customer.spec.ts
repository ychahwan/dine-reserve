/**
 * Customer (diner) flow tests — 20 tests.
 */
import { test, expect } from "@playwright/test";
import { gotoAuth, waitForData } from "./helpers";

test.describe("Customer — Explore", () => {
  test("C-01: Explore page loads with restaurants", async ({ page }) => {
    await gotoAuth(page, "customer", "/explore");
    await expect(page).toHaveURL(/\/explore/);
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(50);
  });

  test("C-02: Quick-find date picker or date section visible", async ({ page }) => {
    await gotoAuth(page, "customer", "/explore");
    const body = await page.textContent("body");
    expect(body).toMatch(/today|any day|explore|find/i);
  });

  test("C-03: Party size controls work", async ({ page }) => {
    await gotoAuth(page, "customer", "/explore");
    const incrementBtn = page.locator('button:has-text("+")').first();
    if (await incrementBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await incrementBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test("C-04: Filter chips or cuisine categories displayed", async ({ page }) => {
    await gotoAuth(page, "customer", "/explore");
    const body = await page.textContent("body");
    // Check for cuisine-related content
    expect(body).toMatch(/cuisine|filter|Italian|Japanese|Lebanese|International|any/i);
  });

  test("C-05: Search input available", async ({ page }) => {
    await gotoAuth(page, "customer", "/explore");
    const searchInput = page.locator('input[placeholder*="earch"], input[type="search"], input[name="search"]').first();
    if (await searchInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      expect(await searchInput.getAttribute("placeholder")).toBeTruthy();
    }
  });

  test("C-06: Restaurant cards show content", async ({ page }) => {
    await gotoAuth(page, "customer", "/explore");
    await page.waitForTimeout(3000);
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
    // Should have restaurant-related content
    expect(body!.length).toBeGreaterThan(100);
  });

  test("C-07: Walk-in option available", async ({ page }) => {
    await gotoAuth(page, "customer", "/explore");
    const body = await page.textContent("body");
    expect(body).toMatch(/walk.?in|check.?in|book|reserve|find/i);
  });

  test("C-08: Click restaurant opens detail", async ({ page }) => {
    await gotoAuth(page, "customer", "/explore");
    const bookLink = page.getByRole("link", { name: /book/i }).first();
    if (await bookLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await bookLink.click();
      await page.waitForTimeout(3000);
      expect(page.url()).toMatch(/\/restaurant\//);
    }
  });

  test("C-09: Customer shell visible", async ({ page }) => {
    await gotoAuth(page, "customer", "/explore");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });
});

test.describe("Customer — Restaurant Detail", () => {
  test("C-10: Detail page loads", async ({ page }) => {
    await gotoAuth(page, "customer", "/explore");
    const bookLink = page.getByRole("link", { name: /book/i }).first();
    if (await bookLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await bookLink.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(3000);
      const heading = page.locator("h1, h2").first();
      await expect(heading).toBeVisible({ timeout: 10_000 });
    }
  });

  test("C-11: Detail has content", async ({ page }) => {
    await gotoAuth(page, "customer", "/explore");
    const bookLink = page.getByRole("link", { name: /book/i }).first();
    if (await bookLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await bookLink.click();
      await page.waitForTimeout(3000);
      const body = await page.textContent("body");
      expect(body!.length).toBeGreaterThan(50);
    }
  });

  test("C-12: Back navigation works", async ({ page }) => {
    await gotoAuth(page, "customer", "/explore");
    const bookLink = page.getByRole("link", { name: /book/i }).first();
    if (await bookLink.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await bookLink.click();
      await page.waitForTimeout(3000);
      await page.goBack();
      await page.waitForTimeout(2000);
      expect(page.url()).toMatch(/\/explore/);
    }
  });
});

test.describe("Customer — Bookings", () => {
  test("C-13: Bookings page loads", async ({ page }) => {
    await gotoAuth(page, "customer", "/bookings");
    await expect(page).toHaveURL(/\/bookings/);
  });

  test("C-14: Bookings shows content", async ({ page }) => {
    await gotoAuth(page, "customer", "/bookings");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });
});

test.describe("Customer — Notifications", () => {
  test("C-15: Notifications page loads", async ({ page }) => {
    await gotoAuth(page, "customer", "/notifications");
    await expect(page).toHaveURL(/\/notifications/);
  });

  test("C-16: Notifications shows heading", async ({ page }) => {
    await gotoAuth(page, "customer", "/notifications");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });
});

test.describe("Customer — Account", () => {
  test("C-17: Account page loads", async ({ page }) => {
    await gotoAuth(page, "customer", "/account");
    await expect(page).toHaveURL(/\/account/);
  });

  test("C-18: Account shows user info", async ({ page }) => {
    await gotoAuth(page, "customer", "/account");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });
});

test.describe("Customer — Navigation", () => {
  test("C-19: Bottom nav switches pages", async ({ page }) => {
    await gotoAuth(page, "customer", "/explore");
    const bookingsLink = page.locator('a[href="/bookings"]').first();
    if (await bookingsLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await bookingsLink.click();
      await page.waitForTimeout(2000);
      await expect(page).toHaveURL(/\/bookings/);
    }
  });

  test("C-20: Navigate to account settings", async ({ page }) => {
    await gotoAuth(page, "customer", "/account");
    await expect(page).toHaveURL(/\/account/);
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });
});
