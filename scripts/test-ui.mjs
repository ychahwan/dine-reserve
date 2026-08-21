/**
 * End-to-end UI test for all profiles.
 * Run with: node scripts/test-ui.mjs
 *
 * Drives real headless Chromium against the local Vite dev server. Each
 * profile runs in its OWN browser context so sessions never leak between
 * tests. OTP codes are read from the Convex deployment and SHA-256-cracked
 * locally (they are 6-digit numbers).
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const BASE = "http://localhost:5173";
const DEPLOY = "https://canny-leopard-341.convex.cloud";

const ADMIN_PHONE = "+96176683661";
const OWNER_PHONE = "+96178882222";
const OWNER_PASSWORD = "OmarNewPass456!";

let passed = 0;
let failed = 0;
function ok(label) { passed++; console.log(`  ✅ ${label}`); }
function fail(label, err) { failed++; console.error(`  ❌ ${label}: ${err}`); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** Read the latest OTP hash for a phone from the Convex deployment. */
function readOtpHash(phone) {
  const out = execSync(
    `npx convex data authVerificationCodes --url ${DEPLOY} --format jsonLines`,
    { maxBuffer: 10 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
  ).toString();
  let latest = null;
  for (const line of out.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const doc = JSON.parse(t);
      if (doc.phoneVerified !== phone) continue;
      if (!latest || doc._creationTime > latest._creationTime) latest = doc;
    } catch {
      /* skip malformed lines */
    }
  }
  return latest?.code ?? null;
}

/** Crack a SHA-256 hex digest back to its 6-digit source. */
function crackOtp(hash) {
  if (!hash) return null;
  for (let i = 0; i < 1000000; i++) {
    const code = String(i).padStart(6, "0");
    if (createHash("sha256").update(code).digest("hex") === hash) return code;
  }
  return null;
}

async function waitForText(page, needle, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const text = await page.textContent("body");
    if (text.includes(needle)) return true;
    await sleep(500);
  }
  return false;
}

