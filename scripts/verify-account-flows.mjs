/**
 * End-to-end verification of the new account flows:
 *  1. Change phone → OTP sent to NEW number → verify → phone moves (users.phone
 *     + authAccounts providerAccountId for phone-otp/password)
 *  2. Change password → wrong current password rejected
 *  3. Regression: admin OTP login still works
 *
 * Uses the live deployment's HTTP /api/function endpoint (the same one the
 * Convex client uses) + `npx convex data` to read the OTP hash.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const DEPLOY_URL = "https://canny-leopard-341.convex.cloud";

let pass = 0;
let fail = 0;
function ok(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

/**
 * Call a Convex function over the public HTTP API:
 *  - actions → POST /api/action   (args is a JSON-encoded array)
 *  - mutations → POST /api/mutation (args is a JSON-encoded object)
 *  - queries → POST /api/query
 */
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
  if (parsed.status === "error") {
    throw new Error(parsed.errorMessage ?? JSON.stringify(parsed));
  }
  return parsed.value;
}

/**
 * Extract the OTP hash for a phone, then crack it.
 * Checks authVerificationCodes (auth-library OTPs) first, then the
 * phoneChangeRequests table (our phone-change OTPs).
 */
function crackOtp(identifier) {
  const tables = ["authVerificationCodes", "phoneChangeRequests"];
  for (const table of tables) {
    const out = execSync(
      `npx convex data ${table} --url ${DEPLOY_URL} 2>/dev/null`,
      { encoding: "utf8" },
    );
    const lines = out.split("\n");
    const idx = lines.findIndex((l) => l.includes(identifier));
    if (idx < 0) continue;
    const row = lines[idx];
    const m = row.match(/"([0-9a-f]{64})"/);
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

function authTable() {
  return execSync(`npx convex data authAccounts --url ${DEPLOY_URL} 2>/dev/null`, {
    encoding: "utf8",
  });
}

console.log("=== FLOW 1: Admin OTP login (regression) ===");
{
  const phone = "+96176683661";
  callFn("auth:signIn", { provider: "phone-otp", params: { phone } }, null, "action");
  const code = crackOtp(phone);
  ok("admin OTP sent + crackable", code !== null);
  const res = callFn(
    "auth:signIn",
    { provider: "phone-otp", params: { phone, code } },
    null,
    "action",
  );
  const token = res?.tokens?.value ?? res?.tokens?.token ?? null;
  ok("admin token issued", !!token);
  const me = callFn("users:currentUser", {}, token, "query");
  ok("admin currentUser role=admin", me?.role === "admin", me?.role);
}

console.log("\n=== FLOW 2: Phone change with OTP on NEW number ===");
{
  // Fresh numbers per run so the script is idempotent.
  const suffix = String(Date.now()).slice(-5);
  const phone = `+9617888${suffix}`; // scratch diner (created by OTP below)
  const newPhone = `+9617887${suffix}`; // the NEW number

  callFn("auth:signIn", { provider: "phone-otp", params: { phone } }, null, "action");
  const code = crackOtp(phone);
  ok("diner OTP sent", code !== null);
  const res = callFn(
    "auth:signIn",
    { provider: "phone-otp", params: { phone, code } },
    null,
    "action",
  );
  const token = res?.tokens?.value ?? res?.tokens?.token ?? null;
  ok("diner token issued", !!token);

  const start = callFn("users:startPhoneChange", { newPhone }, token, "mutation");
  ok("startPhoneChange started", start?.started === true, JSON.stringify(start));

  const newCode = crackOtp(newPhone);
  ok("OTP sent to NEW number", newCode !== null);

  // Wrong code should be rejected
  let wrongRejected = false;
  try {
    callFn("users:confirmPhoneChange", { code: "000000" }, token, "mutation");
  } catch {
    wrongRejected = true;
  }
  ok("wrong code rejected", wrongRejected);

  const confirm = callFn("users:confirmPhoneChange", { code: newCode }, token, "mutation");
  ok("confirmPhoneChange succeeded", confirm?.phone === newPhone, confirm?.phone);
  ok("old phone removed from users", confirm?.phone !== phone);

  const accounts = authTable();
  ok("old phone removed from authAccounts", !accounts.includes(`"${phone}"`));
  ok("new phone present in authAccounts", accounts.includes(`"${newPhone}"`));
  if (accounts.includes(`"${phone}"`)) {
    // Debug: show the row(s) that still reference the old phone
    const hits = accounts
      .split("\n")
      .filter((l) => l.includes(phone))
      .join("\n");
    console.log(`  [debug] old-phone rows:\n${hits}`);
  }

  // Login with the NEW number via OTP works
  callFn("auth:signIn", { provider: "phone-otp", params: { phone: newPhone } }, null, "action");
  const reloginCode = crackOtp(newPhone);
  ok("OTP login works on NEW number", reloginCode !== null);
  const relogin = callFn(
    "auth:signIn",
    { provider: "phone-otp", params: { phone: newPhone, code: reloginCode } },
    null,
    "action",
  );
  ok("relogin token issued", !!(relogin?.tokens?.value ?? relogin?.tokens?.token));
}

console.log("\n=== FLOW 3: Change password — wrong current password rejected ===");
{
  // +96178883333 has both a phone-otp and a password account.
  const phone = "+96178883333";
  callFn("auth:signIn", { provider: "phone-otp", params: { phone } }, null, "action");
  const code = crackOtp(phone);
  ok("dina OTP sent", code !== null);
  const res = callFn(
    "auth:signIn",
    { provider: "phone-otp", params: { phone, code } },
    null,
    "action",
  );
  const token = res?.tokens?.value ?? res?.tokens?.token ?? null;
  ok("dina token issued", !!token);

  let wrongRejected = false;
  let wrongMsg = "";
  try {
    callFn(
      "users:setPassword",
      { newPassword: "BrandNewPass123!", currentPassword: "definitely-wrong" },
      token,
      "mutation",
    );
  } catch (e) {
    wrongRejected = true;
    wrongMsg = e.message;
  }
  ok("wrong current password rejected", wrongRejected, wrongMsg);

  // Setting a password with NO current password when one exists → rejected too
  let missingRejected = false;
  try {
    callFn("users:setPassword", { newPassword: "BrandNewPass123!" }, token, "mutation");
  } catch {
    missingRejected = true;
  }
  ok("missing current password rejected", missingRejected);
}

console.log("\n=== FLOW 4: Admin sets a password for a user ===");
{
  // Fresh diner (phone-OTP only, no password yet).
  const phone = `+9617884${String(Date.now()).slice(-5)}`;
  callFn("auth:signIn", { provider: "phone-otp", params: { phone } }, null, "action");
  const code = crackOtp(phone);
  ok("fresh diner OTP sent", code !== null);
  const dinerRes = callFn(
    "auth:signIn",
    { provider: "phone-otp", params: { phone, code } },
    null,
    "action",
  );
  const dinerToken = dinerRes?.tokens?.value ?? dinerRes?.tokens?.token ?? null;
  ok("fresh diner token issued", !!dinerToken);
  const dinerMe = callFn("users:currentUser", {}, dinerToken, "query");
  ok("fresh diner created", !!dinerMe?._id, dinerMe?._id);
  ok("fresh diner has NO password yet", dinerMe?.mustChangePassword !== true);

  // Non-admin cannot use the mutation.
  let blocked = false;
  try {
    callFn(
      "admin:setUserPassword",
      { userId: dinerMe._id, newPassword: "AdminSetPass123!" },
      dinerToken,
      "mutation",
    );
  } catch (e) {
    blocked = String(e.message).includes("Admins only");
  }
  ok("non-admin blocked from setUserPassword", blocked);

  // Admin (OTP login) sets the password for the fresh diner.
  callFn("auth:signIn", { provider: "phone-otp", params: { phone: "+96176683661" } }, null, "action");
  const adminCode = crackOtp("+96176683661");
  ok("admin OTP sent", adminCode !== null);
  const adminRes = callFn(
    "auth:signIn",
    { provider: "phone-otp", params: { phone: "+96176683661", code: adminCode } },
    null,
    "action",
  );
  const adminToken = adminRes?.tokens?.value ?? adminRes?.tokens?.token ?? null;
  ok("admin token issued", !!adminToken);

  const set = callFn(
    "admin:setUserPassword",
    { userId: dinerMe._id, newPassword: "AdminSetPass123!" },
    adminToken,
    "mutation",
  );
  ok("setUserPassword succeeded", set?.mustChangePassword === true, JSON.stringify(set));

  // The diner can now log in with the admin-set password (forced change flag on).
  const pwRes = callFn(
    "auth:signIn",
    {
      provider: "password",
      params: { phone, password: "AdminSetPass123!", flow: "signIn" },
    },
    null,
    "action",
  );
  const pwToken = pwRes?.tokens?.value ?? pwRes?.tokens?.token ?? null;
  ok("diner logs in with admin-set password", !!pwToken);
  const pwMe = callFn("users:currentUser", {}, pwToken, "query");
  ok("same user owns the new password account", pwMe?._id === dinerMe._id, pwMe?._id);
  ok("mustChangePassword is set (forced change on next login)", pwMe?.mustChangePassword === true);

  // Wrong password is still rejected.
  let badPw = false;
  try {
    callFn(
      "auth:signIn",
      { provider: "password", params: { phone, password: "WrongPass123!", flow: "signIn" } },
      null,
      "action",
    );
  } catch {
    badPw = true;
  }
  ok("wrong password rejected", badPw);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
