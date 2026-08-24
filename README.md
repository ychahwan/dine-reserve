## Overview

**Kamix** — live restaurant availability & booking platform. Mobile-first web app (PWA-ready) wrapped for Android/iOS with Capacitor.

This project uses the following tech stack:
- Vite
- Typescript
- React Router v7 (all imports from `react-router` instead of `react-router-dom`)
- React 19 (for frontend components)
- Tailwind v4 (for styling)
- Shadcn UI (for UI components library)
- Lucide Icons (for icons)
- Convex (for backend & database)
- Convex Auth (for authentication)
- Twilio (SMS confirmations / waitlist alerts — graceful no-op without keys)
- Capacitor (Android APK + iOS app wrapper)

All relevant files live in the 'src' directory.

## Setup

This project is set up already and running on a cloud environment, as well as a convex development in the sandbox.

```bash
npm install
npm run dev          # http://localhost:5173
```

## Environment Variables

The project is set up with project specific CONVEX_DEPLOYMENT and VITE_CONVEX_URL environment variables on the client side.

The convex server has a separate set of environment variables that are accessible by the convex backend.

Currently, these variables include auth-specific keys: JWKS, JWT_PRIVATE_KEY, and SITE_URL.

## Run the full app with Docker / Docker Compose

The backend is your hosted Convex deployment, so `VITE_CONVEX_URL` must point at it
(find it in the Convex dashboard → Settings → Deployment URL, e.g. `https://<project>.convex.site`).

### 1. Configure the environment

```bash
cp .env.example .env
# → set VITE_CONVEX_URL to your Convex deployment URL
# → set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER (optional)
```

### 2. Production app (nginx, static bundle)

```bash
docker compose up --build -d        # http://localhost:5173
docker compose down                 # stop
```

### 3. Development with hot reload (optional)

```bash
docker compose --profile dev up --build -d    # http://localhost:5174
```

### 4. Android APK in Docker (no Android Studio needed)

```bash
npm run mobile:docker               # build image + compile APK in one command
# → apk/kamix-debug.apk
adb install apk/kamix-debug.apk     # install on a connected device
```

Notes:
- The Docker images only serve/build the **frontend**. The backend is your
  hosted Convex deployment, so `VITE_CONVEX_URL` must point at it.
- Twilio keys are read **server-side** by Convex actions. For the Freebuff/Convex cloud
  set them in the project's Keys/API keys tab, or run `npx convex env set TWILIO_ACCOUNT_SID …`
  (plus `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER`). The `.env` values are also forwarded
  to the container for self-hosted setups.

## Build the mobile apps (APK / iOS)

Kamix uses **Capacitor** to wrap the Vite build into native apps. The web bundle
is built with `npm run build` (which bakes `VITE_CONVEX_URL` in), then synced
into the native project and compiled.

### One-command builds

| Command | What it does | Output |
|---|---|---|
| `npm run mobile:convex` | **Full Convex pipeline**: push backend functions (`convex dev --once`) → web build with the live Convex URL → `cap add android` (once) → `cap sync` → Gradle `assembleDebug`. Requires JDK 17+ and Android SDK locally. | `apk/kamix-debug.apk` |
| `npm run mobile:docker` | **Docker build** — `docker compose build apk && docker compose run --rm apk`. No local JDK/SDK needed; everything (SDK + Gradle) runs in the container. Expects the Convex backend to already be deployed. | `apk/kamix-debug.apk` |
| `KAMIX_RELEASE=1 npm run mobile:convex` | Signed **production release** APK — set `KAMIX_KEYSTORE_FILE`, `KAMIX_KEYSTORE_PASS`, `KAMIX_KEY_ALIAS`, `KAMIX_KEY_PASS` to sign. Play Store ready. | `apk/kamix-release.apk` |

### Android APK

Local build (needs JDK 17+ and Android Studio / Android SDK):

```bash
npm run build:apk                    # or: ./scripts/build-apk.sh
# → apk/kamix-debug.apk
adb install apk/kamix-debug.apk
```

Or build the APK in Docker (no local SDK required):

```bash
npm run mobile:docker                # build image + compile + copy APK in one command
# → apk/kamix-debug.apk
adb install apk/kamix-debug.apk
```

### iOS (macOS + Xcode only — Apple licensing prevents Docker/Linux builds)

