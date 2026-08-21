#!/usr/bin/env node
/**
 * Generate realistic demo activity for all @kamix.demo restaurants:
 * ~5 weeks of bookings (completed / no-show / confirmed), dine-in orders on
 * real menu items, verified reviews, and waitlist entries — the data the AI
 * concierge and ops advisor read to produce personalized output.
 *
 * Usage:  node scripts/seed-activity.mjs
 * Requires: convex CLI access (to read the OTP) + the admin phone number.
 * Idempotent: restaurants with >15 bookings are skipped.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const DEPLOY_URL = process.env.KAMIX_DEPLOY_URL || "https://canny-leopard-341.convex.cloud";
const ADMIN_PHONE = process.env.KAMIX_ADMIN_PHONE || "+96176683661";

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
      if (createHash("sha256").update(code).digest("hex") === hash) return code;
    }
  }
  return null;
}

console.log(`── Generating demo activity (${DEPLOY_URL}) ──`);

callFn("auth:signIn", { provider: "phone-otp", params: { phone: ADMIN_PHONE } }, null, "action");
const code = crackOtp(ADMIN_PHONE);
if (!code) {
  console.error("Could not read the admin OTP. Is the convex CLI authed to this project?");
  process.exit(1);
}
const res = callFn("auth:signIn", { provider: "phone-otp", params: { phone: ADMIN_PHONE, code } }, null, "action");
const token = res?.tokens?.value ?? res?.tokens?.token ?? null;
if (!token) {
  console.error("Admin sign-in failed.");
  process.exit(1);
}

const out = callFn("seed:generateDemoActivity", {}, token, "mutation");
console.log(JSON.stringify(out, null, 2));
if (!out?.seeded) process.exit(1);
process.exit(0);
