import { Phone } from "@convex-dev/auth/providers/Phone";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import type { FunctionArgs, FunctionReference } from "convex/server";
import { internal } from "../_generated/api";
import { sendTwilioMessage } from "../twilio";
import { assertOtpCode } from "../sms";
import type { SettingsReaderCtx } from "../settings";

/** Minimal shape of a MutationCtx needed to run the OTP-send rate limit. */
type RateLimitCtx = {
  runMutation: <
    Mutation extends FunctionReference<"mutation", "public" | "internal">,
  >(
    ref: Mutation,
    args: FunctionArgs<Mutation>,
  ) => Promise<void>;
};

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
 * Sending is limited per destination and deployment-wide. Verification is
 * bounded by @convex-dev/auth's authRateLimits implementation, which records
 * each failed code attempt by identifier before returning from the auth store.
 * The installed API exposes its threshold only on the top-level convexAuth
 * config, outside provider hooks; the shorter challenge below further limits
 * exposure without replacing the library's atomic verification flow.
 */
export async function enforceOtpSendRateLimit(
  ctx: RateLimitCtx,
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
  ctx?: SettingsReaderCtx,
): Promise<void> {
  assertOtpCode(token);
  const body = `Your Kamix verification code is: ${token}. It expires in 5 minutes.`;
  await sendTwilioMessage(phone, body, ctx);
}

export const phoneOtp = Phone({
  id: "phone-otp",
  maxAge: 60 * 5,
  generateVerificationToken: generateOtpToken,
  async sendVerificationRequest({ identifier: phone, token }, ctx) {
    await enforceOtpSendRateLimit(ctx, phone);
    await sendOtpSms(phone, token, ctx);
  },
});