```bash
npm run build:ios                    # simulator build, no signing
# For a device / App Store build:
npm run mobile:open ios              # set Team + bundle id under Signing & Capabilities
KAMIX_IOS_DEST="generic/platform=iOS" npm run build:ios
# Archive: Xcode ▸ Product ▸ Archive
```

### Mobile build scripts

| Script | What it does |
|---|---|
| `./scripts/build-mobile.sh apk \| ios \| all` | Wrapper around both builds |
| `./scripts/build-mobile-convex.sh` | Convex pipeline: push backend → web build → `cap add android` (once) → `cap sync` → `./gradlew assembleDebug` (or signed `assembleRelease` with `KAMIX_RELEASE=1`) → `apk/kamix-debug.apk` / `apk/kamix-release.apk` |
| `./scripts/build-apk.sh` | Web build → `cap add android` (once) → `cap sync` → `./gradlew assembleDebug` → `apk/kamix-debug.apk` |
| `./scripts/build-ios.sh` | macOS check → web build → `cap add ios` (once) → `cap sync` → `xcodebuild` (simulator by default) |
| `npm run mobile:sync` | `npx cap sync` — copy the latest web build into native projects |
| `npm run mobile:open` | Open the native project in Android Studio / Xcode |

Mobile config lives in `capacitor.config.ts` (app id `com.kamix.app`, app name `Kamix`, `webDir: dist`).
Change the `appId` there before publishing to the stores.

# Using Authentication (Important!)

You must follow these conventions when using authentication.

## Auth is already set up.

All convex authentication functions are already set up. The auth currently uses email OTP and anonymous users, but can support more.

The email OTP configuration is defined in `src/convex/auth/emailOtp.ts`. DO NOT MODIFY THIS FILE.

Also, DO NOT MODIFY THESE AUTH FILES: `src/convex/auth.config.ts` and `src/convex/auth.ts`.

## Using Convex Auth on the backend

On the `src/convex/users.ts` file, you can use the `getCurrentUser` function to get the current user's data.

## Using Convex Auth on the frontend

The `/auth` page is already set up to use auth. Navigate to `/auth` for all log in / sign up sequences.

You MUST use this hook to get user data. Never do this yourself without the hook:
```typescript
import { useAuth } from "@/hooks/use-auth";

const { isLoading, isAuthenticated, user, signIn, signOut } = useAuth();
```

## Protected Routes

The starter `/dashboard` route is protected with `RequireAuth`, which sends
signed-out users to `/auth?returnTo=<current route>`. Extend that page for the
product's authenticated experience, and reuse `RequireAuth` when adding another
protected route.

## Auth Page

The auth page is defined in `src/pages/Auth.tsx`. Send sign-in and sign-up actions
to `/auth`.

## Authorization

You can perform authorization checks on the frontend and backend.

On the frontend, you can use the `useAuth` hook to get the current user's data and authentication state.

You should also be protecting queries, mutations, and actions at the base level, checking for authorization securely.

## Adding a redirect after auth

The `/auth` route in `src/main.tsx` redirects to `/dashboard` by default. If the
product's main authenticated route is different, update `redirectAfterAuth` to
that route. A validated same-origin `returnTo` query parameter takes priority so
users can resume the protected page they originally requested. Never leave an
authenticated product redirecting back to the public landing page.

## Complete authenticated products

When the requested product implies accounts, a workspace, a dashboard, or other
signed-in functionality, the task is not complete with only a landing page and
auth form. Build the main authenticated experience, protect its route, and verify
that signing in reaches it.

# Frontend Conventions

You will be using the Vite frontend with React 19, Tailwind v4, and Shadcn UI.

Generally, pages should be in the `src/pages` folder, and components should be in the `src/components` folder.

Shadcn primitives are located in the `src/components/ui` folder and should be used by default.

## Page routing

Your page component should go under the `src/pages` folder.

When adding a page, update the react router configuration in `src/main.tsx` to include the new route you just added.

## Shad CN conventions

Follow these conventions when using Shad CN components, which you should use by default.
- Remember to use "cursor-pointer" to make the element clickable
- For title text, use the "tracking-tight font-bold" class to make the text more readable
- Always make apps MOBILE RESPONSIVE. This is important
- AVOID NESTED CARDS. Try and not to nest cards, borders, components, etc. Nested cards add clutter and make the app look messy.
- AVOID SHADOWS. Avoid adding any shadows to components. stick with a thin border without the shadow.
- Avoid skeletons; instead, use the loader2 component to show a spinning loading state when loading data.


## Landing Pages

