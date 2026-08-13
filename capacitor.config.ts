import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Kamix — mobile wrapper config (Capacitor).
 *
 * The app is a normal Vite web app; Capacitor wraps the production build
 * (`dist/`) into a native Android/iOS shell. The backend stays in Convex —
 * the VITE_CONVEX_URL baked into the bundle at `npm run build` time is what
 * the app talks to, so the same app binary works in the browser and on device.
 */
const config: CapacitorConfig = {
  appId: "com.kamix.app",
  appName: "Kamix",
  webDir: "dist",

  android: {
    // Serve the web assets over https:// inside the WebView (required for
    // service workers / secure fetch to the Convex deployment).
    allowMixedContent: false,
  },

  ios: {
    contentInset: "automatic",
  },

  server: {
    androidScheme: "https",
  },
};

export default config;
