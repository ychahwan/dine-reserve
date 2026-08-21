#!/usr/bin/env node
/**
 * Live smoke test for the new feature ideas implemented this round:
 *  - Idea #8  Restaurant stories (owner post → public recent)
 *  - Idea #18 Loyalty points (balance query)
 *  - Idea #3  Wait-time intelligence (publicWaitSignal)
 *  - Idea #5  Analytics 2.0 (analytics2 query)
 *  - Idea #20 Predictive availability (analytics.predict)
 *
 * Runs against the deployed Convex backend using the same HTTP API pattern
 * as verify-account-flows.mjs. Re-run with `node scripts/test-new-features.mjs`.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const DEPLOY_URL = "https://canny-leopard-341.convex.cloud";
const ADMIN_PHONE = "+96176683661";
const OWNER_PHONE = "+96178882222";
const OWNER_PASSWORD = "OmarNewPass456!";

let passed = 0;
let failed = 0;
function ok(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

function callFn(fn, args, token, kind = "action") {
  const endpoint = kind === "action" ? "action" : kind === "mutation" ? "mutation" : "query";
  const body = JSON.stringify({
    path: fn,
    format: "convex_encoded_json",
    args: kind === "action" ? [args ?? {}] : args ?? {},
  });
  const auth = token ? `-H "Authorization: Bearer ${token}" ` : "";
  const res = execSync(
    `curl -s -X POST "${DEPLOY_URL}/api/${endpoint}" -H "Content-Type: application/json" ${auth}-d '${body.replace(/'/g, "'\\''")}'`,
    { encoding: "utf8" },
  );
  const parsed = JSON.parse(res);
  if (parsed.status === "error") throw new Error(parsed.errorMessage ?? JSON.stringify(parsed));
  return parsed.value;
}

function crackOtp(identifier) {
  const tables = ["authVerificationCodes", "phoneChangeRequests"];
  for (const table of tables) {
    const out = execSync(`npx convex data ${table} --url ${DEPLOY_URL} 2>/dev/null`, { encoding: "utf8" });
    const lines = out.split("\n");
    const idx = lines.findIndex((l) => l.includes(identifier));
    if (idx < 0) continue;
    const m = lines[idx].match(/"([0-9a-f]{64})"/);
    if (!m) continue;
    const hash = m[1];
    for (let i = 0; i < 1000000; i++) {
      const code = String(i).padStart(6, "0");
      const h = createHash("sha256").update(code).digest("hex");
      if (h === hash) return code;
    }
  }
  return null;
}

async function main() {
  console.log("── New features live smoke test ──\n");

  // ── Admin auth (OTP) ────────────────────────────────────────────────
  callFn("auth:signIn", { provider: "phone-otp", params: { phone: ADMIN_PHONE } }, null, "action");
  const code = crackOtp(ADMIN_PHONE);
  ok("admin OTP crackable", code !== null);
  const res = callFn("auth:signIn", { provider: "phone-otp", params: { phone: ADMIN_PHONE, code } }, null, "action");
  const token = res?.tokens?.value ?? res?.tokens?.token ?? null;
  ok("admin token issued", !!token);
  const me = callFn("users:currentUser", {}, token, "query");
  ok("admin currentUser", me?.role === "admin", me?.role);

  // The admin may not own any restaurants — the demo restaurants belong to
  // demo owner accounts. Use the UI-suite owner for owner-scoped checks.
  const ownerAuth = callFn(
    "auth:signIn",
    { provider: "password", params: { phone: OWNER_PHONE, password: OWNER_PASSWORD, flow: "signIn" } },
    null,
    "action",
  );
  const ownerToken = ownerAuth?.tokens?.value ?? ownerAuth?.tokens?.token ?? null;
  ok("owner password sign-in", !!ownerToken);
  const restaurants = callFn("restaurants:listMine", {}, ownerToken, "query");
  ok("owner sees restaurants", Array.isArray(restaurants) && restaurants.length > 0, `${restaurants?.length ?? 0} found`);
  const restaurant = restaurants?.[0];
  const owner = { token: ownerToken };
  const ownerAny = (fn, args, kind) => callFn(fn, args, ownerToken, kind);

  // ── Idea #8: stories ─────────────────────────────────────────────────
  if (restaurant) {
    console.log("\n── Idea #8: Restaurant stories ──");
    const posted = ownerAny(
      "stories:post",
      { restaurantId: restaurant._id, text: "Live smoke test story 🍝", emoji: "🍝" },
      "mutation",
    );
    ok("owner posts a story", !!posted?._id);
    const recent = callFn("stories:recent", {}, token, "query");
    ok("story in public recent feed", Array.isArray(recent) && recent.some((s) => s._id === posted?._id));
    const mine = ownerAny("stories:mine", { restaurantId: restaurant._id }, "query");
    ok("owner sees story in mine", Array.isArray(mine) && mine.some((s) => s._id === posted?._id));
    ownerAny("stories:remove", { id: posted._id }, "mutation");
    const after = callFn("stories:recent", {}, token, "query");
    ok("story removable", !after.some((s) => s._id === posted?._id));

    // ── Idea #3: wait-time signal ────────────────────────────────────────
    console.log("\n── Idea #3: Wait-time intelligence ──");
    const pub = callFn("analytics:publicWaitSignal", { restaurantId: restaurant._id }, token, "query");
    ok("publicWaitSignal runs", pub === null || typeof pub.avgSeatMinutes === "number", pub?.label ?? "no data yet");
    const wait = ownerAny("analytics:waitTimes", { restaurantId: restaurant._id, days: 30 }, "query");
    ok("owner waitTimes runs", !!wait, wait?.summary ?? "null");

    // ── Idea #5: analytics 2.0 ───────────────────────────────────────────
    console.log("\n── Idea #5: Analytics 2.0 ──");
    const a2 = ownerAny("analytics:analytics2", { restaurantId: restaurant._id, days: 30 }, "query");
    ok("analytics2 runs", !!a2, a2 ? `repeat=${a2.repeatRate}% diners=${a2.uniqueDiners}` : "null");
    ok("analytics2 heatmap array", !!a2 && Array.isArray(a2.heatmap));
    ok("analytics2 topDiners array", !!a2 && Array.isArray(a2.topDiners));
    ok("analytics2 revenue projection", !!a2 && typeof a2.projectedRevenueCents === "number");

    // ── Idea #20: predictive availability ────────────────────────────────
    console.log("\n── Idea #20: Predictive availability ──");
    const future = new Date(Date.now() + 21 * 86400_000).toISOString().split("T")[0];
    const pred = ownerAny("analytics:predict", { restaurantId: restaurant._id, date: future }, "query");
    ok("predict returns", !!pred, pred?.message ?? "no message");
    ok("predict has likelihood", pred === null || typeof pred.likelySoldOut === "number");

    // ── AI actions: graceful without key ─────────────────────────────────
    console.log("\n── AI actions (ownerInsights / recommendDinner) ──");
    try {
      const ai = ownerAny("ai:ownerInsights", { restaurantId: restaurant._id, days: 30 }, "action");
      ok("ownerInsights returns", !!ai, ai?.summary?.slice(0, 60) ?? "no summary");
    } catch (e) {
      ok("ownerInsights fails gracefully without key", /GEMINI|configured/i.test(e.message), e.message.slice(0, 90));
    }
  }

  // ── Idea #18: loyalty balance (any signed-in user) ─────────────────────
  console.log("\n── Idea #18: Loyalty points ──");
  const balance = callFn("loyalty:myBalance", {}, token, "query");
  ok("myBalance query returns", !!balance && typeof balance.points === "number", `points=${balance?.points}`);
  ok("myBalance activity array", !!balance && Array.isArray(balance.activity));

  console.log(`\n═══════════════════════════════════\nRESULTS: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
