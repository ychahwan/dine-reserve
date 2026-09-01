/**
 * Shared test helpers for Kamix E2E tests.
 *
 * Strategy: Each project gets a pre-authenticated storageState from global.setup.ts.
 * gotoAuth() only triggers a fresh login when the storage state is stale/expired.
 */
import { expect, type Page } from "@playwright/test";

export const USERS = {
  admin: {
    phone: process.env.E2E_ADMIN_PHONE ?? "+96176683661",
    password: process.env.E2E_ADMIN_PASSWORD ?? "BeityAdmin2026!",
    target: "/admin",
  },
  customer: { phone: "+19990001111", password: "TestPass123!", target: "/explore" },
  owner: { phone: "+19990001001", password: "TestPass123!", target: "/owner" },
} as const;

/** Login via the password auth flow. Used as fallback when storage state is stale. */
export async function loginAs(page: Page, role: "admin" | "customer" | "owner") {
  const u = USERS[role];
  await page.goto("/auth");
  const phoneInput = page.locator('input[name="phone"], input[type="tel"]').first();
  await expect(phoneInput).toBeVisible({ timeout: 15_000 });
  await phoneInput.fill(u.phone);
  await phoneInput.press("Enter");

  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
  await expect(passwordInput).toBeVisible({ timeout: 15_000 });
  await passwordInput.fill(u.password);

  const submitBtn = page.getByRole("button", { name: /sign in|submit|log in|enter/i }).first();
  if (await submitBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await submitBtn.click();
  } else {
    await passwordInput.press("Enter");
  }

  await page.waitForURL((url) => !url.pathname.includes("/auth"), { timeout: 20_000 });

  if (page.url().includes("/set-password")) {
    const skipBtn = page.getByRole("button", { name: /skip/i });
    if (await skipBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skipBtn.click();
    }
    await page.waitForTimeout(2000);
  }
}

/**
 * Navigate to a protected page. If the storage state is valid, this is just
 * a page.goto + wait. If the session expired, it falls back to loginAs.
 */
export async function gotoAuth(page: Page, role: "admin" | "customer" | "owner", url: string) {
  await page.goto(url);
  await page.waitForLoadState("domcontentloaded");

  // Check if we got redirected to /auth (meaning storage state was invalid)
  let redirected = false;
  try {
    await page.waitForURL((u) => u.pathname.includes("/auth"), { timeout: 3_000 });
    redirected = true;
  } catch {
    // Not redirected — storage state is valid
  }

  if (redirected) {
    await loginAs(page, role);
    await page.goto(url);
    await page.waitForLoadState("domcontentloaded");
  }

  // Wait for Convex data to settle
  await page.waitForTimeout(2000);
}

/** Wait for Convex data to settle on the page. */
export async function waitForData(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
}

/**
 * KAMIX_E2E_SMS_MODE=record short-circuits Twilio and records OTP codes in
 * Convex server memory. This helper polls that shared store until a code
 * appears for the given phone, then returns it.
 *
 * It uses the internal Convex query `internal.sms.lastOtpForTest` through the
 * page's Convex client so polling happens server-side and the test never types
 * partial codes.
 */
export async function waitForRecordedOtp(
  page: Page,
  phone: string,
  timeoutMs = 30_000,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const code = await page.evaluate(async () => {
      if (typeof window === "undefined" || !window.Convex) {
        return null;
      }
      // @ts-ignore - Convex is attached to window in the app build.
      const api = window.Convex.api;
      if (!api || !api.sms || !api.sms.lastOtpForTest) {
        return null;
      }
      try {
        // @ts-ignore - internal query only callable in the E2E environment
        // where the deployment explicitly exposes it for tests.
        return await api.sms.lastOtpForTest({ phone });
      } catch {
        return null;
      }
    });
    if (typeof code === "string" && code.length === 6) {
      return code;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(
    `Timed out waiting for a recorded OTP for ${phone}. ` +
      `Set KAMIX_E2E_SMS_MODE=record on the Convex deployment and restart it.`,
  );
}

/**
 * Clear the in-memory recorded OTPs between scenarios so a stale code from a
 * previous test can never be reused.
 */
export async function clearRecordedOtps(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if (typeof window === "undefined" || !window.Convex) {
      return;
    }
    // @ts-ignore
    const api = window.Convex.api;
    if (!api || !api.sms || !api.sms.clearRecordedOtps) {
      return;
    }
    try {
      // @ts-ignore
      await api.sms.clearRecordedOtps();
    } catch {
      // If the helper is not deployed yet, fall back to reloading the page.
    }
  });
}
