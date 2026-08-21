/**
 * One-off: restore the platform admin role for +96176683661.
 * Signs in via the phone-otp flow (cracking the 6-digit code), then calls
 * admin:claimPlatformAdmin with the resulting token.
 * Run: node scripts/restore-admin.mjs
 */
import http from "node:http";
import https from "node:https";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const DEPLOY = "https://canny-leopard-341.convex.cloud";
const PHONE = "+96176683661";

function api(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(path, DEPLOY);
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        ...headers,
      },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => {
        try { resolve(JSON.parse(buf)); } catch { resolve(buf); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function readOtpHash() {
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
      if (doc.phoneVerified !== PHONE) continue;
      if (!latest || doc._creationTime > latest._creationTime) latest = doc;
    } catch { /* skip */ }
  }
  return latest?.code ?? null;
}

function crack(hash) {
  for (let i = 0; i < 1000000; i++) {
    const code = String(i).padStart(6, "0");
    if (createHash("sha256").update(code).digest("hex") === hash) return code;
  }
  return null;
}

async function main() {
  // 1. Send OTP
  console.log("1. Sending OTP to", PHONE);
  await api("/api/action", { path: "auth:signIn", args: { provider: "phone-otp", params: { phone: PHONE } } });

  // 2. Read + crack
  await new Promise((r) => setTimeout(r, 1500));
  const hash = readOtpHash();
  if (!hash) throw new Error("No OTP hash found for " + PHONE);
  const code = crack(hash);
  if (!code) throw new Error("Could not crack OTP");
  console.log("2. Cracked OTP:", code);

  // 3. Verify → token
  const verify = await api("/api/action", {
    path: "auth:signIn",
    args: { provider: "phone-otp", params: { phone: PHONE, flow: "VERIFY", code } },
  });
  const token = verify?.value?.tokens?.token;
  if (!token) {
    console.error("3. Verify failed:", JSON.stringify(verify).slice(0, 400));
    throw new Error("No token returned");
  }
  console.log("3. Got auth token");

  // 4. Claim admin (it's a mutation, not an action)
  const claim = await api("/api/mutation", {
    path: "admin:claimPlatformAdmin",
    args: {},
  }, { Authorization: `Bearer ${token}` });
  console.log("4. claimPlatformAdmin result:", JSON.stringify(claim, null, 2));
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
