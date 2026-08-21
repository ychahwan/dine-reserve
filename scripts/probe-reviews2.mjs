#!/usr/bin/env node
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const BASE = "http://localhost:5173";
const DEPLOY = "https://canny-leopard-341.convex.cloud";
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

const phone = `+9617886${String(Date.now()).slice(-5)}`;
await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
await sleep(800);
await page.locator('input[name="phone"]').fill(phone);
await page.locator('input[name="phone"]').press("Enter");
for (let i = 0; i < 20 && !(await page.locator('input[data-input-otp]').count()); i++) await sleep(500);
const code = readOtp(phone);
await page.locator('input[data-input-otp]').fill(code);
await sleep(300);
await page.locator('input[data-input-otp]').press("Enter");
await sleep(8000);
const setPw = (await page.locator("body").textContent())?.includes("Set a password");
if (setPw) { await page.getByRole("button", { name: /Skip for now/ }).click().catch(() => {}); await sleep(1500); }
const body0 = await page.locator("body").textContent();
if (body0?.includes("Welcome to Kamix")) {
  await page.locator("#name").fill("Review Tester");
  await page.getByRole("button", { name: /Start exploring/ }).click();
  await sleep(3000);
}

const REST = "mh7ev9efn8m4dkhk81jzv836x18cp5va";
await page.goto(`${BASE}/restaurant/${REST}`, { waitUntil: "domcontentloaded" });
await sleep(6000);

const detail = await page.evaluate(() => {
  const h = [...document.querySelectorAll("h2")].find((el) => /diners say|reviews/i.test(el.textContent || ""));
  if (!h) return { found: false };
  const section = h.closest("div")?.parentElement || h.parentElement;
  const cards = [...(section?.querySelectorAll(".rounded-xl") ?? [])];
  const first = cards[0];
  const cs = first ? getComputedStyle(first) : null;
  return {
    found: true,
    cardCount: cards.length,
    firstCardHTML: first?.outerHTML.slice(0, 1500),
    cardPadding: cs?.padding,
    cardRadius: cs?.borderRadius,
    headerRow: first?.querySelector("div")?.outerHTML?.slice(0, 600),
  };
});
console.log(JSON.stringify(detail, null, 2));

// average header row layout
const layout = await page.evaluate(() => {
  const h = [...document.querySelectorAll("h2")].find((el) => /diners say|reviews/i.test(el.textContent || ""));
  const section = h?.closest("div")?.parentElement || h?.parentElement;
  const header = section?.querySelector(".flex.items-center.justify-between");
  return {
    headerHTML: header?.outerHTML?.slice(0, 800),
    avgLabel: header?.textContent,
  };
});
console.log(JSON.stringify(layout, null, 2));
await browser.close();
