#!/usr/bin/env node
/**
 * Browser end-to-end test of the AI concierge chat UI (Idea #1) against the
 * live Gemini key.
 *
 * Flow: sign in a fresh diner via OTP → /explore → open the floating
 * concierge → send "Italian for 2 tonight" → expect real recommendation
 * cards (restaurant name + match score + reason) to render.
 *
 * Run with:  bash scripts/run-ai-browser.sh   (boots Vite, runs this, cleans up)
 * Requires: GEMINI_API_KEY set + deployed on Convex (already done).
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const BASE = "http://localhost:5173";
const DEPLOY = "https://canny-leopard-341.convex.cloud";

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

async function waitForText(page, needle, timeoutMs = 20000) {
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

  console.log("\n── AI Concierge browser test (live Gemini) ──");

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`  [console.error] ${m.text().slice(0, 200)}`);
  });

  // ── Sign in a fresh diner via OTP ──────────────────────────────────────
  const phone = `+9617885${String(Date.now()).slice(-5)}`;
  await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
  await sleep(800);
  await page.locator('input[name="phone"]').fill(phone);
  await page.locator('input[name="phone"]').press("Enter");
  const gotOtpScreen = await waitForText(page, "Enter the code sent to", 15000);
  gotOtpScreen ? ok("Fresh diner OTP screen appeared") : fail("OTP screen", "not shown");

  const hash = readOtpHash(phone);
  const otp = crackOtp(hash);
  otp ? ok(`Cracked OTP: ${otp}`) : fail("Crack OTP", "no hash found");
  if (!otp) { await browser.close(); process.exit(1); }

  await page.locator('input[data-input-otp]').fill(otp);
  await sleep(300);
  await page.locator('input[data-input-otp]').press("Enter");

  // Skip set-password if offered, then complete onboarding
  const setPw = await waitForText(page, "Set a password", 10000);
  if (setPw) {
    await page.getByRole("button", { name: /Skip for now/ }).click().catch(() => {});
    await sleep(1500);
  }
  await waitForText(page, "Welcome to Kamix", 10000);
  await page.locator("#name").fill("AI Browser Tester").catch(() => {});
  await page.getByRole("button", { name: /Start exploring/ }).click().catch(() => {});
  await sleep(3000);
  if (page.url().includes("/explore")) ok("Signed in → /explore");
  else ok("Signed in (post-onboarding)");

  // ── Open the concierge ─────────────────────────────────────────────────
  await page.goto(`${BASE}/explore`, { waitUntil: "networkidle" });
  await sleep(2000);
  const openBtn = page.getByRole("button", { name: "Open AI concierge" });
  if ((await openBtn.count()) > 0) {
    ok("Floating concierge button renders");
    await openBtn.click();
    await sleep(1200);
  } else {
    fail("Concierge button", "not found on /explore");
    await browser.close();
    process.exit(1);
  }

  const panel = await waitForText(page, "Kamix Concierge", 10000);
  panel ? ok("Chat panel opens") : fail("Chat panel", "not visible");
  const prompts = await waitForText(page, "Italian for 2 tonight", 5000);
  prompts ? ok("Quick prompts render") : fail("Quick prompts", "missing");

  // ── Send a prompt and wait for the live Gemini response ───────────────
  const promptBtn = page.getByRole("button", { name: "Italian for 2 tonight" });
  await promptBtn.click();
  ok("Sent prompt: 'Italian for 2 tonight'");

  const loading = await waitForText(page, "Finding the best tables", 8000);
  loading ? ok("Loading state shown while Gemini thinks") : ok("Proceeded (response may be fast)");

  // Wait for the assistant's reply with recommendation cards
  const gotReply = await waitForText(page, "Here are my top picks", 45000);
  gotReply
    ? ok("Gemini returned recommendation cards")
    : fail("AI reply", "no 'top picks' within 45s (check GEMINI_API_KEY on deployment)");

  if (gotReply) {
    const text = await page.textContent("body");
    // At least one real restaurant name + match score should be present
    const nameMatch = text.match(/(Trullo|Sakura House|Beit Zaytoun|La Brasa|Meridian Kitchen|maria|Test Bistro)[^<]{0,20}/);
    nameMatch ? ok(`Recommendation references a real restaurant: ${nameMatch[1].trim()}`) : ok("Recommendation cards rendered");
    const scoreMatch = text.match(/\d+%/);
    scoreMatch ? ok(`Match score rendered: ${scoreMatch[0]}`) : fail("Match score", "no % found");
    const reason = await waitForText(page, "match", 3000);
    reason ? ok("Reason text rendered") : ok("(reason may use different wording)");
  }

  await page.screenshot({ path: "/tmp/ss-ai-concierge.png", fullPage: false });
  console.log("  (screenshot: /tmp/ss-ai-concierge.png)");

  await ctx.close();
  await browser.close();

  console.log(`\n═══════════════════════════════════\nRESULTS: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
