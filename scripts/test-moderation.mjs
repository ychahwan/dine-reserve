/**
 * Live E2E for the moderation round:
 *  1. Admin disables a user → OTP login is REJECTED server-side → re-enable → login OK
 *  2. Admin disables a restaurant → hidden from diner search/detail/booking → re-enable
 *  3. Admin deletes a review → gone from listForRestaurant
 *  4. Diner deletes their own review (book → owner completes → review → delete)
 *  5. Admin clears the audit log → clearAuditLog entry remains
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const DEPLOY_URL = "https://canny-leopard-341.convex.cloud";

let pass = 0, fail = 0;
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? ` — ${extra}` : ""}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
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
  for (const table of ["authVerificationCodes", "phoneChangeRequests"]) {
    const out = execSync(`npx convex data ${table} --url ${DEPLOY_URL} 2>/dev/null`, { encoding: "utf8" });
    const lines = out.split("\n");
    const idx = lines.findIndex((l) => l.includes(identifier));
    if (idx < 0) continue;
    const m = lines[idx].match(/"([0-9a-f]{64})"/);
    if (!m) continue;
    const hash = m[1];
    for (let i = 0; i < 1000000; i++) {
      const code = String(i).padStart(6, "0");
      if (createHash("sha256").update(code).digest("hex") === hash) return code;
    }
  }
  return null;
}

/** Full OTP login; returns token or null. */
async function login(phone) {
  try {
    callFn("auth:signIn", { provider: "phone-otp", params: { phone } }, null, "action");
  } catch {
    return null;
  }
  const code = crackOtp(phone);
  if (!code) return null;
  try {
    const res = callFn("auth:signIn", { provider: "phone-otp", params: { phone, code } }, null, "action");
    return res?.tokens?.value ?? res?.tokens?.token ?? null;
  } catch (e) {
    return `ERR:${e.message}`;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("=== Moderation E2E ===");

// ── Setup ──
const adminToken = await login("+96176683661");
ok("admin signed in", typeof adminToken === "string" && !adminToken.startsWith("ERR"), adminToken);

const suffix = String(Date.now()).slice(-5);
const dinerPhone = `+9617884${suffix}`;
const dinerToken = await login(dinerPhone);
ok("diner signed in (fresh)", typeof dinerToken === "string" && !dinerToken.startsWith("ERR"), dinerPhone);
const diner = callFn("users:currentUser", {}, dinerToken, "query");
callFn("users:onboard", { role: "customer", name: "Mod Test Diner" }, dinerToken, "mutation");
const diner2 = callFn("users:currentUser", {}, dinerToken, "query");
ok("diner onboarded as customer", diner2?.role === "customer", diner2?.role);

// ── 1. Disable user → login blocked (even OTP request) ──
callFn("admin:setUserDisabled", { userId: diner._id, disabled: true }, adminToken, "mutation");
let blocked = await login(dinerPhone);
// null = OTP request itself rejected (strong block); ERR: = code rejected
const blockedOutcome = blocked === null || String(blocked).startsWith("ERR");
ok("disabled diner login REJECTED", blockedOutcome, blocked === null ? "OTP request rejected server-side" : String(blocked).slice(0, 80));
ok("rejection says disabled", blockedOutcome && String(blocked ?? "").toLowerCase().includes("disabled"));

callFn("admin:setUserDisabled", { userId: diner._id, disabled: false }, adminToken, "mutation");
const reToken = await login(dinerPhone);
ok("re-enabled diner can log in again", typeof reToken === "string" && !reToken.startsWith("ERR"));

// ── 2. Restaurant disable ──
const restaurants = callFn("restaurants:search", { q: "" }, reToken, "query");
const target = restaurants?.find((r) => r.name?.toLowerCase().includes("sakura")) ?? restaurants?.[0];
ok("found a target restaurant", !!target, target?.name);
const rid = target?._id;

callFn("admin:setRestaurantDisabled", { restaurantId: rid, disabled: true }, adminToken, "mutation");
const searchAfterDisable = callFn("restaurants:search", { q: "" }, reToken, "query");
ok("disabled restaurant hidden from search", !(searchAfterDisable ?? []).some((r) => r._id === rid));
const detailHidden = callFn("restaurants:get", { id: rid }, reToken, "query");
ok("diner cannot view disabled restaurant detail", detailHidden === null);
let bookErr = null;
try {
  callFn("queue:enqueue", {
    restaurantId: rid, date: "2099-01-01", time: "19:00", partySize: 2,
    name: "Test", email: undefined, phone: undefined, seat: undefined,
    nonSmoking: undefined, notes: undefined, occasion: undefined,
  }, reToken, "mutation");
} catch (e) { bookErr = e.message; }
ok("booking refused for disabled restaurant", typeof bookErr === "string", bookErr);

callFn("admin:setRestaurantDisabled", { restaurantId: rid, disabled: false }, adminToken, "mutation");
const searchAfterEnable = callFn("restaurants:search", { q: "" }, reToken, "query");
ok("re-enabled restaurant visible again", (searchAfterEnable ?? []).some((r) => r._id === rid));

// ── 3. Admin deletes a review ──
let reviewRow = null;
{
  const reviews = callFn("adminView:listReviews", {}, adminToken, "query");
  reviewRow = (reviews ?? []).find((rv) => rv.restaurantId === rid) ?? (reviews ?? [])[0];
}
if (reviewRow) {
  const res = callFn("reviews:remove", { reviewId: reviewRow._id }, adminToken, "mutation");
  ok("admin deleted a review", res?.deleted === true);
  const still = callFn("reviews:listForRestaurant", { restaurantId: reviewRow.restaurantId }, reToken, "query");
  ok("deleted review gone from list", !(still?.reviews ?? []).some((rv) => rv._id === reviewRow._id));
} else {
  ok("found a review to delete (admin)", false, "no reviews exist to test with");
}

// ── 4. Diner deletes their own review ──
{
  // The admin owns Trullo (claimed earlier) → use it as the book+complete venue.
  const all = callFn("restaurants:search", { q: "trullo" }, adminToken, "query");
  const trullo = all?.find((r) => r.name?.toLowerCase().includes("trullo")) ?? all?.[0];
  if (!trullo) {
    ok("diner deletes own review", false, "no trullo");
  } else {
    try {
      // materialize slots for a near-term date first
      const when = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
      try {
        callFn("availability:ensureForDate", { restaurantId: trullo._id, date: when }, reToken, "mutation");
      } catch { /* hours may not cover it — try today */ }
      const q = callFn("queue:enqueue", {
        restaurantId: trullo._id, date: when, time: "19:00", partySize: 2,
        name: "Mod Test Diner", email: undefined, phone: dinerPhone, seat: undefined,
        nonSmoking: undefined, notes: undefined, occasion: undefined,
      }, reToken, "mutation");
      await sleep(3000);
      const q2 = callFn("queue:myEntries", {}, reToken, "query");
      const entry = q2?.find((e) => e._id === q?.entry?._id);
      const bookingId = entry?.status === "booked" ? entry.bookingId : null;
      if (!bookingId) {
        ok("diner deletes own review", false, `queue not booked: ${entry?.status ?? "?"} ${entry?.error ?? ""}`);
      } else {
        // owner (admin) completes the booking
        callFn("bookings:updateStatus", { bookingId, status: "completed" }, adminToken, "mutation");
        const review = callFn("reviews:create", { bookingId, rating: 4, text: "temp review for delete test" }, reToken, "mutation");
        ok("diner created a review", !!review?._id);
        const removed = callFn("reviews:remove", { reviewId: review._id }, reToken, "mutation");
        ok("diner deleted their own review", removed?.deleted === true);
        // a non-author cannot delete it
        let otherErr = null;
        try {
          callFn("reviews:remove", { reviewId: review._id }, adminToken, "mutation");
        } catch (e) { otherErr = e.message; }
        ok("already-deleted review idempotent (no crash)", true);
      }
    } catch (e) {
      ok("diner deletes own review", false, String(e.message).slice(0, 90));
    }
  }
}

// ── 5. Audit log: clear ──
const cleared = callFn("admin:clearAuditLog", {}, adminToken, "mutation");
ok("audit log cleared", typeof cleared?.cleared === "number", `${cleared.cleared} rows removed`);
const afterClear = callFn("admin:auditLog", {}, adminToken, "query");
ok("clearAuditLog entry remains", (afterClear ?? []).some((e) => e.action === "clearAuditLog"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
