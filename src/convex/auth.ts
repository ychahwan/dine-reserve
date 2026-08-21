import { convexAuth } from "@convex-dev/auth/server";
import { phoneOtp } from "./auth/phoneOtp";
import { passwordAuth } from "./auth/passwordAuth";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [phoneOtp, passwordAuth],
  callbacks: {
    /**
     * Disabled users cannot sign in — enforced server-side during the auth
     * flow, BEFORE a session or token is generated. The admin's
     * `admin.setUserDisabled` flag is checked here; when it's true the whole
     * sign-in fails with a clear message, so no JWT/session is ever issued.
     * New users (first-time signup) have `existingUserId === null` and are
     * never blocked.
     */
    afterUserCreatedOrUpdated: async (ctx, { existingUserId }) => {
      if (existingUserId === null) return;
      const user = await ctx.db.get(existingUserId);
      if (user?.disabled) {
        throw new Error("This account has been disabled. Contact support for help.");
      }
    },
  },
});