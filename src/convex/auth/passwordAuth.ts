import { Password } from "@convex-dev/auth/providers/Password";

/**
 * Password authentication provider that uses phone number as the identifier.
 * When a user signs up via OTP and sets a password, we store it under
 * their phone number so they can log in with phone+password next time.
 */
export const passwordAuth = Password({
  id: "password",
  // Map phone to email so the Password provider stores accounts by phone
  profile: (params) => ({
    email: params.phone as string,
  }),
});
