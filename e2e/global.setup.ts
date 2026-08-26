/**
 * Global setup: logs in as admin, creates test users via Convex HTTP API,
 * and saves their storage states for each project.
 */
import { test as setup, expect } from "@playwright/test";

const CONVEX_URL = "https://canny-leopard-341.convex.cloud";
const ADMIN_PHONE = "+96176683661";
const ADMIN_PASSWORD = "BeityAdmin2026!";
const CUSTOMER_PHONE = "+19990001111";
const CUSTOMER_PASSWORD = "TestPass123!";
const OWNER_PHONE = "+19990001001";
const OWNER_PASSWORD = "TestPass123!";

/** Login and save storage state. */
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

/** Extract the Convex auth token from localStorage. */
async function extractToken(page: import("@playwright/test").Page): Promise<string | null> {
  return page.evaluate(() => {
    // Log all localStorage keys for debugging
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      keys.push(key);
      const val = localStorage.getItem(key);
      // Look for JWT tokens
      if (val && val.includes("eyJ")) {
        try {
          const parsed = JSON.parse(val);
          // @convex-dev/auth typically stores state with accessToken
          if (parsed?.state?.accessToken) return parsed.state.accessToken;
          if (parsed?.accessToken) return parsed.accessToken;
          // Some versions use nested structure
          if (typeof parsed === "string" && parsed.startsWith("eyJ")) return parsed;
        } catch {
          // Raw JWT string
          if (val.startsWith("eyJ")) return val;
        }
      }
    }
    // Debug: log what keys we found
    console.log("localStorage keys:", keys.join(", "));
    return null;
  });
}

/** Call a Convex mutation via HTTP. */
async function convexMutation(path: string, args: Record<string, unknown>, token: string) {
  const resp = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Convex mutation failed (${resp.status}): ${text}`);
  }
  return resp.json();
}

setup("seed test users and save auth states", async ({ browser }) => {
  // ── 1. Login as admin ──
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await loginAndSave(adminPage, ADMIN_PHONE, ADMIN_PASSWORD, "e2e/.auth/admin.json");
  console.log("✅ Admin logged in");

  // ── 2. Extract token and seed users ──
  const adminToken = await extractToken(adminPage);
  if (adminToken) {
    console.log("🔑 Got admin token, seeding users via API");
    const users = [
      { phone: CUSTOMER_PHONE, name: "E2E Customer", password: CUSTOMER_PASSWORD, role: "customer" as const },
      { phone: OWNER_PHONE, name: "E2E Owner", password: OWNER_PASSWORD, role: "owner" as const },
    ];
    for (const u of users) {
      try {
        const result = await convexMutation("testHelpers:seedTestUser", u, adminToken);
        console.log(`✅ ${u.name}: ${JSON.stringify(result)}`);
      } catch (e: any) {
        console.log(`⚠️  ${u.name}: ${e?.message}`);
      }
    }
  } else {
    console.log("❌ Could not extract admin token — aborting");
    throw new Error("Admin token extraction failed.");
  }

  await adminCtx.close();

  // ── 3. Login as customer and save state ──
  const customerCtx = await browser.newContext();
  const customerPage = await customerCtx.newPage();
  await loginAndSave(customerPage, CUSTOMER_PHONE, CUSTOMER_PASSWORD, "e2e/.auth/customer.json");
  console.log("✅ Customer logged in");
  await customerCtx.close();

  // ── 4. Login as owner and save state ──
  const ownerCtx = await browser.newContext();
  const ownerPage = await ownerCtx.newPage();
  await loginAndSave(ownerPage, OWNER_PHONE, OWNER_PASSWORD, "e2e/.auth/owner.json");
  console.log("✅ Owner logged in");
  await ownerCtx.close();
});
