import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const DEPLOY_URL = "https://canny-leopard-341.convex.cloud";

let pass = 0, fail = 0;
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? ` — ${extra}` : ""}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function callFn(fn, args, token, kind = "action") {
  const endpoint = kind === "action" ? "action" : kind === "mutation" ? "mutation" : "query";
  const body = JSON.stringify({ path: fn, format: "convex_encoded_json", args: kind === "action" ? [args ?? {}] : args ?? {} });
  const auth = token ? `-H "Authorization: Bearer ${token}" ` : "";
  const res = execSync(
    `curl -s -X POST "${DEPLOY_URL}/api/${endpoint}" -H "Content-Type: application/json" ${auth}-d '${body.replace(/'/g, "'\\''")}'`,
    { encoding: "utf8" },
  );
  const parsed = JSON.parse(res);
  if (parsed.status === "error") throw new Error(parsed.errorMessage ?? JSON.stringify(parsed));
  return parsed.value;
}
function crackOtp(phone) {
  const out = execSync(`npx convex data authVerificationCodes --url ${DEPLOY_URL} 2>/dev/null`, { encoding: "utf8" });
  const lines = out.split("\n");
  const idx = lines.findIndex((l) => l.includes(phone));
  if (idx < 0) return null;
  const m = lines[idx].match(/"([0-9a-f]{64})"/);
  if (!m) return null;
  for (let i = 0; i < 1000000; i++) {
    if (createHash("sha256").update(String(i).padStart(6, "0")).digest("hex") === m[1]) return String(i).padStart(6, "0");
  }
  return null;
}

const browser = await chromium.launch();
const page = await browser.newPage();

console.log("=== Admin moderation UI E2E ===");

// Login as admin through the browser (password — admin has a password account)
await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
await sleep(800);
await page.locator('input[name="phone"]').fill("+96176683661");
await page.locator('input[name="phone"]').press("Enter");
await sleep(2000);
const pwShown = (await page.locator("body").textContent())?.includes("Password login");
ok("admin routed to password screen", !!pwShown);
await page.locator('input[name="password"]').fill("BeityAdmin2026!");
await page.getByRole("button", { name: "Sign in" }).click();
await sleep(3500);
ok("admin lands in console", page.url().includes("/admin"), page.url());

// ── Users list: Disabled badge infrastructure + detail page moderation card ──
await page.goto(`${BASE}/admin/users`, { waitUntil: "networkidle" });
await sleep(2500);
const usersHeading = (await page.locator("body").textContent())?.includes("Users");
ok("Users page renders", !!usersHeading);

// pick the first user link
const firstUser = page.locator('a[href^="/admin/users/"]').first();
const userHref = await firstUser.getAttribute("href").catch(() => null);
ok("a user row exists", !!userHref);
if (userHref) {
  await page.goto(`${BASE}${userHref}`, { waitUntil: "networkidle" });
  await sleep(2500);
  const body = (await page.locator("body").textContent()) ?? "";
  ok("user detail shows Moderation card", body.includes("Moderation"));
  ok("user detail shows Disable button", body.includes("Disable account"));
  ok("user detail shows Delete user", body.includes("Delete user permanently"));
  // opens the delete confirm dialog
  await page.getByRole("button", { name: /Delete user permanently/ }).click();
  await sleep(600);
  const dialogBody = (await page.locator("body").textContent()) ?? "";
  ok("delete-user confirm dialog opens", dialogBody.includes("Delete this user permanently?"));
  await page.keyboard.press("Escape");
  await sleep(400);
}

// ── Restaurants: moderation card ──
await page.goto(`${BASE}/admin/restaurants`, { waitUntil: "networkidle" });
await sleep(2500);
const firstRest = page.locator('a[href^="/admin/restaurants/"]').first();
const restHref = await firstRest.getAttribute("href").catch(() => null);
ok("a restaurant row exists", !!restHref);
if (restHref) {
  await page.goto(`${BASE}${restHref}`, { waitUntil: "networkidle" });
  await sleep(2500);
  const body = (await page.locator("body").textContent()) ?? "";
  ok("restaurant detail shows Moderation card", body.includes("Moderation"));
  ok("restaurant detail shows Disable button", body.includes("Disable restaurant"));
  ok("restaurant detail shows Delete restaurant", body.includes("Delete restaurant permanently"));
}

// ── Reviews: delete buttons ──
await page.goto(`${BASE}/admin/reviews`, { waitUntil: "networkidle" });
await sleep(2500);
const reviewsBody = (await page.locator("body").textContent()) ?? "";
ok("Reviews page renders", reviewsBody.includes("Reviews"));
const hasDeleteBtns = await page.getByRole("button", { name: /Delete/ }).count();
ok("review rows have Delete buttons", hasDeleteBtns > 0, `${hasDeleteBtns} delete buttons`);

// ── Audit: clear button + confirm ──
await page.goto(`${BASE}/admin/audit`, { waitUntil: "networkidle" });
await sleep(2500);
const auditBody = (await page.locator("body").textContent()) ?? "";
ok("Audit page renders", auditBody.includes("Audit log"));
const clearBtn = page.getByRole("button", { name: /Clear log/ });
if ((await clearBtn.count()) > 0) {
  ok("Clear log button renders", true);
  await clearBtn.first().click();
  await sleep(600);
  const afterClick = (await page.locator("body").textContent()) ?? "";
  ok("clear confirm dialog opens", afterClick.includes("Clear the audit log?"));
} else {
  ok("Clear log button renders", false, "button missing (log may be empty)");
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
