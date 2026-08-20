import { Password } from "@convex-dev/auth/providers/Password";
import { Phone } from "@convex-dev/auth/providers/Phone";
import { sendOtpSms, generateOtpToken } from "./phoneOtp";

/**
 * Password authentication provider that uses phone number as the identifier.
 * When a user signs up via OTP and sets a password, we store it under
 * their phone number so they can log in with phone+password next time.
 *
 * `reset` wires the built-in "forgot password" flow (`flow: "reset"` sends
 * an SMS OTP, `flow: "reset-verification"` verifies it and sets the new
 * password) through the same phone OTP channel as first-time sign-in.
 *
 * Note: the library's TS types only expose `EmailConfig` for `reset`, but
 * at runtime `signInViaProvider` materializes any provider and dispatches by
 * type — a Phone provider works identically (and this app has no email).
 */
export const passwordAuth = Password({
  id: "password",
  // Map phone to email so the Password provider stores accounts by phone
  profile: (params) => ({
    email: params.phone as string,
  }),
  reset: Phone({
    id: "password-reset",
    maxAge: 60 * 15, // 15 minutes
    generateVerificationToken: generateOtpToken,
    async sendVerificationRequest({ identifier: phone, token }) {
      await sendOtpSms(phone, token);
    },
  }) as never,
});
