/**
 * Focused live check: `npm run web:admin` boots the app, then log in with
 * the EXISTING admin account (+96176683661) via OTP and confirm the /admin
 * console renders.
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const BASE = "http://localhost:5173";
const DEPLOY = "https://canny-leopard-341.convex.cloud";
const ADMIN_PHONE = "+96176683661";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "BeityAdmin2026!";

let passed = 0;
let failed = 0;
function ok(label) { passed++; console.log(`  ✅ ${label}`); }
function fail(label, err) { failed++; console.error(`  ❌ ${label}: ${err}`); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
    } catch { /* skip */ }
  }
  return latest?.code ?? null;
}

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

  console.log("\n── Live: existing admin login (+96176683661) ──");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
  await sleep(800);

  await page.locator('input[name="phone"]').fill(ADMIN_PHONE);
  await page.locator('input[name="phone"]').press("Enter");
  ok("Submitted existing admin phone");

  // Existing user WITH password → password screen, NEVER OTP
  const gotPassword = await waitForText(page, "Password login", 15000);
  gotPassword
    ? ok("Password screen shown (no OTP for existing user)")
    : fail("Password screen", "never appeared — got routed to OTP?");

  await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  ok("Submitted admin password");
  await sleep(3000);
  await page.screenshot({ path: "/tmp/ss-admin-live.png" });
  const url = page.url();
  url.includes("/admin") ? ok(`Redirected to /admin (${url})`) : fail("Admin redirect", `got ${url}`);

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
      found ? ok(`Admin route ${r.path} renders`) : fail(`Admin route ${r.path}`, `missing "${r.needle}"`);
  }

  await ctx.close();
  await browser.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
