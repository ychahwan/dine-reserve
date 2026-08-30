import { test, expect } from "@playwright/test";

/** Helper: login with phone + password, wait for password field then fill. */
async function loginAs(page: import("@playwright/test").Page, phone: string, password: string) {
  await page.goto("/auth");
  await page.fill('input[name="phone"]', phone);
  await page.click('button[type="submit"]');
  // Wait for the password input to appear (phone lookup may take a moment)
  await page.waitForSelector('input[name="password"]', { timeout: 10_000 });
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}

/** Helper: clear auth state. */
async function signOut(page: import("@playwright/test").Page) {
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await page.waitForTimeout(500);
}

test.describe("Account switching", () => {
  test("login as customer, sign out, login as owner → lands on /owner", async ({
    page,
  }) => {
    // Step 1: Login as customer
    await loginAs(page, "+96171111111", "KamixTest2026!");
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/explore/);
    console.log("✅ Customer landed on /explore");

    // Step 2: Sign out
    await signOut(page);
    console.log("✅ Signed out");

    // Step 3: Login as owner
    await loginAs(page, "+96176666666", "KamixTest2026!");
    await page.waitForTimeout(2000);

    // Should land on /owner (NOT /explore)
    const url = page.url();
    expect(url).toContain("/owner");
    expect(url).not.toContain("/explore");
    console.log(`✅ Owner landed on /owner (URL: ${url})`);
  });

  test("login as owner, sign out, login as customer → lands on /explore", async ({
    page,
  }) => {
    // Step 1: Login as owner
    await loginAs(page, "+96176666666", "KamixTest2026!");
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/owner/);
    console.log("✅ Owner landed on /owner");

    // Step 2: Sign out
    await signOut(page);
    console.log("✅ Signed out");

    // Step 3: Login as customer
    await loginAs(page, "+96171111111", "KamixTest2026!");
    await page.waitForTimeout(2000);

    // Should land on /explore (NOT /owner)
    const url = page.url();
    expect(url).toContain("/explore");
    expect(url).not.toContain("/owner");
    console.log(`✅ Customer landed on /explore (URL: ${url})`);
  });
});
