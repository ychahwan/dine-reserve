import { convexAuth } from "@convex-dev/auth/server";
import { phoneOtp } from "./auth/phoneOtp";
import { passwordAuth } from "./auth/passwordAuth";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [phoneOtp, passwordAuth],
});