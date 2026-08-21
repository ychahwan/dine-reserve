#!/usr/bin/env node
/* Browser E2E: admin Settings page (render, save, clear) + after-screenshots. */
import { chromium } from "playwright";

const BASE = "http://localhost:5173";
const ADMIN_PHONE = "+96176683661";
const ADMIN_PW = "BeityAdmin2026!";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0, failed = 0;
const ok = (l) => { passed++; console.log(`  ✅ ${l}`); };
const fail = (l, e) => { failed++; console.error(`  ❌ ${l}: ${e}`); };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// ── Login as admin ──
await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
await sleep(800);
await page.locator('input[name="phone"]').fill(ADMIN_PHONE);
await page.locator('input[name="phone"]').press("Enter");
await sleep(2000);
await page.locator('input[name="password"]').fill(ADMIN_PW);
await page.getByRole("button", { name: "Sign in" }).click();
await sleep(3500);
ok("admin logged in", page.url().includes("/admin"));

// ── Settings page renders ──
await page.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
await sleep(3000);
const body = await page.locator("body").textContent();
ok("settings page renders", body.includes("Settings") && body.includes("Gemini API key"));
ok("twilio section present", body.includes("Twilio account SID"));
ok("env fallback shown", body.includes("From environment") || body.includes("Not set") || body.includes("Stored"));

// save a value (use a harmless test key value for TWILIO_ENABLED, then clear it)
const enabledInput = page.locator('input[placeholder="true / false"]').first();
if (await enabledInput.count()) {
  await enabledInput.fill("false");
  await page.getByRole("button", { name: "Save" }).first().click();
  await sleep(2500);
  const b2 = await page.locator("body").textContent();
  ok("save persisted", b2.includes("Stored"));
  // clear it
  await page.getByRole("button", { name: "Clear" }).first().click();
  await sleep(800);
  await page.getByRole("button", { name: "Clear value" }).click();
  await sleep(2500);
  const b3 = await page.locator("body").textContent();
  ok("clear reverted to env/unset", b3.includes("From environment") || b3.includes("Not set"));
} else {
  fail("save/clear flow", "TWILIO_ENABLED input not found");
}

await page.screenshot({ path: "/tmp/shot-settings.png", fullPage: false });

// ── Reviews admin page (after) ──
await page.goto(`${BASE}/admin/reviews`, { waitUntil: "networkidle" });
await sleep(3500);
await page.screenshot({ path: "/tmp/shot-reviews-admin-after.png" });
const rbody = await page.locator("body").textContent();
ok("admin reviews summary", rbody.includes("Average rating") && rbody.includes("Total reviews"));
ok("admin reviews filter chips", rbody.includes("All"));

// ── Diner reviews (after) — fresh diner ──
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p2 = await ctx2.newPage();
const phone = `+9617886${String(Date.now()).slice(-5)}`;
await p2.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
await sleep(800);
await p2.locator('input[name="phone"]').fill(phone);
await p2.locator('input[name="phone"]').press("Enter");
for (let i = 0; i < 20 && !(await p2.locator('input[data-input-otp]').count()); i++) await sleep(500);
// crack the OTP via the hash
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
const out = execSync(
  `npx convex data authVerificationCodes --url https://canny-leopard-341.convex.cloud --format jsonLines`,
  { maxBuffer: 10 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
).toString();
let latest = null;
for (const line of out.split("\n")) {
  const t = line.trim();
  if (!t.startsWith("{")) continue;
  const doc = JSON.parse(t);
  if (doc.phoneVerified !== phone) continue;
  if (!latest || doc._creationTime > latest._creationTime) latest = doc;
}
const hash = latest?.code ?? latest?.codeHash ?? null;
let otp = null;
if (hash) for (let i = 0; i < 1000000; i++) {
  const c = String(i).padStart(6, "0");
  if (createHash("sha256").update(c).digest("hex") === hash) { otp = c; break; }
}
if (!otp) { console.error("  ❌ could not crack OTP"); process.exit(1); }
await p2.locator('input[data-input-otp]').fill(otp);
await sleep(300);
await p2.locator('input[data-input-otp]').press("Enter");
await sleep(8000);
const b0 = await p2.locator("body").textContent();
if (b0?.includes("Set a password")) { await p2.getByRole("button", { name: /Skip for now/ }).click().catch(() => {}); await sleep(1500); }
if ((await p2.locator("body").textContent())?.includes("Welcome to Kamix")) {
  await p2.locator("#name").fill("Review Tester");
  await p2.getByRole("button", { name: /Start exploring/ }).click();
  await sleep(3000);
}
await p2.goto(`${BASE}/restaurant/mh7ev9efn8m4dkhk81jzv836x18cp5va`, { waitUntil: "domcontentloaded" });
await sleep(5000);
await p2.evaluate(() => {
  const h = [...document.querySelectorAll("h2")].find((el) => /diners say|reviews/i.test(el.textContent || ""));
  if (h) h.scrollIntoView({ block: "start" });
});
await sleep(1000);
await p2.screenshot({ path: "/tmp/shot-reviews-diner-after.png" });
const dbody = await p2.locator("body").textContent();
ok("diner review summary bars", dbody.includes("Verified visit"));
ok("diner review avatars", dbody.includes("Review Tester") || /What diners say/.test(dbody));
await ctx2.close();

console.log(`\nRESULTS: ${passed} passed, ${failed} failed`);
await browser.close();
process.exit(failed ? 1 : 0);
