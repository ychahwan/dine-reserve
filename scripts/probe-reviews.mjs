#!/usr/bin/env node
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const BASE = "http://localhost:5173";
const DEPLOY = "https://canny-leopard-341.convex.cloud";
const DINER_PHONE = `+9617886${String(Date.now()).slice(-5)}`; // fresh diner
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readOtp(phone) {
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
  const hash = latest?.code ?? latest?.codeHash ?? null;
  if (!hash) return null;
  for (let i = 0; i < 1000000; i++) {
    const c = String(i).padStart(6, "0");
    if (createHash("sha256").update(c).digest("hex") === hash) return c;
  }
  return null;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// login as diner
await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
await sleep(800);
await page.locator('input[name="phone"]').fill(DINER_PHONE);
await page.locator('input[name="phone"]').press("Enter");
for (let i = 0; i < 20 && !(await page.locator('input[data-input-otp]').count()); i++) await sleep(500);
const code = readOtp(DINER_PHONE);
console.log("otp:", code);
await page.locator('input[data-input-otp]').fill(code);
await sleep(300);
await page.locator('input[data-input-otp]').press("Enter");
const setPw = await page.waitForTimeout(8000).then(async () => (await page.locator("body").textContent())?.includes("Set a password"));
if (setPw) { await page.getByRole("button", { name: /Skip for now/ }).click().catch(() => {}); await sleep(1500); }
console.log("after login url:", page.url());

// complete onboarding first if needed
const body0 = await page.locator("body").textContent();
if (body0?.includes("Welcome to Kamix")) {
  await page.locator("#name").fill("Review Tester");
  await page.getByRole("button", { name: /Start exploring/ }).click();
  await sleep(3000);
}

const REST = "mh7ev9efn8m4dkhk81jzv836x18cp5va"; // Meridian Kitchen — known reviews
await page.goto(`${BASE}/restaurant/${REST}`, { waitUntil: "domcontentloaded" });
await sleep(6000);
console.log("rest page url:", page.url());
const bodyText = await page.locator("body").textContent();
console.log("has Reviews heading:", bodyText.includes("Reviews"));
console.log("sample body:", bodyText.slice(0, 300));

const info = await page.evaluate(() => {
  const h = [...document.querySelectorAll("h2")].find((el) => /diners say|reviews/i.test(el.textContent || ""));
  if (!h) return { found: false, headings: [...document.querySelectorAll("h2")].map((x) => x.textContent) };
  const section = h.closest("div")?.parentElement || h.parentElement;
  return {
    found: true,
    heading: h.textContent,
    sectionText: section?.textContent?.slice(0, 900),
    cardCount: section?.querySelectorAll(".rounded-xl").length ?? 0,
  };
});
console.log(JSON.stringify(info, null, 2));

// scroll to reviews and screenshot full page
await page.evaluate(() => {
  const h = [...document.querySelectorAll("h2")].find((el) => /review/i.test(el.textContent || ""));
  if (h) h.scrollIntoView({ block: "start" });
});
await sleep(800);
await page.screenshot({ path: "/tmp/shot-reviews-diner2.png" });
await browser.close();
