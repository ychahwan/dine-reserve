import type { AuthConfig } from "convex/server";

// L-22: fail fast with a clear message instead of a cryptic runtime auth
// failure when the deployment URL is missing.
const siteUrl = process.env.CONVEX_SITE_URL;
if (!siteUrl) {
  throw new Error(
    "CONVEX_SITE_URL is not set — authentication cannot be configured.",
  );
}

export default {
  providers: [
    // Convex Auth provider for this project's own sign-in (phone OTP /
    // guest, see src/convex/auth.ts). The deployment self-issues JWTs
    // (iss = CONVEX_SITE_URL, no `kid` header) validated via OIDC
    // discovery at `${domain}/.well-known/openid-configuration`.
    {
      domain: siteUrl,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