You must always create good-looking designer-level styles to your application. 
- Make it well animated and fit a certain "theme", ie neo brutalist, retro, neumorphism, glass morphism, etc

Use known images and emojis from online.

If the user is logged in already, show the get started button to say "Dashboard" or "Profile" instead to take them there.

## Responsiveness and formatting

Make sure pages are wrapped in a container to prevent the width stretching out on wide screens. Always make sure they are centered aligned and not off-center.

Always make sure that your designs are mobile responsive. Verify the formatting to ensure it has correct max and min widths as well as mobile responsiveness.

- Always create sidebars for protected dashboard pages and navigate between pages
- Always create navbars for landing pages
- On these bars, the created logo should be clickable and redirect to the index page

## Animating with Framer Motion

You must add animations to components using Framer Motion. It is already installed and configured in the project.

To use it, import the `motion` component from `framer-motion` and use it to wrap the component you want to animate.


### Other Items to animate
- Fade in and Fade Out
- Slide in and Slide Out animations
- Rendering animations
- Button clicks and UI elements

Animate for all components, including on landing page and app pages.

## Three JS Graphics

Your app comes with three js by default. You can use it to create 3D graphics for landing pages, games, etc.


## Colors

You can override colors in: `src/index.css`

This uses the oklch color format for tailwind v4.

Always use these color variable names.

Make sure all ui components are set up to be mobile responsive and compatible with both light and dark mode.

Set theme using `dark` or `light` variables at the parent className.

## Styling and Theming

When changing the theme, always change the underlying theme of the shad cn components app-wide under `src/components/ui` and the colors in the index.css file.

Avoid hardcoding in colors unless necessary for a use case, and properly implement themes through the underlying shad cn ui components.

