/**
 * One-shot script to authenticate as the admin via Convex Password provider
 * and test push notifications end-to-end.
 *
 * Usage: node scripts/test-push.mjs
 */
import { ConvexClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const CONVEX_URL = "https://canny-leopard-341.convex.cloud";

async function main() {
  const client = new ConvexClient(CONVEX_URL);

  // 1. Sign in via OTP: send the OTP
  console.log("Sending OTP to +96176683661...");
  try {
    await client.mutation(api.auth.signIn, {
      provider: "phone-otp",
      params: { phone: "+96176683661", flow: "signIn" },
    });
    console.log("OTP sent! Check the phone.");
  } catch (e) {
    console.log("OTP send result:", e.message || e);
  }

  // 2. Get the pending verification token
  // The OTP token is sent via SMS, so we need the user to provide it
  const code = process.argv[2];
  if (!code) {
    console.log("\nRe-run with: node scripts/test-push.mjs <OTP_CODE>");
    console.log("Example:     node scripts/test-push.mjs 123456");
    client.close();
    return;
  }

  console.log(`Verifying OTP code: ${code}...`);
  try {
    await client.mutation(api.auth.signIn, {
      provider: "phone-otp",
      params: { phone: "+96176683661", flow: "signIn", code },
    });
    console.log("Signed in successfully!");

    // 3. Check for tokens
    const tokens = await client.query(api.notifications.getAllActiveTokens);
    console.log("Active FCM tokens:", tokens.length);
    if (tokens.length > 0) {
      console.log("Sending test push notification...");
      const result = await client.action(api.notifications.broadcast, {
        title: "🔥 Kamix Test",
        body: "Push notifications are working end-to-end!",
      });
      console.log("Broadcast result:", result);
    } else {
      console.log("No tokens registered yet. Register from the Account page.");
    }
  } catch (e) {
    console.log("Sign-in error:", e.message || e);
  }

  client.close();
}

main().catch(console.error);
