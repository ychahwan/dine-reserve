import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Kamix — mobile wrapper config (Capacitor).
 *
 * The app is a normal Vite web app; Capacitor wraps the production build
 * (`dist/`) into a native Android/iOS shell. The backend stays in Convex —
 * the VITE_CONVEX_URL baked into the bundle at `npm run build` time is what
 * the app talks to, so the same app binary works in the browser and on device.
 *
 * Build modes:
 *   KAMIX_LOCAL=1  → http scheme, mixed content allowed (local backend)
 *   (default)      → https scheme, mixed content blocked (hosted backend)
 */
const isLocal = process.env.KAMIX_LOCAL === "1";

const config: CapacitorConfig = {
  appId: "com.kamix.app",
  appName: "Kamix",
  webDir: "dist",

  android: {
    // Local mode: allow http fetches from https origin (mixed content).
    // Hosted mode: block mixed content (secure by default).
    allowMixedContent: isLocal,
  },

  ios: {
    contentInset: "automatic",
  },

  server: {
    // Local mode: use http scheme so the WebView origin is http://localhost,
    // which avoids mixed content issues when the backend is plain http.
    // Hosted mode: use https for service workers and secure contexts.
    androidScheme: isLocal ? "http" : "https",
  },
};

export default config;
