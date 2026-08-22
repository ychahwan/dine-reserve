import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
  await page.locator('input[name="phone"]').fill("+96176683661");
  await page.locator('input[name="phone"]').press("Enter");
  await page.locator('input[name="password"]').waitFor({ timeout: 10_000 });
  await page.locator('input[name="password"]').fill("BeityAdmin2026!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin(?:\/)?$/, { timeout: 15_000 });

  await page.goto(`${BASE}/admin/reviews`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Reviews" }).waitFor();

  await page.getByLabel("Filter by restaurant").waitFor();
  await page.getByLabel("Filter by diner").waitFor();
  await page.getByLabel("Select all filtered reviews").check();
  await page.getByRole("button", { name: /Delete selected/ }).click();
  await page.getByRole("heading", { name: /Delete selected reviews/ }).waitFor();
  await page.keyboard.press("Escape");

  const detailLink = page.getByRole("link", { name: /View review details/ }).first();
  await detailLink.click();
  await page.waitForURL(/\/admin\/reviews\//);
  await page.getByRole("heading", { name: "Review details" }).waitFor();
  await page.getByRole("button", { name: "Delete review" }).waitFor();

  console.log("admin review filters, bulk confirmation, and details flow render");
} finally {
  await browser.close();
}
