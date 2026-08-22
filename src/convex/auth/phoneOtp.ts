import { Phone } from "@convex-dev/auth/providers/Phone";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

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
  const alphabet = "0123456789";    return generateRandomString(random, alphabet, 6);
}

import { sendTwilioMessage } from "../twilio";

/**
 * Send an SMS OTP via Twilio. Graceful no-op when Twilio isn't configured.
 * Shared by the phone-otp sign-in provider and the password-reset flow.
 * KB-30: routes through the shared twilio.ts sender so the OTP path and the
 * notification actions share one credentials/behavior implementation.
 */
export async function sendOtpSms(phone: string, token: string): Promise<void> {
  const body = `Your Kamix verification code is: ${token}. It expires in 15 minutes.`;
  await sendTwilioMessage(phone, body);
}

export const phoneOtp = Phone({
  id: "phone-otp",
  maxAge: 60 * 15, // 15 minutes
  generateVerificationToken: generateOtpToken,
  async sendVerificationRequest({ identifier: phone, token }) {
    await sendOtpSms(phone, token);
  },
});
