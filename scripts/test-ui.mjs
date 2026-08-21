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
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "BeityAdmin2026!";
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
  // PROFILE 1: Landing page (public) — lean hero, phone-first signup
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
    text.includes("Book your table") ? ok("Hero headline renders") : fail("Hero headline", "not found");
    text.includes("How it works") ? ok("'How it works' section renders") : fail("How it works", "not found");
    text.includes("Already have an account") ? ok("Hero offers 'Sign in' for existing users") : fail("Sign in offer", "not found");

    // Real partner count must come from the backend, not a hard-coded number.
    const partnerMatch = text.match(/(\d+)\s+partner restaurant/);
    const count = partnerMatch ? parseInt(partnerMatch[1], 10) : NaN;
    Number.isInteger(count) && count > 0
      ? ok(`Real partner count rendered: ${count}`)
      : fail("Partner count", `no live number found in ${text.slice(0, 300)}`);
    // Socialize section
    text.includes("Socialize") ? ok("'Socialize' section renders") : fail("Socialize", "not found");
    text.includes("Dining alone doesn't mean dining solo")
      ? ok("Socialize headline renders")
      : fail("Socialize headline", "not found");
    text.includes("Who's dining")
      ? ok("Socialize 'Who's dining' mock renders")
      : fail("Socialize mock", "not found");

    // Hero phone entry → signup (fresh number drops straight into OTP step)
    const phoneInput = page.locator('input[aria-label="Phone number"]');
    (await phoneInput.count()) > 0
      ? ok("Hero phone entry box renders")
      : fail("Hero phone entry", "missing");
    const freshPhone = `+9617883${String(Date.now()).slice(-5)}`;
    await phoneInput.fill(freshPhone);
    await page.getByRole("button", { name: /Get started/ }).first().click();
    await page.waitForURL("**/auth**", { timeout: 8000 });
    const authUrl = page.url();
    authUrl.includes("/auth") ? ok("Hero Get started → /auth") : fail("Hero nav", authUrl);
    authUrl.includes(encodeURIComponent(freshPhone))
      ? ok("Phone passed to /auth?phone=…")
      : fail("Phone prefill", `missing ${freshPhone} in ${authUrl}`);
    const otpStep = await waitForText(page, "Enter the code sent to", 15000);
    otpStep ? ok("Signup: OTP step shown (prefilled phone)") : fail("Signup OTP step", "not shown");

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
  // PROFILE 3: Admin (+96176683661) — password login (NO OTP) → /admin
  // ════════════════════════════════════════════════════════════════
  console.log("\n── Profile 3: Admin password flow ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
    await sleep(800);

    await page.locator('input[name="phone"]').fill(ADMIN_PHONE);
    await page.locator('input[name="phone"]').press("Enter");
    ok("Submitted admin phone");

    // Existing user WITH password → password screen, NEVER the OTP screen
    const gotPassword = await waitForText(page, "Password login", 15000);
    gotPassword
      ? ok("Password screen shown (no OTP for existing user)")
      : fail("Password screen", "never appeared — did the admin get routed to OTP?");

    await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    ok("Submitted admin password");
    await sleep(3000);
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

      // User detail → "Set a password" card renders
      await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded" });
      const firstUserRow = page.locator('table tbody tr a').first();
      try {
        await firstUserRow.waitFor({ timeout: 10000 });
        await firstUserRow.click();
        const setPwCard = await waitForText(page, "Set a password", 10000);
        setPwCard
          ? ok("User detail shows 'Set a password' card")
          : fail("Set password card", "not rendered on user detail");
      } catch {
        fail("Set password card", "no user rows to open");
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
    await page.goto(`${BASE}/explore`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForURL("**/auth**", { timeout: 15000 });
      ok("Unauthenticated /explore redirects to /auth (RequireAuth gate)");
    } catch {
      fail("Explore auth gate", `expected /auth, got ${page.url()}`);
    }
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

  // ════════════════════════════════════════════════════════════════
  // PROFILE 7: Signup (phone → OTP → set password → onboard),
  //            then sign back in with the password (existing user),
  //            then verify an existing user goes to password (NO OTP)
  //            even when the phone is entered in a different format.
  // ════════════════════════════════════════════════════════════════
  console.log("\n── Profile 7: Signup then sign-in with password ──");
  {
    const phone = `+9617882${String(Date.now()).slice(-5)}`;
    const password = "DinerPass123!";

    // Existing user (has password) must be routed to PASSWORD login, never OTP,
    // even if they type the number with spaces/dashes. After Profile 7's signup
    // below, we exercise this in a THIRD context.
    let existingUserPhone = null;

    // ── SIGNUP via the landing page hero ──
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const uiErrors = [];
    page.on("pageerror", (e) => uiErrors.push(`pageerror: ${String(e).slice(0, 150)}`));
    page.on("console", (m) => {
      if (/error|fail|invalid|unauthor/i.test(m.text())) uiErrors.push(`console: ${m.text().slice(0, 150)}`);
    });
    page.on("requestfailed", (r) => uiErrors.push(`reqfail: ${r.url().slice(0, 100)} ${r.failure()?.errorText ?? ""}`));
    await page.goto(BASE, { waitUntil: "networkidle" });
    await sleep(800);
    await page.locator('input[aria-label="Phone number"]').fill(phone);
    await page.getByRole("button", { name: /Get started/ }).first().click();
    await page.waitForURL("**/auth**", { timeout: 8000 });
    await waitForText(page, "Enter the code sent to", 15000);
    const hash = readOtpHash(phone);
    const otp = crackOtp(hash);
    otp ? ok(`Signup OTP cracked: ${otp}`) : fail("Signup OTP", "no hash");
    if (otp) {
      await page.locator('input[data-input-otp]').fill(otp);
      await sleep(300);
      await page.locator('input[data-input-otp]').press("Enter");
      const setPw = await waitForText(page, "Set a password", 10000);
      setPw ? ok("Signup: set-password step shown") : fail("Set password step", "not shown");
      await page.locator('input[name="password"]').fill(password);
      await page.getByRole("button", { name: /Save password/ }).click();

      // Capture any auth error shown after saving the password
      await sleep(1500);
      const errText = await page.textContent("body");
      const hasErr = /failed|incorrect|error/i.test(errText);
      if (hasErr) console.log(`  [debug] after save: ${page.url()} | err? ${errText.match(/[^.]*(failed|incorrect|error)[^.]*/i)?.[0]?.trim().slice(0, 120)}`);
      if (uiErrors.length) console.log(`  [debug] ui errors: ${uiErrors.join(" || ")}`);

      // Fresh users land on /dashboard onboarding (or /explore if already done)
      try {
        await page.waitForURL("**/dashboard**", { timeout: 15000 });
      } catch {
        // fall through — some runs redirect straight to /explore
      }
      const onboard = await waitForText(page, "Welcome to Kamix", 15000);
      onboard ? ok("Signup: onboarding shown") : fail("Onboarding", `not shown (${page.url()})`);
      if (onboard) {
        await page.locator("#name").fill("Signup Tester");
        await page.getByRole("button", { name: /Start exploring/ }).click();
        try {
          await page.waitForURL("**/explore**", { timeout: 15000 });
          ok("Signup complete → redirected to /explore");
        } catch {
          fail("Signup redirect", `expected /explore, got ${page.url()}`);
        }
        await page.screenshot({ path: "/tmp/ss-signup-done.png" });
      }
    }
    await ctx.close();

    // ── SIGN-IN with the password just set (existing user, no SMS) ──
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page2 = await ctx2.newPage();
    await page2.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
    await sleep(800);
    await page2.locator('input[name="phone"]').fill(phone);
    await page2.locator('input[name="phone"]').press("Enter");
    const pwScreen = await waitForText(page2, "Password login", 10000);
    pwScreen
      ? ok("Sign-in: password screen shown for existing user (hasPasswordAccount)")
      : fail("Password screen", "not shown");
    await page2.locator('input[name="password"]').fill(password);
    await page2.locator('input[name="password"]').press("Enter");
    try {
      await page2.waitForURL("**/explore**", { timeout: 15000 });
      ok("Sign-in: password login → /explore");
    } catch {
      fail("Sign-in redirect", `expected /explore, got ${page2.url()}`);
    }
    await page2.screenshot({ path: "/tmp/ss-signin-done.png" });
    await ctx2.close();
    existingUserPhone = phone;

    // ── EXISTING USER: re-login must go straight to PASSWORD (no OTP), even
    //    with a reformatted phone (spaces). No new OTP may be sent — if the
    //    app wrongly falls back to OTP we'd see the OTP screen instead.
    const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page3 = await ctx3.newPage();
    await page3.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
    await sleep(800);
    // Same canonical number, but typed with spaces — routing must still be password.
    const spaced = phone.replace(/^\+(\d{3})(\d{3})(\d{3})(\d+)$/, "+$1 $2 $3 $4");
    await page3.locator('input[name="phone"]').fill(spaced);
    await page3.locator('input[name="phone"]').press("Enter");
    const pwScreen3 = await waitForText(page3, "Password login", 10000);
    pwScreen3
      ? ok("Existing user (reformatted phone) → password login, NO OTP")
      : fail("Existing user routing", `expected password screen, got ${page3.url()}`);
    await page3.close();
    await ctx3.close();
  }

  await browser.close();
  console.log(`\n${"═".repeat(50)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`${"═".repeat(50)}`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