When styling, ensure buttons and clickable items have pointer-click on them (don't by default).

Always follow a set theme style and ensure it is tuned to the user's liking.

## Toasts

You should always use toasts to display results to the user, such as confirmations, results, errors, etc.

Use the shad cn Sonner component as the toaster. For example:

```
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
export function SonnerDemo() {
  return (
    <Button
      variant="outline"
      onClick={() =>
        toast("Event has been created", {
          description: "Sunday, December 03, 2023 at 9:00 AM",
          action: {
            label: "Undo",
            onClick: () => console.log("Undo"),
          },
        })
      }
    >
      Show Toast
    </Button>
  )
}
```

Remember to import { toast } from "sonner". Usage: `toast("Event has been created.")`

## Dialogs

Always ensure your larger dialogs have a scroll in its content to ensure that its content fits the screen size. Make sure that the content is not cut off from the screen.

Ideally, instead of using a new page, use a Dialog instead. 

# Using the Convex backend

You will be implementing the convex backend. Follow your knowledge of convex and the documentation to implement the backend.

## The Convex Schema

You must correctly follow the convex schema implementation.

The schema is defined in `src/convex/schema.ts`.

Do not include the `_id` and `_creationTime` fields in your queries (it is included by default for each table).
Do not index `_creationTime` as it is indexed for you. Never have duplicate indexes.


## Convex Actions: Using CRUD operations

When running anything that involves external connections, you must use a convex action with "use node" at the top of the file.

You cannot have queries or mutations in the same file as a "use node" action file. Thus, you must use pre-built queries and mutations in other files.

You can also use the pre-installed internal crud functions for the database:

```ts
// in convex/users.ts
import { crud } from "convex-helpers/server/crud";
import schema from "./schema.ts";

export const { create, read, update, destroy } = crud(schema, "users");

// in some file, in an action:
const user = await ctx.runQuery(internal.users.read, { id: userId });

await ctx.runMutation(internal.users.update, {
  id: userId,
  patch: {
    status: "inactive",
  },
});
```


## Platform Administration & Moderation (ops)

The platform admin (`+96176683661`, password `BeityAdmin2026!` — change it after
first use) is the only account that can register restaurants, tag accounts as
restaurants, and moderate the platform. Everything an admin does is written to
the `adminAuditLog` table and visible in the admin console under **Audit log**.

### Roles
| Role | How it's assigned | What it can do |
|------|-------------------|----------------|
| **Admin** | Only the admin phone can claim it (`admin.claimPlatformAdmin`) | Register/tag restaurants, disable/delete users & restaurants, delete any review, clear the audit log |
| **Owner** | Admin creates via *Register restaurant* or *Tag owner* | Manage their restaurant, bookings, menu, orders, insights, Socialize settings |
| **Customer** | Self-registers via `/auth` (OTP) | Browse, book, order, socialize, review |

### Moderation actions (admin console → detail pages)
- **Users** (`/admin/users/:id` → *Moderation*): **Disable** locks the account
  immediately — existing sessions are revoked and every future sign-in attempt
  (even an OTP request) is rejected server-side. **Delete** cascade-erases the
  account and all its data (GDPR-style); owners must have their restaurants
  deleted first.
- **Restaurants** (`/admin/restaurants/:id` → *Moderation*): **Disable** hides
  the venue from Explore/search/stats, refuses new bookings, and treats it as
  closed — the owner still sees it. **Delete** permanently removes the venue and
  everything attached to it (sections, menus, bookings, reviews, stories, gifts).
- **Reviews** (`/admin/reviews`): any review can be deleted (audited).
  Customers can also delete their own reviews from the restaurant page.
- **Audit log** (`/admin/audit`): **Clear log** wipes the table; the clearing
  itself is kept as a single auditable entry.

## Socialize & Dine Security Model

The Socialize feature (diner-to-diner gifting and room visibility) has multiple
security layers to protect against abuse:

### Check-in Gate (Idea #1)
- Diners **must check in** at the restaurant before toggling visibility
- `setVisibility` calls `requireCheckedInBooking` — phantom bookings are blocked
- The visibility switch is disabled in the UI until check-in

### Restaurant Controls (Idea #8)
- Owners can **enable/disable** Socialize per venue
- Owners can set a **minimum completed-visit threshold** (0–50) for visibility
- Owners can **block specific users** from the Socialize room
- Settings are in the restaurant owner dashboard → Overview → Socialize room

### Soft Gate Progressive Access (Idea #3)
Three tiers tied to the real-world dining journey:

| Tier | Trigger | Access |
|------|---------|--------|
| **Booked** | Booking confirmed | Can only pre-set visibility preference |
| **Checked in** | Diner confirms arrival | See first names, send gifts, place orders |
| **Seated** | 15+ min after check-in | Full profiles, Taste Twins matching |

The tier is promoted lazily by `visibleDiners` when it detects `checkedInAt > 15min`.

## Stress Testing

Run a heavy seed to test the app with 100k users and 1000 restaurants:

```bash
npm run stress    # or: npx convex run seed:stressSeed
```

This creates:
- 1,000 restaurant owner accounts
- 99,000 diner accounts
- 1,000 restaurants with sections, menus, and gift catalogs
- ~10,000 bookings across the restaurants
- ~5,000 dine-in orders
- ~2,000 reviews

**Warning:** This is a heavy operation. Only run on a test deployment.

## Mobile Builds

### Android APK
```bash
npm run build                          # Build web app
npx cap sync                           # Sync with Capacitor
cd android && ./gradlew assembleDebug  # Build debug APK
# APK at: android/app/build/outputs/apk/debug/app-debug.apk
```

### iOS (macOS + Xcode only)
```bash
npm run build
npx cap sync
npx cap open ios                        # Opens Xcode
# Product → Archive to build release
```

## Firebase Push Notifications (FCM)

Kamix uses **Firebase Cloud Messaging (FCM)** to deliver push notifications to users' devices — booking confirmations, waitlist alerts, and special offers appear in the phone's notification tray even when the app is closed.

### How It Works

```
User taps "Enable Notifications" in Account → Permission granted → Token saved to Convex
                                                          ↓
Backend sends notification via Firebase → FCM delivers to device → Notification appears in tray
```

### Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"**
3. Enter project name: `kamix-notifications` (or any name you prefer)
4. Enable Google Analytics (optional)
5. Click **Create project**

### Step 2: Add Your Android App to Firebase

1. In Firebase Console, click the **Android icon** (Add app)
2. Enter package name: **`com.kamix.app`** (must match exactly)
3. Enter app nickname: `Kamix`
4. **Skip** SHA-1 for now (can add later for App Links)
5. Click **Register app**

### Step 3: Download google-services.json

1. Click **Download google-services.json**
2. Replace the placeholder file at:
   ```
   android/app/google-services.json
   ```

The file should look like this:

```json
{
  "project_info": {
    "project_number": "123456789",
    "project_id": "kamix-notifications",
    "storage_bucket": "kamix-notifications.appspot.com"
  },
  "client": [
    {
      "client_info": {
        "mobilesdk_app_id": "1:123456789:android:abcdef123456",
        "android_client_info": {
          "package_name": "com.kamix.app"
        }
      },
      "api_key": [
        {
          "current_key": "AIzaSyB...your_key_here"
        }
      ]
    }
  ],
  "configuration_version": "1"
}
```

### Step 4: Get Server Key for Backend

1. In Firebase Console, go to **Project Settings** (gear icon ⚙️)
2. Click **Cloud Messaging** tab
3. Copy the **Server key** (legacy)
4. Add to your `.env` file:
   ```
   FIREBASE_SERVER_KEY=your_server_key_here
   ```

### Step 5: Rebuild the App

```bash
# Sync Capacitor with latest web build
npx cap sync android

# Build signed release APK
cd android
./gradlew assembleRelease

# Copy to apk folder
cp app/build/outputs/apk/release/app-release.apk ../apk/kamix-release.apk
```

### Step 6: Test Push Notifications

#### Using Firebase Console (Easiest)

1. Go to **Firebase Console** → **Messaging** (left sidebar)
2. Click **New campaign** → **Notifications**
3. Enter title: "Booking Confirmed!"
4. Enter body: "Your table at Pizza Palace is reserved for 7PM tonight"
5. Select your app: `Kamix`
6. Click **Send test message** → Enter your device's FCM token
7. Click **Send**

#### Using cURL (Advanced)

```bash
curl -X POST \
  https://fcm.googleapis.com/fcm/send \
  -H "Authorization: key=YOUR_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "DEVICE_FCM_TOKEN",
    "notification": {
      "title": "Kamix",
      "body": "Your booking is confirmed!"
    },
    "data": {
      "bookingId": "12345",
      "type": "booking_confirmed"
    }
  }'
```

### Environment Variables

Add these to your `.env` file:

```env
# Firebase Configuration (from google-services.json)
VITE_FIREBASE_API_KEY=AIzaSyB...your_key
VITE_FIREBASE_AUTH_DOMAIN=kamix-notifications.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=kamix-notifications
VITE_FIREBASE_STORAGE_BUCKET=kamix-notifications.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:android:abcdef123456

# Server-side (for sending notifications from backend)
FIREBASE_SERVER_KEY=your_server_key_here
```

### Notification Types in Kamix

| Type | When Sent | Example |
|------|-----------|---------|
| `booking_confirmed` | Booking confirmed | "Your table at Pizza Palace is confirmed for 7PM" |
| `waitlist_freed` | Table becomes available | "Table for 4 is now available at Sushi Hub!" |
| `booking_reminder` | Day before booking | "Reminder: You have a reservation tomorrow at 8PM" |
| `special_offer` | Promotional | "20% off lunch today at Cafe Mocha" |

### Firebase Pricing

Firebase Cloud Messaging is **100% free** — no limits on notifications sent.

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "google-services.json not found" | Ensure file is at `android/app/google-services.json` |
| Notifications not appearing | Check device logs: `adb logcat | grep -i "firebase"` |
| Token not saving | Verify user is logged in and `FIREBASE_SERVER_KEY` is set |
| App crashes on startup | Verify package name `com.kamix.app` matches in Firebase Console |

### Files Involved

| File | Purpose |
|------|---------|
| `android/app/google-services.json` | Firebase configuration (download from console) |
| `src/components/NotificationHandler.tsx` | Handles notification lifecycle |
| `src/hooks/use-push-notifications.ts` | React hook for push notifications |
| `src/convex/notifications.ts` | Backend token management & sending |
| `src/convex/schema.ts` | `notificationTokens` table definition |
| `docs/FIREBASE_SETUP.md` | Detailed setup guide |

---

## Common Convex Mistakes To Avoid

When using convex, make sure:
- Document IDs are referenced as `_id` field, not `id`.
- Document ID types are referenced as `Id<"TableName">`, not `string`.
- Document object types are referenced as `Doc<"TableName">`.
- Keep schemaValidation to false in the schema file.
- You must correctly type your code so that it passes the type checker.
- You must handle null / undefined cases of your convex queries for both frontend and backend, or else it will throw an error that your data could be null or undefined.
- Always use the `@/folder` path, with `@/convex/folder/file.ts` syntax for importing convex files.
- This includes importing generated files like `@/convex/_generated/server`, `@/convex/_generated/api`
- Remember to import functions like useQuery, useMutation, useAction, etc. from `convex/react`
- NEVER have return type validators.
