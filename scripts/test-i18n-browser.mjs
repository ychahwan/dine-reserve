/**
 * Browser E2E for Idea #9 (i18n): language switcher, RTL flip, translated UI.
 * Boots the vite dev server, then walks: Landing → switch AR → check RTL +
 * Arabic hero → switch FR → check French → switch EN → check English → Auth page.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const HOSTED = process.env.HOSTED_URL;

let pass = 0, fail = 0;
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? ` — ${extra}` : ""}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server = null;
let url = BASE;
if (!HOSTED) {
  server = spawn("npx", ["vite", "--port", "5173", "--strictPort"], { stdio: "ignore", detached: true });
  // wait for the server
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) break;
    } catch {}
    await sleep(500);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage();

console.log("=== Idea #9: i18n — language switcher + RTL ===");

// ── Landing loads in English by default (fresh context) ──
await page.goto(url, { waitUntil: "networkidle" });
await sleep(800);
ok("Landing renders EN hero", (await page.locator("h1").first().textContent())?.includes("Book your table"));

// ── Switch to Arabic ──
await page.getByRole("button", { name: "Language" }).click();
await sleep(300);
await page.getByRole("button", { name: "العربية" }).click();
await sleep(800);

const dir = await page.evaluate(() => document.documentElement.dir);
ok("RTL direction applied for Arabic", dir === "rtl", `dir=${dir}`);
const lang = await page.evaluate(() => document.documentElement.lang);
ok("html lang set to ar", lang === "ar", lang);
const h1Ar = (await page.locator("h1").first().textContent()) ?? "";
ok("Arabic hero renders", h1Ar.includes("احجز"), h1Ar.slice(0, 60));
const persisted = await page.evaluate(() => localStorage.getItem("kamix.lang"));
ok("choice persisted to localStorage", persisted === "ar", persisted);

// ── Switch to French ──
await page.getByRole("button", { name: "Language" }).click();
await sleep(300);
await page.getByRole("button", { name: "Français" }).click();
await sleep(800);
const dirFr = await page.evaluate(() => document.documentElement.dir);
ok("RTL cleared for French", dirFr === "ltr", `dir=${dirFr}`);
const h1Fr = (await page.locator("h1").first().textContent()) ?? "";
ok("French hero renders", h1Fr.includes("Réservez"), h1Fr.slice(0, 60));

// ── Back to English ──
await page.getByRole("button", { name: "Language" }).click();
await sleep(300);
await page.getByRole("button", { name: "English" }).click();
await sleep(800);
const h1En = (await page.locator("h1").first().textContent()) ?? "";
ok("English hero restores", h1En.includes("Book your table"), h1En.slice(0, 60));

// ── Auth page respects the saved language (English) ──
await page.goto(`${url}/auth`, { waitUntil: "networkidle" });
await sleep(800);
ok("Auth page EN renders", (await page.locator("body").textContent())?.includes("Enter your phone"));

// ── Switch to Arabic on Auth, check RTL + translated title ──
await page.getByRole("button", { name: "Language" }).click();
await sleep(300);
await page.getByRole("button", { name: "العربية" }).click();
await sleep(800);
const bodyAr = (await page.locator("body").textContent()) ?? "";
ok("Auth page AR renders", bodyAr.includes("أدخل رقم هاتفك"));
const dirAr2 = await page.evaluate(() => document.documentElement.dir);
ok("Auth page RTL", dirAr2 === "rtl", `dir=${dirAr2}`);

console.log(`\n${pass} passed, ${fail} failed`);

await browser.close();
if (server) {
  try { process.kill(-server.pid); } catch {}
}
process.exit(fail > 0 ? 1 : 0);
