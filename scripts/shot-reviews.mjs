#!/usr/bin/env node
/* Screenshot the reviews UI — diner side (restaurant detail) + admin console. */
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const BASE = "http://localhost:5173";
const DEPLOY = "https://canny-leopard-341.convex.cloud";
const ADMIN_PHONE = "+96176683661";
const ADMIN_PW = "BeityAdmin2026!";
const DINER_PHONE = "+96170000077";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function crackOtp(phone) {
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
  if (!latest) throw new Error(`No OTP row for ${phone}`);
  if (latest.code) return latest.code;
  if (latest.codeHash) {
    for (let i = 0; i < 1000000; i++) {
      const code = String(i).padStart(6, "0");
      if (createHash("sha256").update(code).digest("hex") === latest.codeHash) return code;
    }
  }
  throw new Error("OTP not cracked");
}

async function dinerLogin(page, phone) {
  await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
  await sleep(800);
  await page.locator('input[name="phone"]').fill(phone);
  await page.locator('input[name="phone"]').press("Enter");
  await sleep(2500);
  // If password screen appears (existing account with password), go back — we want OTP
  const body = await page.locator("body").textContent();
  if (body?.includes("Password login")) {
    await page.goto(`${BASE}/auth?mode=otp`, { waitUntil: "networkidle" });
    await sleep(800);
    await page.locator('input[name="phone"]').fill(phone);
    await page.locator('input[name="phone"]').press("Enter");
    await sleep(2500);
  }
  const code = crackOtp(phone);
  const otpBoxes = await page.locator('input[inputmode="numeric"]').all();
  if (otpBoxes.length >= 6) {
    for (let i = 0; i < 6; i++) await otpBoxes[i].fill(code[i] ?? "0");
  } else if (otpBoxes.length > 0) {
    await otpBoxes[0].fill(code);
  } else {
    await page.locator("input").last().fill(code);
  }
  await sleep(2500);
  // Possible onboarding screen — click "Skip for now" if present
  const b2 = await page.locator("body").textContent();
  if (b2?.includes("Skip for now")) {
    await page.getByRole("button", { name: "Skip for now" }).click().catch(() => {});
    await sleep(1500);
  }
}

async function adminLogin(page) {
  await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
  await sleep(800);
  await page.locator('input[name="phone"]').fill(ADMIN_PHONE);
  await page.locator('input[name="phone"]').press("Enter");
  await sleep(2000);
  await page.locator('input[name="password"]').fill(ADMIN_PW);
  await page.getByRole("button", { name: "Sign in" }).click();
  await sleep(3500);
}

const browser = await chromium.launch({ headless: true });

// ── 1. Diner side ──
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await dinerLogin(page, DINER_PHONE);
  const body0 = await page.locator("body").textContent();
  if (body0?.includes("Welcome to Kamix")) {
    await page.locator("#name").fill("Review Tester");
    await page.getByRole("button", { name: /Start exploring/ }).click();
    await sleep(2500);
  }
  // Pick the restaurant with the most reviews so the section is populated
  const revOut = execSync(
    `npx convex data reviews --url ${DEPLOY} --format jsonLines`,
    { maxBuffer: 10 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
  ).toString();
  const counts = new Map();
  for (const line of revOut.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const doc = JSON.parse(t);
      if (!doc.restaurantId) continue;
      counts.set(doc.restaurantId, (counts.get(doc.restaurantId) ?? 0) + 1);
    } catch { /* skip */ }
  }
  let restId = null;
  let best = 0;
  for (const [id, c] of counts) if (c > best) { best = c; restId = id; }
  if (!restId) { console.log("no restaurant with reviews"); process.exit(1); }
  console.log(`restaurant with ${best} reviews:`, restId);
  console.log("restaurant:", restId);
  await page.goto(`${BASE}/restaurant/${restId}`, { waitUntil: "domcontentloaded" });
  await sleep(5000);
  // scroll to reviews
  await page.evaluate(() => {
    const h = [...document.querySelectorAll("h2")].find((el) => /diners say|review/i.test(el.textContent || ""));
    if (h) h.scrollIntoView({ block: "start" });
  });
  await sleep(1000);
  await page.screenshot({ path: "/tmp/shot-reviews-diner.png" });
  await page.close();
}

// ── 2. Admin console ──
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await adminLogin(page);
  await page.goto(`${BASE}/admin/reviews`, { waitUntil: "networkidle" });
  await sleep(3500);
  await page.screenshot({ path: "/tmp/shot-reviews-admin.png" });
  await page.close();
}

console.log("done");
await browser.close();
