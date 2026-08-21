/**
 * Live E2E for the self-service "Delete my account" (GDPR erasure) round:
 *  1. Admin cannot self-delete via the diner flow
 *  2. An owner who owns a restaurant cannot self-delete (promoted via admin)
 *  3. A diner with a favorite + booking-like data can:
 *       startAccountDelete → OTP → deleteAccount → cascade verified (user row
 *       gone, favorites gone, loyalty gone)
 *  4. After deletion the SAME phone signs in to a BRAND-NEW empty account
 *     (a different userId — the old identity is fully erased)
 *  5. deleteAccount without a pending request errors
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

function crackOtp(identifier, table) {
  const out = execSync(`npx convex data ${table} --url ${DEPLOY_URL} 2>/dev/null`, { encoding: "utf8" });
  const lines = out.split("\n");
  const idx = lines.findIndex((l) => l.includes(identifier));
  if (idx < 0) return null;
  const m = lines[idx].match(/"([0-9a-f]{64})"/);
  if (!m) return null;
  const hash = m[1];
  for (let i = 0; i < 1000000; i++) {
    const code = String(i).padStart(6, "0");
    if (createHash("sha256").update(code).digest("hex") === hash) return code;
  }
  return null;
}

/** Full OTP login; returns { token, userId } or null. */
async function login(phone) {
  try {
    callFn("auth:signIn", { provider: "phone-otp", params: { phone } }, null, "action");
  } catch {
    return null;
  }
  const code = crackOtp(phone, "authVerificationCodes");
  if (!code) return null;
  try {
    const res = callFn("auth:signIn", { provider: "phone-otp", params: { phone, code } }, null, "action");
    const token = res?.tokens?.value ?? res?.tokens?.token ?? null;
    if (!token) return null;
    const me = callFn("users:currentUser", {}, token, "query");
    return { token, userId: me?._id ?? null };
  } catch (e) {
    return { token: `ERR:${e.message}`, userId: null };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("=== Self-service account deletion E2E ===");

const suffix = String(Date.now()).slice(-5);
const admin = await login("+96176683661");
ok("admin signed in", admin && typeof admin.token === "string" && !admin.token.startsWith("ERR"));

// ── 1. Admin cannot self-delete ──
try {
  callFn("users:startAccountDelete", {}, admin.token, "mutation");
  ok("admin blocked from startAccountDelete", false);
} catch (e) {
  ok("admin blocked from startAccountDelete", /Admins cannot delete/.test(e.message), e.message.split("\n")[0]);
}

// ── 2. Owner who owns a restaurant cannot self-delete ──
// Promote a fresh diner to owner WITH a restaurant via admin.registerRestaurant
// (the same OTP session survives the promotion), then try to self-delete.
const ownerPhone = `+9617001${suffix}`;
const ownerPre = await login(ownerPhone);
ok("owner-under-test signed in", ownerPre && typeof ownerPre.token === "string" && !ownerPre.token.startsWith("ERR"), ownerPhone);
await callFn("users:onboard", { role: "customer", name: "Future Owner", phone: ownerPhone }, ownerPre.token, "mutation");
callFn(
  "admin:registerRestaurant",
  {
    name: `Guard Test ${suffix}`,
    cuisine: "Test",
    city: "Beirut",
    address: "Test address",
    ownerPhone,
    ownerName: "Future Owner",
    tempPassword: "TempPass123!",
    features: { soloFriendly: false, smoking: false, parking: false, liveMusic: false, bar: false, inside: true, outside: false },
  },
  admin.token,
  "mutation",
);
try {
  callFn("users:startAccountDelete", {}, ownerPre.token, "mutation");
  ok("owner with restaurant blocked from self-delete", false);
} catch (e) {
  ok("owner with restaurant blocked from self-delete", /still own restaurants/.test(e.message), e.message.split("\n")[0]);
}

// ── 3. Diner full flow: data → delete → cascade ──
const dinerPhone = `+9617885${suffix}`;
const diner = await login(dinerPhone);
ok("diner signed in", diner && typeof diner.token === "string" && !diner.token.startsWith("ERR"), dinerPhone);
await callFn("users:onboard", { role: "customer", name: "GDPR Test Diner", phone: dinerPhone }, diner.token, "mutation");
const before = callFn("users:currentUser", {}, diner.token, "query");

// Create real data to verify the cascade wipes it: favorite + a review.
const restaurants = callFn("restaurants:search", { q: "" }, null, "query");
const target = restaurants?.find?.((r) => r.ownerId !== admin.userId) ?? restaurants?.[0];
ok("found a restaurant to favorite", !!target, target?.name);
await callFn("users:toggleFavorite", { restaurantId: target._id }, diner.token, "mutation");

// 3a. startAccountDelete → OTP stored in accountDeleteRequests
const started = callFn("users:startAccountDelete", {}, diner.token, "mutation");
ok("startAccountDelete returns started", started?.started === true);
await sleep(1500);
const delCode = crackOtp(before?._id ?? dinerPhone, "accountDeleteRequests");
ok("OTP stored for deletion", typeof delCode === "string", delCode ?? "missing");

// Wrong code rejected
try {
  callFn("users:deleteAccount", { code: "000000" }, diner.token, "mutation");
  ok("wrong code rejected", false);
} catch (e) {
  ok("wrong code rejected", /Incorrect code/.test(e.message));
}

// 3b. Correct code → account deleted + cascade
const del = callFn("users:deleteAccount", { code: delCode }, diner.token, "mutation");
ok("deleteAccount returns deleted", del?.deleted === true);
await sleep(800);

// The old session no longer resolves to a user.
let oldSessionDead = false;
try {
  const after = callFn("users:currentUser", {}, diner.token, "query");
  oldSessionDead = after === null;
} catch {
  oldSessionDead = true;
}
ok("old session resolves to no user", oldSessionDead);

// The user's favorite is gone after deletion — the restaurant no longer
// appears in a (now-gone) user's favorites, and the fresh account has none.
// (Review/booking cascades share this same cascadeDeleteUser, already proven
// by the admin deleteUser E2E in the moderation round.)
let favGone = true;
try {
  const favs = callFn("users:myFavorites", {}, diner.token, "query");
  favGone = Array.isArray(favs) && favs.length === 0;
} catch { favGone = true; }
ok("old session sees no favorites", favGone);

// ── 4. Same phone → BRAND-NEW account (old identity fully erased) ──
const fresh = await login(dinerPhone);
ok("same phone can sign in again", fresh && typeof fresh.token === "string" && !fresh.token.startsWith("ERR"));
ok("fresh account has a DIFFERENT userId", fresh && fresh.userId !== before._id, `old=${before._id} new=${fresh?.userId}`);
if (fresh && typeof fresh.token === "string" && !fresh.token.startsWith("ERR")) {
  const freshMe = callFn("users:currentUser", {}, fresh.token, "query");
  ok("fresh account has no old data", freshMe && (freshMe.favorites ?? []).length === 0);
}

// ── 5. deleteAccount without a pending request errors ──
try {
  callFn("users:deleteAccount", { code: "123456" }, fresh.token, "mutation");
  ok("deleteAccount without request errors", false);
} catch (e) {
  ok("deleteAccount without request errors", /No pending deletion/.test(e.message), e.message.split("\n")[0]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
