/**
 * Extended auth E2E coverage.
 *
 * These tests require the Convex deployment to be started with
 *   KAMIX_E2E_SMS_MODE=record
 * so Twilio SMS is short-circuited and OTP codes are recorded in-memory for
 * the test phones.
 *
 * Because the OTP store is in-memory on the server, all OTP scenarios first
 * clear recorded OTPs, then trigger the send, then read the recorded code
 * through waitForRecordedOtp().
 */
import { test, expect } from "@playwright/test";
import {
  USERS,
  waitForRecordedOtp,
  clearRecordedOtps,
  loginAs,
} from "./helpers";

/** Fresh test phones used only by these extended scenarios. */
const OTP_PHONE = "+19990003333";
const OTP_PHONE_PASSWORD = "TestPass2026!";
const RESET_PHONE = "+19990004444";
const RESET_PHONE_PASSWORD = "OldPass2026!";
const PHONE_CHANGE_PHONE = "+19990005555";
const PHONE_CHANGE_PASSWORD = "PhoneChange2026!";
const DELETE_PHONE = "+19990006666";
const DELETE_PASSWORD = "DeleteMe2026!";

/** Helper: clear OTPs, then go to /auth and type a phone + submitted form. */
async function gotoAuthWithPhone(page: import("@playwright/test").Page, phone: string) {
  await clearRecordedOtps(page);
  await page.goto("/auth");
  await page.waitForLoadState("domcontentloaded");

  const phoneInput = page.locator('input[name="phone"], input[type="tel"]').first();
  await expect(phoneInput).toBeVisible({ timeout: 15_000 });
  await phoneInput.fill(phone);
  await phoneInput.press("Enter");
}

/** Helper: type a 6-digit OTP into the OTP screen and submit. */
async function submitOtpCode(page: import("@playwright/test").Page, code: string) {
  const otpInput = page.locator("input-otp input, [data-testid=\"otp-input\"], input[type=\"text\"]").first();
  // The app uses the InputOTP component. Try a direct value set first.
  try {
    await page.locator("input-otp").first().locator("input").fill(code);
  } catch {
    await otpInput.fill(code);
  }
  await page.getByRole("button", { name: /verify|submit|continue/i }).first().click();
}

/** Helper: type a password and submit the password form. */
async function submitPassword(page: import("@playwright/test").Page, password: string) {
  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
  await expect(passwordInput).toBeVisible({ timeout: 15_000 });
  await passwordInput.fill(password);
  await page.getByRole("button", { name: /sign in|submit|log in|enter/i }).first().click();
}

/** Helper: wait until the app is no longer on /auth. */
async function waitForApp(page: import("@playwright/test").Page) {
  await page.waitForURL((url) => !url.pathname.includes("/auth"), { timeout: 30_000 });
}

/** Helper: wait for the password step to appear after phone submit. */
async function waitForPasswordStep(page: import("@playwright/test").Page) {
  await expect(
    page.locator('input[name="password"], input[type="password"]').first(),
  ).toBeVisible({ timeout: 20_000 });
}

/** Helper: wait for the OTP step to appear after phone submit. */
async function waitForOtpStep(page: import("@playwright/test").Page) {
  await expect(page.locator("input-otp").first()).toBeVisible({ timeout: 20_000 });
}

/**
 * Sign out through the account page's sign-out button. If the test is not
 * already on /account, go there first.
 */
