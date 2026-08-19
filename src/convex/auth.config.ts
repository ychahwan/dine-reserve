import type { AuthConfig } from "convex/server";

export default {
  providers: [
    // Convex Auth provider for this project's own sign-in (phone OTP /
    // guest, see src/convex/auth.ts). The deployment self-issues JWTs
    // (iss = CONVEX_SITE_URL, no `kid` header) validated via OIDC
    // discovery at `${domain}/.well-known/openid-configuration`.
    {
      domain: process.env.CONVEX_SITE_URL!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