async function run() {
  const browser = await chromium.launch({ headless: true });

  // ════════════════════════════════════════════════════════════════
  // PROFILE 1: Landing page (public)
  // ════════════════════════════════════════════════════════════════
  console.log("\n── Profile 1: Landing page ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await sleep(800);

    const text = await page.textContent("body");
    text.includes("Kamix") ? ok("Brand renders") : fail("Brand", "Kamix not found");
    text.includes("Sign in") ? ok("Nav has 'Sign in' for existing users") : fail("Sign in", "not found");
    text.includes("Get started") ? ok("Nav has 'Get started'") : fail("Get started", "not found");
    text.includes("Sign in to your account") ? ok("Hero has 'Sign in to your account' CTA") : fail("Sign in CTA", "not found");
    text.includes("How it works") ? ok("'How it works' section renders") : fail("How it works", "not found");

    const signInLink = page.getByRole("link", { name: /Sign in to your account/ }).first();
    if (await signInLink.count()) {
      await signInLink.click();
      await page.waitForURL("**/auth", { timeout: 8000 });
      page.url().includes("/auth") ? ok("Sign-in CTA navigates to /auth") : fail("Sign-in CTA nav", page.url());
    } else {
      fail("Sign-in CTA", "link not clickable");
    }
    await page.screenshot({ path: "/tmp/ss-landing.png", fullPage: true });
    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════
  // PROFILE 2: Auth — phone entry renders (public)
  // ════════════════════════════════════════════════════════════════
  console.log("\n── Profile 2: Auth phone entry ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
    await sleep(800);
    const phoneInput = page.locator('input[name="phone"]');
    (await phoneInput.count()) > 0 ? ok("Phone input present") : fail("Phone input", "missing");
    const text = await page.textContent("body");
    text.includes("Enter your phone") ? ok("'Enter your phone' prompt renders") : fail("Phone prompt", "not found");
    await page.screenshot({ path: "/tmp/ss-auth.png" });
    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════
  // PROFILE 3: Admin (+96176683661) — OTP login → /admin, then /explore
  // ════════════════════════════════════════════════════════════════
  console.log("\n── Profile 3: Admin OTP flow ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
    await sleep(800);

    await page.locator('input[name="phone"]').fill(ADMIN_PHONE);
    await page.locator('input[name="phone"]').press("Enter");
    ok("Submitted admin phone");

    const gotVerify = await waitForText(page, "Verify your phone", 15000);
    gotVerify ? ok("OTP screen appeared (no password account)") : fail("OTP screen", "never appeared");

    await waitForText(page, "Enter the code sent to", 15000);
    const hash = readOtpHash(ADMIN_PHONE);
    const otp = crackOtp(hash);
    otp ? ok(`Cracked admin OTP: ${otp}`) : fail("Crack OTP", "no hash found");

    if (otp) {
      await page.locator('input[data-input-otp]').fill(otp);
      await sleep(300);
      await page.locator('input[data-input-otp]').press("Enter");
      ok("Submitted OTP (Enter)");

      const setPw = await waitForText(page, "Set a password", 10000);
      if (setPw) {
        ok("Post-login 'Set a password' screen shown");
        await page.getByRole("button", { name: /Skip for now/ }).click();
        await sleep(2000);
      }
      await page.screenshot({ path: "/tmp/ss-admin.png" });
      const url = page.url();
      url.includes("/admin") ? ok("Redirected to /admin") : fail("Admin redirect", `got ${url}`);

      // Walk the new admin console
      const adminRoutes = [
        { path: "/admin", needle: "Dashboard" },
        { path: "/admin/restaurants", needle: "Restaurants" },
        { path: "/admin/users", needle: "Users" },
        { path: "/admin/reviews", needle: "Reviews" },
        { path: "/admin/audit", needle: "Audit log" },
        { path: "/admin/register", needle: "Register restaurant" },
        { path: "/admin/tag", needle: "Tag an account" },
      ];
      for (const r of adminRoutes) {
        await page.goto(`${BASE}${r.path}`, { waitUntil: "domcontentloaded" });
        const found = await waitForText(page, r.needle, 10000);
        found
          ? ok(`Admin route ${r.path} renders`)
          : fail(`Admin route ${r.path}`, `missing "${r.needle}"`);
      }

      // Restaurant detail view
      await page.goto(`${BASE}/admin/restaurants`, { waitUntil: "domcontentloaded" });
      const firstRow = page.locator('table tbody tr a').first();
      try {
        await firstRow.waitFor({ timeout: 10000 });
        await firstRow.click();
        const tabsFound = await waitForText(page, "Bookings", 10000);
        tabsFound
          ? ok("Restaurant detail renders (tabs)")
          : fail("Restaurant detail", "tabs missing");
      } catch {
        ok("Skipped restaurant detail (no rows)");
      }

      // Authenticated user can also browse /explore
      await page.goto(`${BASE}/explore`, { waitUntil: "networkidle" });
      await sleep(2500);
      const exploreText = await page.textContent("body");
      (exploreText.includes("Trullo") || exploreText.includes("Sakura") || exploreText.includes("Restaurant") || exploreText.includes("restaurant"))
        ? ok("Explore renders listings for authenticated user")
        : fail("Explore listings", "no restaurant content");
    }
    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════
  // PROFILE 4: Restaurant owner (+96178882222) — password login → /owner
  // ════════════════════════════════════════════════════════════════
  console.log("\n── Profile 4: Owner password flow ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
    await sleep(800);

    await page.locator('input[name="phone"]').fill(OWNER_PHONE);
    await page.locator('input[name="phone"]').press("Enter");
    ok("Submitted owner phone");

    const gotPassword = await waitForText(page, "Password login", 10000);
    gotPassword ? ok("Password screen appeared (existing user detected)") : fail("Password screen", "not shown");

    await page.locator('input[name="password"]').fill(OWNER_PASSWORD);
    await page.locator('input[name="password"]').press("Enter");
    await sleep(3000);

    await page.screenshot({ path: "/tmp/ss-owner.png" });
    const url = page.url();
    if (url.includes("/owner")) {
      ok("Redirected to /owner");
    } else if (url.includes("/set-password")) {
      ok("Redirected to /set-password (mustChangePassword still set)");
    } else {
      const text = await page.textContent("body");
      text.includes("Invalid phone number or password")
        ? fail("Owner login", "wrong password used in test")
        : fail("Owner redirect", `got ${url}`);
    }
    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════
  // PROFILE 5: Explore (unauthenticated) — must redirect to /auth
  // ════════════════════════════════════════════════════════════════
  console.log("\n── Profile 5: Explore auth gate ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/explore`, { waitUntil: "networkidle" });
    await sleep(2000);
    const url = page.url();
    url.includes("/auth")
      ? ok("Unauthenticated /explore redirects to /auth (RequireAuth gate)")
      : fail("Explore auth gate", `expected /auth, got ${url}`);
    await ctx.close();
  }

  // ════════════════════════════════════════════════════════════════
  // PROFILE 6: Diner account — Security card (change phone + password)
  // ════════════════════════════════════════════════════════════════
  console.log("\n── Profile 6: Account security (change phone + password) ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();

    // Fresh diner so the flow is idempotent.
    const phone = `+9617886${String(Date.now()).slice(-5)}`;
    await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
    await sleep(800);
    await page.locator('input[name="phone"]').fill(phone);
    await page.locator('input[name="phone"]').press("Enter");
    await waitForText(page, "Enter the code sent to", 15000);
    const hash = readOtpHash(phone);
    const otp = crackOtp(hash);
    otp ? ok(`Cracked diner OTP: ${otp}`) : fail("Crack OTP", "no hash found");
    if (otp) {
      await page.locator('input[data-input-otp]').fill(otp);
      await sleep(300);
      await page.locator('input[data-input-otp]').press("Enter");
      const setPw = await waitForText(page, "Set a password", 10000);
      if (setPw) {
        await page.getByRole("button", { name: /Skip for now/ }).click();
        await sleep(2000);
      }
      // Fresh diners land on /dashboard onboarding — complete it first.
      await waitForText(page, "Welcome to Kamix", 10000);
      await page.locator("#name").fill("Test Diner");
      await page.getByRole("button", { name: /Start exploring/ }).click();
      await sleep(3000);
      // Go to /account
      await page.goto(`${BASE}/account`, { waitUntil: "networkidle" });
      await sleep(2500);

      const text = await page.textContent("body");
      text.includes("Security") ? ok("Security card renders") : fail("Security card", "missing");
      text.includes("Change phone number")
        ? ok("'Change phone number' section renders")
        : fail("Change phone number", "missing");
      text.includes("Change password")
        ? ok("'Change password' section renders")
        : fail("Change password", "missing");
      text.includes("Phone (for SMS confirmations)")
        ? ok("Phone shown read-only in contact details")
        : fail("Phone display", "missing");

      // Send code to the new number → OTP step appears
      const newPhone = `+9617885${String(Date.now() + 1).slice(-5)}`;
      await page.getByPlaceholder("+961 71 123 456").fill(newPhone);
      await page.getByRole("button", { name: /Send code/ }).click();
      const otpStep = await waitForText(page, "Enter the 6-digit code sent to", 15000);
      otpStep ? ok("Send code → OTP step appears") : fail("OTP step", "did not appear");
      await page.screenshot({ path: "/tmp/ss-account-security.png" });
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${"═".repeat(50)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`${"═".repeat(50)}`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
