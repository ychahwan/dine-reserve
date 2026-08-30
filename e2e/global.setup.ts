/**
 * Global setup: logs in as admin, creates test users via admin panel UI,
 * and saves their storage states for each project.
 */
import { test as setup, expect } from "@playwright/test";

const ADMIN_PHONE = "+96176683661";
const ADMIN_PASSWORD = "BeityAdmin2026!";
const CUSTOMER1_PHONE = "+19990001111";
const CUSTOMER1_PASSWORD = "TestPass123!";
const CUSTOMER2_PHONE = "+19990002222";
const CUSTOMER2_PASSWORD = "TestPass123!";
const OWNER_PHONE = "+19990001001";
const OWNER_PASSWORD = "TestPass123!";

/** Login via the password auth flow and save storage state. */
async function loginAndSave(
  page: import("@playwright/test").Page,
  phone: string,
  password: string,
  storagePath: string,
) {
  await page.goto("/auth");
  await page.waitForLoadState("domcontentloaded");

  const phoneInput = page.locator('input[name="phone"], input[type="tel"]').first();
  await expect(phoneInput).toBeVisible({ timeout: 15_000 });
  await phoneInput.fill(phone);
  await phoneInput.press("Enter");

  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
  await expect(passwordInput).toBeVisible({ timeout: 15_000 });
  await passwordInput.fill(password);

  const submitBtn = page.getByRole("button", { name: /sign in|submit|log in|enter/i }).first();
  await expect(submitBtn).toBeEnabled({ timeout: 10_000 });
  await submitBtn.click();

  await page.waitForURL((url) => !url.pathname.includes("/auth"), { timeout: 30_000 });

  if (page.url().includes("/set-password")) {
    const skipBtn = page.getByRole("button", { name: /skip/i });
    if (await skipBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await skipBtn.click();
      await page.waitForTimeout(2000);
    }
  }

  await page.waitForTimeout(2000);
  await page.context().storageState({ path: storagePath });
}

/** Create a user via admin UI. Opens a fresh dialog each time. */
async function createUserViaUI(
  page: import("@playwright/test").Page,
  phone: string,
  name: string,
  password: string,
  role: "" | "Restaurant Owner" = "",
): Promise<void> {
  await page.goto("/admin/users");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  const body = await page.textContent("body");
  if (body && body.includes(phone)) {
    console.log(`ℹ️  ${name} already exists`);
    return;
  }

  await page.getByRole("button", { name: /add user/i }).first().click();
  await page.waitForTimeout(500);
  await page.locator("#add-phone").fill(phone);
  await page.locator("#add-name").fill(name);
  await page.locator("#add-password").fill(password);

  if (role) {
    const trigger = page.locator('[role="dialog"] button[role="combobox"]').last();
    if (await trigger.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await trigger.click();
      await page.waitForTimeout(300);
      await page.getByRole("option", { name: new RegExp(role, "i") }).click();
    }
  }

  await page.getByRole("button", { name: /create user/i }).click();
  await page.waitForTimeout(3000);
  console.log(`✅ ${name} created via UI`);
}

setup("seed test users and save auth states", async ({ browser }) => {
  // ── 1. Login as admin ──
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await loginAndSave(adminPage, ADMIN_PHONE, ADMIN_PASSWORD, "e2e/.auth/admin.json");
  console.log("✅ Admin logged in");

  // ── 2. Create test users via admin UI ──
  await createUserViaUI(adminPage, CUSTOMER1_PHONE, "E2E Customer", CUSTOMER1_PASSWORD);
  await createUserViaUI(adminPage, CUSTOMER2_PHONE, "Test Customer 2", CUSTOMER2_PASSWORD);
  await createUserViaUI(adminPage, OWNER_PHONE, "E2E Owner", OWNER_PASSWORD, "Restaurant Owner");

  await adminCtx.close();

  // ── 3. Login as customer 1 ──
  const c1Ctx = await browser.newContext();
  const c1Page = await c1Ctx.newPage();
  await loginAndSave(c1Page, CUSTOMER1_PHONE, CUSTOMER1_PASSWORD, "e2e/.auth/customer.json");
  console.log("✅ Customer 1 logged in");
  await c1Ctx.close();

  // ── 4. Login as customer 2 ──
  const c2Ctx = await browser.newContext();
  const c2Page = await c2Ctx.newPage();
  await loginAndSave(c2Page, CUSTOMER2_PHONE, CUSTOMER2_PASSWORD, "e2e/.auth/customer2.json");
  console.log("✅ Customer 2 logged in");
  await c2Ctx.close();

  // ── 5. Login as owner ──
  const ownerCtx = await browser.newContext();
  const ownerPage = await ownerCtx.newPage();
  await loginAndSave(ownerPage, OWNER_PHONE, OWNER_PASSWORD, "e2e/.auth/owner.json");
  console.log("✅ Owner logged in");
  await ownerCtx.close();
});
