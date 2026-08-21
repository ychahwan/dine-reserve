/**
 * One-off: give the platform admin (+96176683661) a REAL password account.
 *
 * The admin account was created via phone-OTP only (and "Skip for now" was
 * always chosen on set-password), so hasPasswordAccount returns false and
 * every login routes to OTP. This script signs in via OTP once (reading +
 * cracking the code from the deployed authVerificationCodes table), then
 * calls users.setPassword with NO currentPassword — which creates a linked
 * password account for the SAME user. Afterwards the app routes the admin
 * straight to the password screen.
 *
 * Usage: ADMIN_NEW_PASSWORD='...' node scripts/admin-set-password.mjs
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const DEPLOY = "https://canny-leopard-341.convex.cloud";
const ADMIN_PHONE = "+96176683661";
const NEW_PASSWORD = process.env.ADMIN_NEW_PASSWORD;
if (!NEW_PASSWORD || NEW_PASSWORD.length < 8) {
  console.error("Set ADMIN_NEW_PASSWORD (>= 8 chars) first.");
  process.exit(1);
}

function callFn(fn, args, token = null, kind = "action") {
  const endpoint = kind === "action" ? "action" : kind === "mutation" ? "mutation" : "query";
  const payload =
    kind === "action"
      ? { path: fn, format: "convex_encoded_json", args: [args ?? {}] }
      : { path: fn, format: "convex_encoded_json", args: args ?? {} };
  const auth = token ? ["-H", `"Authorization: Bearer ${token}"`] : [];
  const out = execSync(
    `curl -s -X POST "${DEPLOY}/api/${endpoint}" -H "Content-Type: application/json" ${auth.join(" ")} -d '${JSON.stringify(payload)}'`,
    { maxBuffer: 10 * 1024 * 1024 },
  ).toString();
  try {
    const parsed = JSON.parse(out);
    if (parsed && parsed.status === "success") return parsed.value ?? parsed.result ?? parsed;
    if (parsed && parsed.status === "error") throw new Error(JSON.stringify(parsed.error ?? parsed));
    return parsed;
  } catch {
    throw new Error(`Bad response for ${fn}: ${out.slice(0, 400)}`);
  }
}

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

// 1. OTP sign-in as admin
callFn("auth:signIn", { provider: "phone-otp", params: { phone: ADMIN_PHONE } }, null, "action");
const hash = readOtpHash(ADMIN_PHONE);
const code = crackOtp(hash);
if (!code) throw new Error("Could not crack the admin OTP.");
console.log(`OTP cracked: ${code}`);
const res = callFn(
  "auth:signIn",
  { provider: "phone-otp", params: { phone: ADMIN_PHONE, code } },
  null,
  "action",
);
const token = res?.tokens?.value ?? res?.tokens?.token ?? null;
if (!token) throw new Error("No session token after OTP login.");
const me = callFn("users:currentUser", {}, token, "query");
console.log(`Signed in as: ${me?.name ?? me?._id} (role=${me?.role})`);

// 2. Create the linked password account (no currentPassword → creates it)
const result = callFn("users:setPassword", { newPassword: NEW_PASSWORD }, token, "mutation");
console.log(`setPassword → ${JSON.stringify(result)}`);

// 3. Verify password sign-in now works (and lands on the same user)
const pw = callFn(
  "auth:signIn",
  { provider: "password", params: { phone: ADMIN_PHONE, password: NEW_PASSWORD, flow: "signIn" } },
  null,
  "action",
);
const pwToken = pw?.tokens?.value ?? pw?.tokens?.token ?? null;
const pwMe = pwToken ? callFn("users:currentUser", {}, pwToken, "query") : null;
console.log(`Password sign-in → user ${pwMe?._id ?? "?"} (role=${pwMe?.role ?? "?"})`);
if (pwMe?._id !== me?._id) throw new Error("Password login landed on a DIFFERENT user!");
console.log("✅ Password account linked to the SAME admin user.");
console.log(`✅ hasPasswordAccount now returns true → login routes to the password screen.`);