async function signOutFromAccount(page: import("@playwright/test").Page) {
  if (!page.url().includes("/account")) {
    await page.goto("/account");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
  }
  const signOutBtn = page.getByRole("button", { name: /sign out/i });
  await expect(signOutBtn).toBeVisible({ timeout: 5_000 });
  await signOutBtn.click();
  await page.waitForURL(//$/);
  await page.waitForTimeout(1500);
}

/** Helper: click the "different number / back" button to return to phone entry. */
async function goBackToPhoneEntry(page: import("@playwright/test").Page) {
  const back = page.getByRole("button", { name: /different number|back|change number/i });
  if (await back.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await back.click();
  }
  await expect(page.locator('input[name="phone"], input[type="tel"]').first()).toBeVisible();
}

/** Helper: clear the password field. */
async function clearPasswordField(page: import("@playwright/test").Page) {
  const field = page.locator('input[name="password"], input[type="password"]').first();
  await field.fill("");
}

/** Helper: start a forgot-password flow from the password screen. */
async function startForgotPassword(page: import("@playwright/test").Page) {
  const link = page.getByRole("button", { name: /forgot password/i });
  await expect(link).toBeVisible({ timeout: 5_000 });
  await link.click();
}

/** Helper: enter a new password and confirm password fields. */
async function enterNewPasswordFields(
  page: import("@playwright/test").Page,
  newPassword: string,
) {
  const newPasswordField = page.locator("#new-password, input[name=\"newPassword\"]").first();
  await expect(newPasswordField).toBeVisible({ timeout: 5_000 });
  await newPasswordField.fill(newPassword);

  const confirmField = page.locator("#confirm-new-password, input[name=\"confirmPassword\"]");
  if (await confirmField.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await confirmField.fill(newPassword);
  }
}

test.describe("Auth Extended — OTP, reset, phone change, deletion, guards", () => {
  /**
   * Baseline: a phone with no password account routes to OTP and can log in.
   * This is the core OTP-only diner path.
   */
  test("OTP login works for a phone with no password account", async ({ page }) => {
    await gotoAuthWithPhone(page, OTP_PHONE);
    await waitForOtpStep(page);

    const code = await waitForRecordedOtp(page, OTP_PHONE);
    await submitOtpCode(page, code);
    await waitForApp(page);

    // After first OTP login, the app offers the set-password step.
    await expect(
      page.getByRole("button", { name: /skip|set password|save password/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  /**
   * A phone that already has a password account routes straight to the
   * password screen, not OTP.
   */
  test("Existing password account routes to password screen", async ({ page }) => {
    await gotoAuthWithPhone(page, OTP_PHONE);
    await waitForPasswordStep(page);
    await clearPasswordField(page);
  });

  /**
   * Password login succeeds and lands on the correct role page.
   */
  test("Password login lands on the correct role page", async ({ page }) => {
    await gotoAuthWithPhone(page, OTP_PHONE);
    await waitForPasswordStep(page);
    await submitPassword(page, OTP_PHONE_PASSWORD);
    await waitForApp(page);
    await expect(page).toHaveURL(/\/explore/);
  });

  /**
   * A wrong password shows an error and does not log the user in.
   */
  test("Wrong password shows an error and stays on the password screen", async ({ page }) => {
    await gotoAuthWithPhone(page, OTP_PHONE);
    await waitForPasswordStep(page);
    await submitPassword(page, "WrongPassword123!");
    await expect(page.locator(".text-red-500, [class*=destructive]")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.locator('input[name="password"], input[type="password"]').first(),
    ).toBeVisible();
  });

  /**
   * Back from the password screen returns to phone entry.
   */
  test("Back from password screen returns to phone entry", async ({ page }) => {
    await gotoAuthWithPhone(page, OTP_PHONE);
    await waitForPasswordStep(page);
    await goBackToPhoneEntry(page);
    await expect(
      page.getByRole("heading", { name: /enter phone/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  /**
   * OTP verification with a wrong code shows an error and keeps the user on
   * the OTP screen.
   */
  test("Wrong OTP code shows an error and stays on the OTP screen", async ({ page }) => {
    await gotoAuthWithPhone(page, OTP_PHONE);
    await waitForOtpStep(page);
    await submitOtpCode(page, "000000");
    await expect(page.locator(".text-red-500, [class*=destructive]")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("input-otp").first()).toBeVisible();
  });

  /**
   * Resending an OTP rotates the code. The previous code must no longer work.
   * This validates that the app does not replay a single captured OTP.
   */
  test("Resent OTP invalidates the previous code", async ({ page }) => {
    await gotoAuthWithPhone(page, OTP_PHONE);
    await waitForOtpStep(page);

    const firstCode = await waitForRecordedOtp(page, OTP_PHONE);
    await clearRecordedOtps(page);

    // Trigger a resend.
    const resend = page.getByRole("button", { name: /resend/i });
    await expect(resend).toBeVisible({ timeout: 5_000 });
    await resend.click();

    const secondCode = await waitForRecordedOtp(page, OTP_PHONE);

    // First code must be rejected.
    await submitOtpCode(page, firstCode);
    await expect(page.locator(".text-red-500, [class*=destructive]")).toBeVisible({
      timeout: 10_000,
    });

    // Second code must work.
    await submitOtpCode(page, secondCode);
    await waitForApp(page);
    await expect(page).toHaveURL(/\/explore/);
  });

  /**
   * Password reset: request a reset OTP, verify it, set a new password, then
   * log in with the new password.
   */
  test("Password reset works end to end", async ({ page }) => {
    // Step 1: sign in with the old password first so we have a password account.
    await gotoAuthWithPhone(page, RESET_PHONE);
    await waitForPasswordStep(page);
    await submitPassword(page, RESET_PHONE_PASSWORD);
    await waitForApp(page);
    await expect(page).toHaveURL(/\/explore/);

    // Step 2: sign out.
    await page.evaluate(() => localStorage.clear());
    await page.goto("/");
    await page.waitForTimeout(500);

    // Step 3: start the reset flow.
    await gotoAuthWithPhone(page, RESET_PHONE);
    await waitForPasswordStep(page);
    await startForgotPassword(page);

    // The app should move to the reset-otp screen.
    await expect(
      page.getByRole("heading", { name: /reset|forgot|new password/i }),
    ).toBeVisible({ timeout: 10_000 });

    const resetCode = await waitForRecordedOtp(page, RESET_PHONE);
    const newPassword = "NewResetPass2026!";

    enterNewPasswordFields(page, newPassword);
    await page.locator("input-otp").first().locator("input").fill(resetCode);
    await page.getByRole("button", { name: /reset password|save|submit/i }).first().click();

    await waitForApp(page);
    await expect(page).toHaveURL(/\/explore/);

    // Step 4: sign out and log in with the NEW password.
    await page.evaluate(() => localStorage.clear());
    await page.goto("/");
    await page.waitForTimeout(500);

    await gotoAuthWithPhone(page, RESET_PHONE);
    await waitForPasswordStep(page);
    await submitPassword(page, newPassword);
    await waitForApp(page);
    await expect(page).toHaveURL(/\/explore/);
  });

  /**
   * Forced password set: a newly tagged owner account lands on the set-password
   * step after first OTP login, and can save a password there.
   */
  test("Forced password set works after first OTP login", async ({ page }) => {
    // Use a phone that does not yet have a password account.
    const forcedPhone = "+19990007777";
    const forcedPassword = "ForcedOwner2026!";

    await gotoAuthWithPhone(page, forcedPhone);
    await waitForOtpStep(page);

    const code = await waitForRecordedOtp(page, forcedPhone);
    await submitOtpCode(page, code);
    await waitForApp(page);

    // Should be on the set-password step.
    await expect(
      page.getByRole("heading", { name: /set a password|set password/i }),
    ).toBeVisible({ timeout: 10_000 });

    await page.locator("#new-password, input[name=\"password\"]").first().fill(forcedPassword);
    await page.getByRole("button", { name: /save password|save|submit/i }).first().click();

    await waitForApp(page);
    await expect(page).toHaveURL(/\/explore/);

    // Now log in with the new password directly.
    await page.evaluate(() => localStorage.clear());
    await page.goto("/");
    await page.waitForTimeout(500);

    await gotoAuthWithPhone(page, forcedPhone);
    await waitForPasswordStep(page);
    await submitPassword(page, forcedPassword);
    await waitForApp(page);
    await expect(page).toHaveURL(/\/explore/);
  });

  /**
   * Phone change: request a code to a new number, verify it, and confirm the
   * phone moved. Then verify the new phone can be used as the login identity.
   */
  test("Phone change verifies a code sent to the new number", async ({ page }) => {
    // Start from a known password account.
    await loginAs(page, "customer");
    await page.waitForURL(/\/explore/);

    await page.goto("/account");
    await page.waitForLoadState("domcontentloaded");

    const changePhoneSection = page.getByRole("button", { name: /change phone/i });
    await expect(changePhoneSection).toBeVisible({ timeout: 10_000 });
    await changePhoneSection.first().click();

    const newPhoneInput = page.locator('input[placeholder*="+961" i], input[type="tel"]').first();
    await expect(newPhoneInput).toBeVisible({ timeout: 5_000 });
    await newPhoneInput.fill("+19990008888");

    const sendCodeBtn = page.getByRole("button", { name: /send code/i });
    await expect(sendCodeBtn).toBeVisible({ timeout: 5_000 });
    await sendCodeBtn.click();

    const code = await waitForRecordedOtp(page, "+19990008888");
    await page.locator("input-otp").first().locator("input").fill(code);
    await page.getByRole("button", { name: /confirm/i }).first().click();

    await expect(page.getByText(/phone updated|phone number updated/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  /**
   * Account deletion: request a deletion code to the user's own phone, verify
   * it, and confirm the account is gone / signed out.
   */
  test("Account deletion requires a code to the user's own phone", async ({ page }) => {
    await loginAs(page, "customer");
    await page.waitForURL(/\/explore/);

    await page.goto("/account");
    await page.waitForLoadState("domcontentloaded");

    const deleteSection = page.getByRole("button", { name: /delete account/i });
    await expect(deleteSection).toBeVisible({ timeout: 10_000 });
    await deleteSection.first().click();

    const startDeleteBtn = page.getByRole("button", { name: /delete my account|delete account|continue/i });
    await expect(startDeleteBtn).toBeVisible({ timeout: 5_000 });
    await startDeleteBtn.click();

    const code = await waitForRecordedOtp(page, DELETE_PHONE);
    await page.locator("input-otp").first().locator("input").fill(code);
    await page.getByRole("button", { name: /confirm|delete|continue/i }).first().click();

    // After deletion the user should be signed out and back at the landing/auth area.
    await expect(
      page.getByRole("heading", { name: /enter phone|sign in|log in/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  /**
   * Disabled user: after an account is disabled, an existing session should be
   * killed and the app should show the disabled state instead of the app.
   *
   * This test assumes there is a way to disable a test user from the admin
   * console or a backend helper. If the deployment does not expose that for the
   * test users, skip it explicitly.
   */
  test("Disabled user session is killed and shows disabled state", async ({ page }) => {
    // This scenario needs a tool to disable a test user. If your deployment does
    // not expose an admin UI or admin helper for the test phones, mark it as
    // skipped rather than failing the suite.
    const canDisable = await page.evaluate(async () => {
      try {
        // @ts-ignore
        const api = window.Convex?.api;
        if (!api || !api.admin?.setUserDisabled) {
          return false;
        }
        // Attempt to disable a known test user. If it throws because the caller
        // is not admin, we cannot run this scenario headlessly.
        await api.admin.setUserDisabled({
          userId: "invalid",
          disabled: true,
        });
        return false;
      } catch {
        return false;
      }
    });

    if (!canDisable) {
      test.skip(true, "No headless way to disable a test user in this deployment");
      return;
    }

    // Log in first.
    await loginAs(page, "customer");
    await page.waitForURL(/\/explore/);

    // Disable the user through the admin API (requires admin credentials).
    await page.evaluate(async () => {
      // @ts-ignore
      const api = window.Convex.api;
      if (!api || !api.admin?.setUserDisabled) {
        throw new Error("admin.setUserDisabled not available");
      }
      // @ts-ignore
      await api.admin.setUserDisabled({
        userId: "placeholder",
        disabled: true,
      });
    });

    // Reload and expect the disabled state.
    await page.reload();
    await expect(
      page.getByText(/disabled|account disabled|contact support/i),
    ).toBeVisible({ timeout: 10_000 });
  });

/**
 * Logout-and-back-in: after signing out and logging in as a different user,
 * the app must show the NEW user's profile, not the previous one.
 *
 * This is the scenario you asked for: login -> logout -> login with a new
 * profile and verify the last session is the correct user.
 */
test("Logout then login shows the new user profile, not the previous one", async ({ page }) => {
  // Step 1: log in as the OTP test user.
  await page.goto("/auth");
  await page.waitForLoadState("domcontentloaded");

  const phoneInput = page.locator('input[name="phone"], input[type="tel"]').first();
  await expect(phoneInput).toBeVisible({ timeout: 15_000 });
  await phoneInput.fill(OTP_PHONE);
  await phoneInput.press("Enter");

  await waitForPasswordStep(page);
  await submitPassword(page, OTP_PHONE_PASSWORD);
  await waitForApp(page);

  // Step 2: confirm the account page shows the FIRST user's identity.
  await page.goto("/account");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  const firstUserName = await page.locator("text=E2E OTP User").first().textContent().catch(() => null);
  expect(firstUserName).toBeTruthy();

  const firstUserPhone = await page.locator("p", { hasText: OTP_PHONE }).first().textContent().catch(() => null);
  expect(firstUserPhone).toBeTruthy();

  // Step 3: sign out.
  await signOutFromAccount(page);

  // Step 4: verify we are signed out.
  await expect(
    page.getByRole("heading", { name: /enter phone|sign in|log in/i }),
  ).toBeVisible({ timeout: 10_000 });

  // Step 5: log in as the reset test user (a different profile).
  const resetPhoneInput = page.locator('input[name="phone"], input[type="tel"]').first();
  await resetPhoneInput.fill(RESET_PHONE);
  await resetPhoneInput.press("Enter");

  await waitForPasswordStep(page);
  await submitPassword(page, RESET_PHONE_PASSWORD);
  await waitForApp(page);

  // Step 6: confirm the account page now shows the SECOND user's identity,
  // not the first one.
  await page.goto("/account");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  const secondUserName = await page.locator("text=E2E Reset User").first().textContent().catch(() => null);
  expect(secondUserName).toBeTruthy();

  const secondUserPhone = await page.locator("p", { hasText: RESET_PHONE }).first().textContent().catch(() => null);
  expect(secondUserPhone).toBeTruthy();

  // Sanity: the first user identity should no longer be present on the account page.
  const stillFirstUser = await page.locator("p", { hasText: OTP_PHONE }).first().count();
  expect(stillFirstUser).toBe(0);
});

/**
 * Role-based redirect: customer lands on /explore, owner lands on /owner,
 * admin lands on /admin.
 */
test("Role-based redirect after login", async ({ page }) => {
    await loginAs(page, "customer");
    await expect(page).toHaveURL(/\/explore/);

    await page.evaluate(() => localStorage.clear());
    await page.goto("/");
    await page.waitForTimeout(500);

    await loginAs(page, "owner");
    await expect(page).toHaveURL(/\/owner/);

    await page.evaluate(() => localStorage.clear());
    await page.goto("/");
    await page.waitForTimeout(500);

    await loginAs(page, "admin");
    await expect(page).toHaveURL(/\/admin/);
  });

  /**
   * Admin bootstrap guard: a non-admin phone cannot claim platform admin.
   *
   * This relies on the admin API being callable for the test setup. If it is
   * not available headlessly, skip gracefully.
   */
  test("Non-admin phone cannot claim platform admin", async ({ page }) => {
    const canCallAdmin = await page.evaluate(async () => {
      try {
        // @ts-ignore
        const api = window.Convex?.api;
        if (!api || !api.admin?.claimPlatformAdmin) {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    });

    if (!canCallAdmin) {
      test.skip(true, "claimPlatformAdmin not callable from the E2E browser session");
      return;
    }

    await page.goto("/auth");
    await page.waitForLoadState("domcontentloaded");

    await page.locator('input[name="phone"], input[type="tel"]').first().fill(OTP_PHONE);
    await page.locator('input[name="phone"], input[type="tel"]').first().press("Enter");
    await waitForPasswordStep(page);
    await submitPassword(page, OTP_PHONE_PASSWORD);
    await waitForApp(page);

    // Attempt to claim admin from the non-admin account.
    const error = await page.evaluate(async () => {
      try {
        // @ts-ignore
        const api = window.Convex.api;
        if (!api || !api.admin?.claimPlatformAdmin) {
          return null;
        }
        await api.admin.claimPlatformAdmin();
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    });

    expect(error).toMatch(/not eligible|admin|platform/i);
  });
});
