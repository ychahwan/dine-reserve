import { Phone } from "@convex-dev/auth/providers/Phone";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import { internal } from "../_generated/api";
import { sendTwilioMessage } from "../twilio";

/**
 * Generate a 6-digit numeric verification token.
 * Shared by the phone-otp sign-in provider and the password-reset flow.
 */
export async function generateOtpToken(): Promise<string> {
  const random: RandomReader = {
    read(bytes: Uint8Array) {
      crypto.getRandomValues(bytes);
    },
  };
  const alphabet = "0123456789";
  return generateRandomString(random, alphabet, 6);
}

/**
 * H-11 (partial mitigation): per-phone rate limit on OTP *sends* so an
 * attacker cannot spam codes (or flood a victim's phone) via repeated
 * signIn attempts. The remaining gap is that token *verification* itself
 * is handled inside @convex-dev/auth with no attempt counter — a 6-digit
 * code within its validity window is still brute-forceable in theory;
 * mitigated by the short TTL below and the send cap. Documented tradeoff:
 * fixing it requires either upstream support or a custom credentials flow.
 * The backing limiter lives in rateLimit.ts (slash-free module path so the
 * generated `internal` API exposes it type-safely).
 */
export async function enforceOtpSendRateLimit(
  ctx: { runMutation: (ref: any, args: any) => Promise<any> },
  phone: string,
): Promise<void> {
  await ctx.runMutation(internal.rateLimit.checkOtpSendRateLimit, { phone });
}

/**
 * Send an SMS OTP via Twilio. Graceful no-op when Twilio isn't configured.
 * Shared by the phone-otp sign-in provider and the password-reset flow.
 * KB-30: routes through the shared twilio.ts sender so the OTP path and the
 * notification actions share one credentials/behavior implementation.
 * H-10: `ctx` must be threaded through from sendVerificationRequest so
 * admin-stored appSettings Twilio credentials are used; env stays as fallback.
 */
export async function sendOtpSms(
  phone: string,
  token: string,
  ctx?: { runQuery: (q: any, args: any) => Promise<any> },
): Promise<void> {
  const body = `Your Kamix verification code is: ${token}. It expires in 10 minutes.`;
  await sendTwilioMessage(phone, body, ctx);
}

export const phoneOtp = Phone({
  id: "phone-otp",
  maxAge: 60 * 10, // 10 minutes (H-11: shorter window shrinks brute-force time)
  generateVerificationToken: generateOtpToken,
  async sendVerificationRequest({ identifier: phone, token }, ctx) {
    await enforceOtpSendRateLimit(ctx, phone);
    await sendOtpSms(phone, token, ctx);
  },
});
